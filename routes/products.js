const router = require("express").Router();
const pool = require("../db");

// GET /api/products — list with filters
router.get("/", async (req, res) => {
  try {
    const {
      category, age_min, age_max, min_price, max_price,
      min_rating, special_need, featured, search,
      sort = "popular", page = 1, limit = 16
    } = req.query;

    let where = ["p.is_active = true"];
    let params = [];
    let i = 1;

    if (category) { where.push(`c.slug = $${i++}`); params.push(category); }
    if (age_min)  { where.push(`p.age_max >= $${i++}`); params.push(age_min); }
    if (age_max)  { where.push(`p.age_min <= $${i++}`); params.push(age_max); }
    if (min_price){ where.push(`p.price >= $${i++}`); params.push(min_price); }
    if (max_price){ where.push(`p.price <= $${i++}`); params.push(max_price); }
    if (min_rating){ where.push(`p.rating >= $${i++}`); params.push(min_rating); }
    if (special_need){ where.push(`p.special_need = $${i++}`); params.push(special_need); }
    if (featured) { where.push(`p.is_featured = true`); }
    if (search)   { where.push(`p.name ILIKE $${i++}`); params.push(`%${search}%`); }

    const orderMap = {
      popular:    "p.sold_count DESC",
      rating:     "p.rating DESC",
      "price-low":"p.price ASC",
      "price-high":"p.price DESC",
      newest:     "p.created_at DESC",
    };
    const orderBy = orderMap[sort] || "p.sold_count DESC";

    const offset = (page - 1) * limit;
    const whereStr = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereStr}
      ORDER BY ${orderBy}
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereStr}
    `;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)),
    ]);

    res.json({
      products: rows,
      total: parseInt(countRows[0].count),
      page: parseInt(page),
      pages: Math.ceil(countRows[0].count / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:slug
router.get("/:slug", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.slug = $1 AND p.is_active = true`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found" });

    // Get reviews
    const { rows: reviews } = await pool.query(
      `SELECT r.*, u.name as user_name FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = $1 ORDER BY r.created_at DESC LIMIT 10`,
      [rows[0].id]
    );

    res.json({ ...rows[0], reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/categories/all
router.get("/categories/all", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(p.id) as product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
       GROUP BY c.id ORDER BY c.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/:id/review — add review (auth required)
router.post("/:id/review", require("../middleware/auth").auth, async (req, res) => {
  const { rating, title, body, order_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO reviews (product_id, user_id, order_id, rating, title, body, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (product_id, user_id) DO UPDATE
       SET rating = $4, title = $5, body = $6, updated_at = NOW()
       RETURNING *`,
      [req.params.id, req.user.id, order_id, rating, title, body, !!order_id]
    );

    // Update product average rating
    await pool.query(
      `UPDATE products SET
        rating = (SELECT AVG(rating) FROM reviews WHERE product_id = $1),
        review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = $1)
       WHERE id = $1`,
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
