const router = require("express").Router();
const pool = require("../db");
const { adminAuth } = require("../middleware/auth");

// All admin routes require admin key
router.use(adminAuth);

// ── DASHBOARD ─────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  try {
    const [gmv, orders, users, lowStock] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(total),0) as gmv FROM orders WHERE payment_status='paid'"),
      pool.query("SELECT COUNT(*) as total, COUNT(CASE WHEN created_at > NOW()-INTERVAL '30 days' THEN 1 END) as this_month FROM orders"),
      pool.query("SELECT COUNT(*) as total FROM users WHERE is_verified=true"),
      pool.query("SELECT id, name, emoji, stock FROM products WHERE stock < 10 AND is_active=true ORDER BY stock ASC LIMIT 10"),
    ]);

    const { rows: recentOrders } = await pool.query(
      `SELECT o.order_number, o.total, o.order_status, o.payment_method, o.created_at, u.phone
       FROM orders o JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC LIMIT 10`
    );

    res.json({
      gmv: parseInt(gmv.rows[0].gmv),
      orders: orders.rows[0],
      users: parseInt(users.rows[0].total),
      low_stock: lowStock.rows,
      recent_orders: recentOrders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PRODUCTS ──────────────────────────────────────────────────
router.get("/products", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/products", async (req, res) => {
  const {
    name, description, category_id, emoji, price, mrp, stock,
    age_min, age_max, age_label, is_bis_certified, bis_cert_number,
    badge, special_need, is_featured, weight_grams, images, tags
  } = req.body;

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  try {
    const { rows } = await pool.query(
      `INSERT INTO products
        (name,slug,description,category_id,emoji,price,mrp,stock,age_min,age_max,
         age_label,is_bis_certified,bis_cert_number,badge,special_need,is_featured,
         weight_grams,images,tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [name,slug,description,category_id,emoji,price,mrp,stock,age_min,age_max,
       age_label,is_bis_certified,bis_cert_number,badge,special_need,is_featured,
       weight_grams || 500, images || [], tags || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/products/:id", async (req, res) => {
  const fields = req.body;
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = Object.values(fields);
  try {
    const { rows } = await pool.query(
      `UPDATE products SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    await pool.query("UPDATE products SET is_active = false WHERE id = $1", [req.params.id]);
    res.json({ message: "Product deactivated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ORDERS ────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  try {
    let where = status ? `WHERE o.order_status = '${status}'` : "";
    const { rows } = await pool.query(
      `SELECT o.*, u.phone, u.name as customer_name,
              a.city, a.state
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN addresses a ON o.address_id = a.id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/orders/:id/status", async (req, res) => {
  const { order_status, tracking_url, shiprocket_awb } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET order_status = $1, tracking_url = $2,
        shiprocket_awb = COALESCE($3, shiprocket_awb), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [order_status, tracking_url, shiprocket_awb, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── INVENTORY ─────────────────────────────────────────────────
router.put("/inventory/:id", async (req, res) => {
  const { stock } = req.body;
  try {
    const { rows } = await pool.query(
      "UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, stock",
      [stock, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── USERS ─────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.*, COUNT(o.id) as order_count, COALESCE(SUM(o.total),0) as lifetime_value
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id AND o.payment_status = 'paid'
       WHERE u.is_verified = true
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── COUPONS ───────────────────────────────────────────────────
router.get("/coupons", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM coupons ORDER BY created_at DESC");
  res.json(rows);
});

router.post("/coupons", async (req, res) => {
  const { code, discount_pct, min_order, max_uses, valid_until } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO coupons (code, discount_pct, min_order, max_uses, valid_until)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [code.toUpperCase(), discount_pct, min_order || 0, max_uses || 100, valid_until]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── ANALYTICS ─────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const [revenue, topProducts, ordersByStatus] = await Promise.all([
      pool.query(`
        SELECT
          DATE_TRUNC('day', created_at) as date,
          SUM(total) as revenue, COUNT(*) as orders
        FROM orders WHERE payment_status = 'paid'
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
      `),
      pool.query(`
        SELECT p.name, p.emoji, SUM(oi.qty) as units_sold, SUM(oi.total) as revenue
        FROM order_items oi JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.payment_status = 'paid'
        GROUP BY p.id ORDER BY units_sold DESC LIMIT 10
      `),
      pool.query(`
        SELECT order_status, COUNT(*) as count FROM orders GROUP BY order_status
      `),
    ]);

    res.json({
      revenue_chart: revenue.rows,
      top_products: topProducts.rows,
      orders_by_status: ordersByStatus.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
