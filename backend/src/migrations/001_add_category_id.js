import db from '../db.js';

try {
  // Check if category_id column exists in products table
  const columns = db.prepare("PRAGMA table_info(products)").all();
  const hasCategoryId = columns.some(col => col.name === 'category_id');
  
  if (!hasCategoryId) {
    console.log('Adding category_id column to products table...');
    
    // SQLite doesn't support adding foreign key constraints to existing tables easily
    // We need to recreate the table
    db.exec(`
      -- Create a new table with the correct schema
      CREATE TABLE products_new (
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
      
      -- Copy data from old table
      INSERT INTO products_new (id, name, description, image, price, sale_price, stock_quantity, is_available, status, sort_order, created_at, updated_at)
      SELECT id, name, description, image, price, sale_price, stock_quantity, is_available, status, sort_order, created_at, updated_at
      FROM products;
      
      -- Drop old table
      DROP TABLE products;
      
      -- Rename new table
      ALTER TABLE products_new RENAME TO products;
      
      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    `);
    
    console.log('Migration completed successfully.');
  } else {
    console.log('category_id column already exists.');
  }
} catch (error) {
  console.error('Migration failed:', error.message);
}