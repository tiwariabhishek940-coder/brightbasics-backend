const router = require("express").Router();
const pool = require("../db");
const { auth } = require("../middleware/auth");
const { checkServiceability } = require("../services/shiprocket");

// ── COUPON VALIDATION ─────────────────────────────────────────
router.post("/coupons/validate", async (req, res) => {
  const { code, subtotal } = req.body;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM coupons
       WHERE code = $1 AND is_active = true
         AND (valid_until IS NULL OR valid_until > NOW())
         AND used_count < max_uses
         AND min_order <= $2`,
      [code.toUpperCase(), subtotal]
    );
    if (!rows.length) return res.status(400).json({ error: "Invalid or expired coupon" });

    const discount = Math.round(subtotal * rows[0].discount_pct / 100);
    res.json({ valid: true, discount_pct: rows[0].discount_pct, discount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WISHLIST ──────────────────────────────────────────────────
router.get("/wishlist", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.* FROM wishlists w
       JOIN products p ON w.product_id = p.id
       WHERE w.user_id = $1`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/wishlist/:product_id", auth, async (req, res) => {
  try {
    await pool.query(
      "INSERT INTO wishlists (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [req.user.id, req.params.product_id]
    );
    res.json({ added: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/wishlist/:product_id", auth, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2",
      [req.user.id, req.params.product_id]
    );
    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PINCODE SERVICEABILITY ────────────────────────────────────
router.get("/pincode/:pincode", async (req, res) => {
  try {
    const data = await checkServiceability(req.params.pincode);
    res.json(data);
  } catch (err) {
    // Fallback — most pincodes work
    res.json({ serviceable: true });
  }
});

// ── WHATSAPP SUBSCRIBE ────────────────────────────────────────
router.post("/wa-subscribe", async (req, res) => {
  const { phone, child_age } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: "Valid phone number required" });
  }
  try {
    await pool.query(
      `INSERT INTO wa_subscribers (phone, child_age) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [phone, child_age]
    );
    res.json({ success: true, message: "Subscribed to WhatsApp age alerts!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BUNDLES ───────────────────────────────────────────────────
router.get("/bundles", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM bundles WHERE is_active = true ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
