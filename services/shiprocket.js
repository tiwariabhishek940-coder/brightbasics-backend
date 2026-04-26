const axios = require("axios");

let shiprocketToken = null;
let tokenExpiry = null;

// Get auth token (valid for 24 hrs)
const getToken = async () => {
  if (shiprocketToken && tokenExpiry && new Date() < tokenExpiry) {
    return shiprocketToken;
  }
  const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
  });
  shiprocketToken = res.data.token;
  tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23 hours
  return shiprocketToken;
};

const headers = async () => ({
  Authorization: `Bearer ${await getToken()}`,
  "Content-Type": "application/json",
});

// Create Shiprocket order after payment success
const createShiprocketOrder = async (order, items, address) => {
  const h = await headers();
  const payload = {
    order_id: order.order_number,
    order_date: new Date().toISOString().split("T")[0],
    pickup_location: "Primary",
    channel_id: "",
    billing_customer_name: address.name,
    billing_last_name: "",
    billing_address: address.address,
    billing_city: address.city,
    billing_pincode: address.pincode,
    billing_state: address.state,
    billing_country: "India",
    billing_email: order.email || "customer@brightbasics.in",
    billing_phone: address.phone,
    shipping_is_billing: true,
    order_items: items.map(i => ({
      name: i.name,
      sku: `BB-${i.product_id}`,
      units: i.qty,
      selling_price: i.price,
      discount: 0,
      tax: 0,
      hsn: 9503, // Toys HSN code
    })),
    payment_method: order.payment_method === "cod" ? "COD" : "Prepaid",
    sub_total: order.total,
    length: 20, weight: 0.5, breadth: 15, height: 10,
  };

  const res = await axios.post(
    "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
    payload,
    { headers: h }
  );
  return res.data;
};

// Get tracking info
const getTracking = async (awb) => {
  const h = await headers();
  const res = await axios.get(
    `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
    { headers: h }
  );
  return res.data;
};

// Check serviceability for pincode
const checkServiceability = async (pincode, weight = 0.5) => {
  const h = await headers();
  const res = await axios.get(
    `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=462001&delivery_postcode=${pincode}&cod=0&weight=${weight}`,
    { headers: h }
  );
  return res.data;
};

module.exports = { createShiprocketOrder, getTracking, checkServiceability };
