import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, '../emenu.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Check if tables exist and create if needed
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const existingTables = tables.map(t => t.name);

// Drop and recreate if needed - for development only
// In production, use proper migrations
if (existingTables.includes('products')) {
  // Check if category_id column exists
  const columns = db.prepare("PRAGMA table_info(products)").all();
  const hasCategoryId = columns.some(col => col.name === 'category_id');
  
  if (!hasCategoryId) {
    // Drop and recreate all tables with correct schema
    console.log('Rebuilding database schema...');
    db.exec(`
      DROP TABLE IF EXISTS order_status_history;
      DROP TABLE IF EXISTS order_items;
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS telegram_settings;
      DROP TABLE IF EXISTS telegram_notification_logs;
    `);
    existingTables.length = 0; // Clear the array
  }
}

// Create all tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    image TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id),
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    price REAL NOT NULL,
    sale_price REAL,
    stock_quantity INTEGER DEFAULT 0,
    is_available INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    telegram_user_id INTEGER PRIMARY KEY,
    telegram_username TEXT,
    telegram_first_name TEXT,
    telegram_last_name TEXT,
    phone TEXT,
    delivery_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    idempotency_key TEXT UNIQUE,
    telegram_user_id INTEGER,
    customer_name TEXT,
    telegram_username TEXT,
    phone TEXT,
    delivery_address TEXT,
    payment_method TEXT DEFAULT 'cash',
    subtotal REAL NOT NULL,
    delivery_fee REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL NOT NULL,
    note TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    old_status TEXT,
    new_status TEXT,
    changed_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS telegram_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sales_group_chat_id TEXT,
    admin_chat_ids TEXT,
    customer_notifications_enabled INTEGER DEFAULT 1,
    sales_notifications_enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS telegram_notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    chat_id TEXT,
    notification_type TEXT,
    message TEXT,
    status TEXT,
    error_message TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(telegram_user_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);

// Ensure a single settings row exists
db.prepare(`INSERT OR IGNORE INTO telegram_settings (id, sales_group_chat_id) VALUES (1, NULL)`).run();

// Check if we need to seed data
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0) {
  console.log('Seeding initial data...');
  
  const insertCat = db.prepare('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)');
  const cats = [
    ['Coffee', 'coffee', 1],
    ['Tea', 'tea', 2],
    ['Bakery', 'bakery', 3],
    ['Food', 'food', 4]
  ];
  const catIds = {};
  const tx = db.transaction(() => {
    for (const [name, slug, sort] of cats) {
      const r = insertCat.run(name, slug, sort);
      catIds[slug] = r.lastInsertRowid;
    }
  });
  tx();

  const insertProd = db.prepare(`
    INSERT INTO products (category_id, name, description, image, price, sale_price, stock_quantity, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const products = [
    [catIds.coffee, 'Iced Americano', 'Rich double espresso over cold water and ice.', 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400', 3.5, null, 50],
    [catIds.tea, 'Matcha Latte', 'Ceremonial grade matcha whisked with steamed milk.', 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400', 4.5, 3.9, 40],
    [catIds.bakery, 'Butter Croissant', 'Flaky, golden-brown artisanal croissant.', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400', 2.8, null, 30],
    [catIds.food, 'Avocado Toast', 'Toasted sourdough with smashed avocado & chilli flakes.', 'https://images.unsplash.com/photo-1588137378633-dea1336ce1e2?w=400', 6.5, null, 20],
    [catIds.coffee, 'Cold Brew Coffee', 'Smooth, low-acidity coffee steeped cold for 18 hours.', 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=400', 4.0, null, 35]
  ];
  const tx2 = db.transaction((rows) => { for (const r of rows) insertProd.run(...r); });
  tx2(products);
  
  console.log('Seed data inserted successfully.');
}

export default db;