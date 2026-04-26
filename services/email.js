const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendOrderConfirmation = async (order, items, address) => {
  const itemsHtml = items.map(i =>
    `<tr>
      <td>${i.emoji} ${i.name}</td>
      <td style="text-align:center">${i.qty}</td>
      <td style="text-align:right">₹${(i.price * i.qty).toLocaleString()}</td>
    </tr>`
  ).join("");

  await transporter.sendMail({
    from: `BrightBasics <${process.env.FROM_EMAIL}>`,
    to: order.email,
    subject: `Order Confirmed! #${order.order_number} 🎉`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#00A99D;padding:24px;text-align:center">
          <h1 style="color:white;margin:0">🌟 BrightBasics</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">India's Curated Kids' Store</p>
        </div>
        <div style="padding:32px;background:#f9f9f9">
          <h2 style="color:#1A3A3A">Order Confirmed! 🎉</h2>
          <p style="color:#555">Hi ${address.name}, your order has been placed successfully.</p>
          <div style="background:white;border-radius:12px;padding:20px;margin:20px 0;border:1px solid #eee">
            <p style="color:#00A99D;font-weight:bold;margin:0 0 4px">Order ID</p>
            <p style="font-size:22px;font-weight:bold;color:#1A3A3A;margin:0">#${order.order_number}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <thead>
              <tr style="background:#f0f0f0">
                <th style="padding:10px;text-align:left">Product</th>
                <th style="padding:10px;text-align:center">Qty</th>
                <th style="padding:10px;text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr style="border-top:2px solid #eee">
                <td colspan="2" style="padding:10px;font-weight:bold">Total</td>
                <td style="padding:10px;text-align:right;font-weight:bold;color:#FF6B1A">₹${order.total.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
          <div style="background:white;border-radius:12px;padding:20px;border:1px solid #eee">
            <p style="font-weight:bold;color:#1A3A3A;margin:0 0 8px">Delivering to:</p>
            <p style="color:#555;margin:0">${address.address}, ${address.city}, ${address.state} – ${address.pincode}</p>
          </div>
          <p style="color:#888;font-size:13px;margin-top:24px">Expected delivery: 3–5 business days via Shiprocket. You'll receive a tracking link via SMS.</p>
        </div>
        <div style="background:#1A3A3A;padding:20px;text-align:center">
          <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0">© 2026 BrightBasics · Made with ♥ in Bhopal</p>
        </div>
      </div>
    `,
  });
};

const sendOTP = async (email, otp) => {
  await transporter.sendMail({
    from: `BrightBasics <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: `Your BrightBasics OTP: ${otp}`,
    html: `<div style="font-family:Arial;padding:32px;text-align:center">
      <h2 style="color:#00A99D">🌟 BrightBasics</h2>
      <p>Your one-time password is:</p>
      <h1 style="font-size:48px;color:#FF6B1A;letter-spacing:12px">${otp}</h1>
      <p style="color:#888">Valid for 10 minutes. Do not share with anyone.</p>
    </div>`,
  });
};

module.exports = { sendOrderConfirmation, sendOTP };
