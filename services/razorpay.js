const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create a Razorpay order
const createOrder = async (amount, orderId) => {
  return await razorpay.orders.create({
    amount: amount * 100, // paise
    currency: "INR",
    receipt: `bb_${orderId}`,
    notes: { store: "BrightBasics" },
  });
};

// Verify payment signature
const verifyPayment = (razorpayOrderId, razorpayPaymentId, signature) => {
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
  return expected === signature;
};

// Verify webhook signature
const verifyWebhook = (body, signature) => {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest("hex");
  return expected === signature;
};

module.exports = { createOrder, verifyPayment, verifyWebhook };
