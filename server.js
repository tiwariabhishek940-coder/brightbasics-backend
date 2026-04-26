require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "https://brightbasics.netlify.app",
  ],
  credentials: true,
}));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: "Too many OTP requests. Try again in 15 minutes." },
}));

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Slow down." },
}));

// ── ROUTES ────────────────────────────────────────────────────
app.use("/api/auth",     require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/orders",   require("./routes/orders"));
app.use("/api/admin",    require("./routes/admin"));
app.use("/api",          require("./routes/misc"));

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "BrightBasics API",
    version: "1.0.0",
    env: process.env.NODE_ENV,
    time: new Date().toISOString(),
  });
});

// ── RAZORPAY WEBHOOK ─────────────────────────────────────────
app.post("/webhook/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const { verifyWebhook } = require("./services/razorpay");
    const signature = req.headers["x-razorpay-signature"];
    if (!verifyWebhook(req.body, signature)) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
    const event = JSON.parse(req.body);
    console.log("Razorpay webhook:", event.event);
    res.json({ received: true });
  }
);

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.path} not found` });
});

// ── ERROR HANDLER ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong" });
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🌟 BrightBasics API Running         ║
  ║   Port  : ${PORT}                        ║
  ║   Env   : ${process.env.NODE_ENV || "development"}              ║
  ║   Health: http://localhost:${PORT}/health ║
  ╚═══════════════════════════════════════╝
  `);
});

module.exports = app;
