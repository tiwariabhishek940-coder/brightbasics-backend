const Razorpay = require('razorpay');
const crypto = require('crypto');

const createOrder = async (amount, orderId) => {
  if (!process.env.RAZORPAY_KEY_ID) throw new Error('Razorpay not configured');
  const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return await rzp.orders.create({
    amount: amount * 100,
    currency: 'INR',
    receipt: 'bb_' + orderId,
  });
};

const verifyPayment = (orderId, paymentId, signature) => {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(orderId + '|' + paymentId)
    .digest('hex');
  return expected === signature;
};

const verifyWebhook = (body, signature) => {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  return expected === signature;
};

module.exports = { createOrder, verifyPayment, verifyWebhook };