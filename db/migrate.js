const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log("🚀 Running BrightBasics migrations...");

    await client.query(`

      -- ── USERS ──────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(100),
        phone         VARCHAR(15) UNIQUE NOT NULL,
        email         VARCHAR(150) UNIQUE,
        is_verified   BOOLEAN DEFAULT FALSE,
        otp           VARCHAR(6),
        otp_expires   TIMESTAMP,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );

      -- ── ADDRESSES ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS addresses (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(100) NOT NULL,
        phone       VARCHAR(15) NOT NULL,
        address     TEXT NOT NULL,
        city        VARCHAR(100) NOT NULL,
        state       VARCHAR(100) NOT NULL,
        pincode     VARCHAR(10) NOT NULL,
        is_default  BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW()
      );

      -- ── CATEGORIES ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS categories (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        slug        VARCHAR(100) UNIQUE NOT NULL,
        emoji       VARCHAR(10),
        description TEXT,
        is_special  BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW()
      );

      -- ── PRODUCTS ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS products (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(200) NOT NULL,
        slug            VARCHAR(200) UNIQUE NOT NULL,
        description     TEXT,
        category_id     INTEGER REFERENCES categories(id),
        emoji           VARCHAR(10),
        price           INTEGER NOT NULL,
        mrp             INTEGER NOT NULL,
        stock           INTEGER DEFAULT 0,
        age_min         INTEGER,
        age_max         INTEGER,
        age_label       VARCHAR(30),
        is_bis_certified BOOLEAN DEFAULT TRUE,
        bis_cert_number  VARCHAR(50),
        badge           VARCHAR(30),
        special_need    VARCHAR(50),
        is_active       BOOLEAN DEFAULT TRUE,
        is_featured     BOOLEAN DEFAULT FALSE,
        weight_grams    INTEGER DEFAULT 500,
        images          TEXT[],
        tags            TEXT[],
        rating          DECIMAL(3,2) DEFAULT 0,
        review_count    INTEGER DEFAULT 0,
        sold_count      INTEGER DEFAULT 0,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );

      -- ── BUNDLES ────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS bundles (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(200) NOT NULL,
        description TEXT,
        tag         VARCHAR(100),
        price       INTEGER NOT NULL,
        mrp         INTEGER NOT NULL,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bundle_products (
        bundle_id   INTEGER REFERENCES bundles(id) ON DELETE CASCADE,
        product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
        PRIMARY KEY (bundle_id, product_id)
      );

      -- ── WISHLIST ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS wishlists (
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, product_id)
      );

      -- ── COUPONS ────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS coupons (
        id              SERIAL PRIMARY KEY,
        code            VARCHAR(30) UNIQUE NOT NULL,
        discount_pct    INTEGER NOT NULL,
        min_order       INTEGER DEFAULT 0,
        max_uses        INTEGER DEFAULT 100,
        used_count      INTEGER DEFAULT 0,
        valid_from      TIMESTAMP DEFAULT NOW(),
        valid_until     TIMESTAMP,
        is_active       BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMP DEFAULT NOW()
      );

      -- ── ORDERS ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS orders (
        id                  SERIAL PRIMARY KEY,
        order_number        VARCHAR(20) UNIQUE NOT NULL,
        user_id             INTEGER REFERENCES users(id),
        address_id          INTEGER REFERENCES addresses(id),
        subtotal            INTEGER NOT NULL,
        discount            INTEGER DEFAULT 0,
        delivery_fee        INTEGER DEFAULT 0,
        total               INTEGER NOT NULL,
        coupon_code         VARCHAR(30),
        payment_method      VARCHAR(30) NOT NULL,
        payment_status      VARCHAR(20) DEFAULT 'pending',
        razorpay_order_id   VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        order_status        VARCHAR(30) DEFAULT 'placed',
        shiprocket_order_id VARCHAR(100),
        shiprocket_awb      VARCHAR(100),
        tracking_url        TEXT,
        notes               TEXT,
        created_at          TIMESTAMP DEFAULT NOW(),
        updated_at          TIMESTAMP DEFAULT NOW()
      );

      -- ── ORDER ITEMS ────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS order_items (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id  INTEGER REFERENCES products(id),
        name        VARCHAR(200),
        emoji       VARCHAR(10),
        price       INTEGER NOT NULL,
        qty         INTEGER NOT NULL,
        total       INTEGER NOT NULL
      );

      -- ── REVIEWS ────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS reviews (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        order_id    INTEGER REFERENCES orders(id),
        rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
        title       VARCHAR(200),
        body        TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW(),
        UNIQUE (product_id, user_id)
      );

      -- ── WHATSAPP SUBSCRIBERS ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS wa_subscribers (
        id          SERIAL PRIMARY KEY,
        phone       VARCHAR(15) NOT NULL,
        child_age   INTEGER,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMP DEFAULT NOW()
      );

      -- ── INDEXES ────────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_active    ON products(is_active);
      CREATE INDEX IF NOT EXISTS idx_products_featured  ON products(is_featured);
      CREATE INDEX IF NOT EXISTS idx_products_special   ON products(special_need);
      CREATE INDEX IF NOT EXISTS idx_orders_user        ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(order_status);
      CREATE INDEX IF NOT EXISTS idx_reviews_product    ON reviews(product_id);

    `);

    // ── SEED CATEGORIES ──────────────────────────────────────────
    await client.query(`
      INSERT INTO categories (name, slug, emoji, is_special) VALUES
        ('Puzzles',        'puzzles',       '🧩', false),
        ('Art & Craft',    'art-craft',     '🎨', false),
        ('STEM Kits',      'stem-kits',     '🔬', false),
        ('Books',          'books',         '📚', false),
        ('Pretend Play',   'pretend-play',  '🎭', false),
        ('Outdoors',       'outdoors',      '🌱', false),
        ('Building',       'building',      '🧱', false),
        ('Board Games',    'board-games',   '🎲', false),
        ('Flash Cards',    'flash-cards',   '🃏', false),
        ('Stationery',     'stationery',    '✏️', false),
        ('Sensory Toys',   'sensory-toys',  '🤲', false),
        ('Learning Cards', 'learning-cards','📖', false),
        ('Special Needs',  'special-needs', '💜', true)
      ON CONFLICT (slug) DO NOTHING;
    `);

    // ── SEED COUPONS ─────────────────────────────────────────────
    await client.query(`
      INSERT INTO coupons (code, discount_pct, min_order, max_uses) VALUES
        ('BRIGHT10', 10, 500,  500),
        ('BABY20',   20, 800,  200),
        ('FIRST15',  15, 600,  300)
      ON CONFLICT (code) DO NOTHING;
    `);

    console.log("✅ Migration complete!");
    console.log("✅ Categories seeded!");
    console.log("✅ Coupons seeded!");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
