const jwt = require("jsonwebtoken");
const pool = require("../db");

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query("SELECT id, name, phone, email FROM users WHERE id = $1", [decoded.id]);
    if (!rows.length) return res.status(401).json({ error: "User not found" });

    req.user = rows[0];
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

const adminAuth = (req, res, next) => {
  const key = req.headers["x-admin-key"];
  if (key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: "Admin access denied" });
  }
  next();
};

module.exports = { auth, adminAuth };
