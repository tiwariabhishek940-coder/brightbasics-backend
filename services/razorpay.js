const Razorpay = require("razorpay");
const crypto = require("crypto");

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const createOrder = async (amount, orderId) => {
  const razorpay = getRazorpay();
  if (!razorpay) throw new Error("Razorpay not configured");
  return await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
    receipt: b_,
  });
};

const verifyPayment = (razorpayOrderId, razorpayPaymentId, signature) => {
  const body = ${razorpayOrderId}|;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
  return expected === signature;
};

const verifyWebhook = (body, signature) => {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(JSON.stringify(body)).digest("hex");
  return expected === signature;
};

module.exports = { createOrder, verifyPayment, verifyWebhook };
