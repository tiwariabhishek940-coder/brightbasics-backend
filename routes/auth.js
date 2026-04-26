const router = require("express").Router();
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { sendOTP } = require("../services/email");
const axios = require("axios");

// Generate 6-digit OTP
const genOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Send OTP via MSG91 SMS
const sendSMSOTP = async (phone, otp) => {
  try {
    await axios.post("https://api.msg91.com/api/v5/otp", {
      template_id: process.env.MSG91_TEMPLATE_ID,
      mobile: `91${phone}`,
      authkey: process.env.MSG91_AUTH_KEY,
      otp,
    });
  } catch (err) {
    console.error("SMS OTP failed:", err.message);
  }
};

// POST /api/auth/send-otp
router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: "Valid 10-digit phone number required" });
  }
  try {
    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    // Upsert user
    await pool.query(
      `INSERT INTO users (phone, otp, otp_expires)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET otp = $2, otp_expires = $3`,
      [phone, otp, expires]
    );

    await sendSMSOTP(phone, otp);

    // In dev, return OTP in response
    const devOtp = process.env.NODE_ENV !== "production" ? { otp } : {};
    res.json({ message: "OTP sent successfully", ...devOtp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE phone = $1 AND otp = $2 AND otp_expires > NOW()",
      [phone, otp]
    );
    if (!rows.length) return res.status(400).json({ error: "Invalid or expired OTP" });

    const user = rows[0];

    // Mark verified, clear OTP
    await pool.query(
      "UPDATE users SET is_verified = true, otp = null, otp_expires = null WHERE id = $1",
      [user.id]
    );

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email },
      isNewUser: !user.name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/profile — update name/email after first login
router.put("/profile", require("../middleware/auth").auth, async (req, res) => {
  const { name, email } = req.body;
  try {
    const { rows } = await pool.query(
      "UPDATE users SET name = $1, email = $2, updated_at = NOW() WHERE id = $3 RETURNING id, name, phone, email",
      [name, email, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", require("../middleware/auth").auth, async (req, res) => {
  res.json(req.user);
});

module.exports = router;
