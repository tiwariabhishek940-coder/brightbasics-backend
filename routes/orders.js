const router = require("express").Router();
const pool = require("../db");
const { auth } = require("../middleware/auth");
const { createOrder, verifyPayment } = require("../services/razorpay");
const { createShiprocketOrder } = require("../services/shiprocket");
const { sendOrderConfirmation } = require("../services/email");

// Generate order number: BB + timestamp
const genOrderNumber = () => `BB${Date.now().toString().slice(-8)}`;

// ── POST /api/orders/create — initiate order + Razorpay order ──
router.post("/create", auth, async (req, res) => {
  const { items, address_id, coupon_code, payment_method, delivery_type } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validate and calculate items
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const { rows } = await client.query(
        "SELECT * FROM products WHERE id = $1 AND is_active = true",
        [item.product_id]
      );
      if (!rows.length) throw new Error(`Product ${item.product_id} not found`);
      const product = rows[0];
      if (product.stock < item.qty) throw new Error(`${product.name} is out of stock`);

      subtotal += product.price * item.qty;
      validatedItems.push({ ...product, qty: item.qty });
    }

    // Apply coupon
    let discount = 0;
    if (coupon_code) {
      const { rows: coupons } = await client.query(
        `SELECT * FROM coupons WHERE code = $1 AND is_active = true
         AND (valid_until IS NULL OR valid_until > NOW())
         AND used_count < max_uses AND min_order <= $2`,
        [coupon_code.toUpperCase(), subtotal]
      );
      if (coupons.length) {
        discount = Math.round(subtotal * coupons[0].discount_pct / 100);
      }
    }

    // Delivery fee
    const afterDiscount = subtotal - discount;
    let delivery_fee = 0;
    if (afterDiscount < 599) {
      delivery_fee = delivery_type === "express" ? 149 : 59;
    } else if (delivery_type === "express") {
      delivery_fee = 149;
    }

    const total = afterDiscount + delivery_fee;

    // Get address
    const { rows: addrRows } = await client.query(
      "SELECT * FROM addresses WHERE id = $1 AND user_id = $2",
      [address_id, req.user.id]
    );
    if (!addrRows.length) throw new Error("Address not found");
    const address = addrRows[0];

    const order_number = genOrderNumber();

    // Create order in DB
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
        (order_number, user_id, address_id, subtotal, discount, delivery_fee, total, coupon_code, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [order_number, req.user.id, address_id, subtotal, discount, delivery_fee, total, coupon_code, payment_method]
    );
    const order = orderRows[0];

    // Insert order items + reduce stock
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, emoji, price, qty, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, item.id, item.name, item.emoji, item.price, item.qty, item.price * item.qty]
      );
      await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2",
        [item.qty, item.id]
      );
    }

    await client.query("COMMIT");

    // If COD — skip Razorpay
    if (payment_method === "cod") {
      await pool.query(
        "UPDATE orders SET payment_status = $1, order_status = $2 WHERE id = $3",
        ["pending", "confirmed", order.id]
      );

      // Create Shiprocket order
      try {
        const srOrder = await createShiprocketOrder(
          { ...order, email: req.user.email },
          validatedItems.map(i => ({ ...i, product_id: i.id })),
          address
        );
        await pool.query(
          "UPDATE orders SET shiprocket_order_id = $1 WHERE id = $2",
          [srOrder.order_id, order.id]
        );
      } catch (e) {
        console.error("Shiprocket error:", e.message);
      }

      return res.json({ success: true, order_number, payment_method: "cod" });
    }

    // Razorpay order
    const rzpOrder = await createOrder(total, order.id);
    await pool.query(
      "UPDATE orders SET razorpay_order_id = $1 WHERE id = $2",
      [rzpOrder.id, order.id]
    );

    res.json({
      razorpay_order_id: rzpOrder.id,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
      amount: total,
      order_number,
      order_id: order.id,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/orders/verify-payment ──
router.post("/verify-payment", auth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

  const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) return res.status(400).json({ error: "Invalid payment signature" });

  try {
    await pool.query(
      `UPDATE orders SET
        payment_status = 'paid',
        order_status = 'confirmed',
        razorpay_payment_id = $1
       WHERE id = $2`,
      [razorpay_payment_id, order_id]
    );

    // Fetch full order for Shiprocket + email
    const { rows } = await pool.query(
      `SELECT o.*, a.name, a.phone, a.address, a.city, a.state, a.pincode
       FROM orders o JOIN addresses a ON o.address_id = a.id
       WHERE o.id = $1`,
      [order_id]
    );
    const order = rows[0];

    const { rows: items } = await pool.query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [order_id]
    );

    // Shiprocket
    try {
      const srOrder = await createShiprocketOrder(
        { ...order, email: req.user.email },
        items,
        order
      );
      await pool.query(
        "UPDATE orders SET shiprocket_order_id = $1, shiprocket_awb = $2 WHERE id = $3",
        [srOrder.order_id, srOrder.awb_code, order_id]
      );
    } catch (e) {
      console.error("Shiprocket error:", e.message);
    }

    // Email confirmation
    if (req.user.email) {
      try {
        await sendOrderConfirmation({ ...order, email: req.user.email }, items, order);
      } catch (e) {
        console.error("Email error:", e.message);
      }
    }

    // Increment coupon usage
    if (order.coupon_code) {
      await pool.query(
        "UPDATE coupons SET used_count = used_count + 1 WHERE code = $1",
        [order.coupon_code]
      );
    }

    res.json({ success: true, order_number: order.order_number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/orders — user's order history ──
router.get("/", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, json_agg(oi.*) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/orders/:order_number — single order ──
router.get("/:order_number", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, a.name, a.phone, a.address, a.city, a.state, a.pincode
       FROM orders o JOIN addresses a ON o.address_id = a.id
       WHERE o.order_number = $1 AND o.user_id = $2`,
      [req.params.order_number, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });

    const { rows: items } = await pool.query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [rows[0].id]
    );

    res.json({ ...rows[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/orders/track/:awb ──
router.get("/track/:awb", auth, async (req, res) => {
  try {
    const { getTracking } = require("../services/shiprocket");
    const data = await getTracking(req.params.awb);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/orders/addresses — save address ──
router.post("/addresses", auth, async (req, res) => {
  const { name, phone, address, city, state, pincode, is_default } = req.body;
  try {
    if (is_default) {
      await pool.query("UPDATE addresses SET is_default = false WHERE user_id = $1", [req.user.id]);
    }
    const { rows } = await pool.query(
      `INSERT INTO addresses (user_id, name, phone, address, city, state, pincode, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, name, phone, address, city, state, pincode, is_default || false]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/orders/addresses/all ──
router.get("/addresses/all", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
