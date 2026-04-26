# 🌟 BrightBasics Backend API

Node.js + Express + PostgreSQL backend for BrightBasics D2C Kids Store.

---

## 🚀 Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Run database migrations
npm run migrate

# 4. Start dev server
npm run dev
```

Server runs at `http://localhost:5000`

---

## 🚂 Deploy to Railway

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "BrightBasics backend v1"
git remote add origin https://github.com/tiwariabhishek940-coder/brightbasics-backend
git push -u origin main

# 2. Go to railway.app → New Project → Deploy from GitHub
# 3. Add PostgreSQL plugin
# 4. Set all environment variables from .env.example
# 5. Deploy!
```

---

## 📡 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP to phone |
| POST | `/api/auth/verify-otp` | Verify OTP, get JWT token |
| PUT | `/api/auth/profile` | Update name/email |
| GET | `/api/auth/me` | Get current user |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (with filters) |
| GET | `/api/products/:slug` | Single product + reviews |
| GET | `/api/products/categories/all` | All categories |
| POST | `/api/products/:id/review` | Add review (auth) |

**Query params for GET /api/products:**
```
category, age_min, age_max, min_price, max_price,
min_rating, special_need, featured, search,
sort (popular/rating/price-low/price-high/newest),
page, limit
```

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders/create` | Create order + Razorpay order |
| POST | `/api/orders/verify-payment` | Confirm payment |
| GET | `/api/orders` | User's order history |
| GET | `/api/orders/:order_number` | Single order |
| GET | `/api/orders/track/:awb` | Track via Shiprocket |
| POST | `/api/orders/addresses` | Save address |
| GET | `/api/orders/addresses/all` | Get saved addresses |

### Misc
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/coupons/validate` | Validate coupon |
| GET | `/api/wishlist` | Get wishlist |
| POST | `/api/wishlist/:product_id` | Add to wishlist |
| DELETE | `/api/wishlist/:product_id` | Remove from wishlist |
| GET | `/api/pincode/:pincode` | Check delivery serviceability |
| POST | `/api/wa-subscribe` | Subscribe to WhatsApp alerts |
| GET | `/api/bundles` | Get all bundles |

### Admin (requires `x-admin-key` header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Stats, GMV, recent orders |
| GET | `/api/admin/products` | All products |
| POST | `/api/admin/products` | Add product |
| PUT | `/api/admin/products/:id` | Update product |
| DELETE | `/api/admin/products/:id` | Deactivate product |
| GET | `/api/admin/orders` | All orders |
| PUT | `/api/admin/orders/:id/status` | Update order status |
| PUT | `/api/admin/inventory/:id` | Update stock |
| GET | `/api/admin/users` | All users |
| GET | `/api/admin/coupons` | All coupons |
| POST | `/api/admin/coupons` | Create coupon |
| GET | `/api/admin/analytics` | Revenue chart, top products |

---

## 🔐 Auth Flow

```
1. POST /api/auth/send-otp   { phone: "9876543210" }
2. POST /api/auth/verify-otp { phone: "9876543210", otp: "123456" }
3. Response → { token, user, isNewUser }
4. Use token as: Authorization: Bearer <token>
```

---

## 💳 Payment Flow

```
1. POST /api/orders/create → { razorpay_order_id, amount, order_id }
2. Open Razorpay checkout on frontend
3. On success → POST /api/orders/verify-payment
4. Backend verifies signature → creates Shiprocket order → sends email
```

---

## 🗄️ Database Schema

- **users** — phone-based auth with OTP
- **addresses** — multiple saved addresses per user
- **categories** — product categories with special needs flag
- **products** — full product catalog with BIS, age, stock
- **bundles** — complete the kit bundles
- **orders** — full order lifecycle
- **order_items** — line items per order
- **reviews** — verified buyer reviews
- **coupons** — discount codes
- **wa_subscribers** — WhatsApp age alert subscribers

---

## 📦 Environment Variables

See `.env.example` for all required variables.
