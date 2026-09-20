import express from 'express';
import { body, validationResult } from 'express-validator';
import { retryNotification, notifyStatusChange } from '../notify.js';
import db from '../db.js';

const router = express.Router();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Admin auth middleware
function adminAuth(req, res, next) {
  const key = req.header('x-admin-key');
  if (!ADMIN_API_KEY || key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET orders with filters
router.get('/orders', adminAuth, (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT * FROM orders';
  const params = [];
  
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const orders = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM orders' + (status ? ' WHERE status = ?' : ''))
    .get(status || undefined)?.count || 0;
  
  res.json({ orders, total, limit: parseInt(limit), offset: parseInt(offset) });
});

// GET order details
router.get('/orders/:id', adminAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
  
  res.json({ ...order, items, history });
});

// Update order status
router.put('/orders/:id/status', adminAuth, [
  body('status').isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'completed', 'cancelled', 'rejected'])
    .withMessage('Invalid status'),
  body('changed_by').optional().isString()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { status, changed_by } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const oldStatus = order.status;
  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, order.id);
  db.prepare('INSERT INTO order_status_history (order_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)')
    .run(order.id, oldStatus, status, changed_by || 'admin');

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const bot = req.app.locals.bot;
  notifyStatusChange(bot, updatedOrder, oldStatus, status).catch(e => console.error('notify error:', e));

  res.json({ success: true, order: updatedOrder });
});

// GET products (admin)
router.get('/products', adminAuth, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order, id').all();
  res.json(products);
});

// POST create product
router.post('/products', adminAuth, [
  body('name').isString().notEmpty(),
  body('category_id').isInt(),
  body('price').isFloat({ min: 0 }),
  body('sale_price').optional().isFloat({ min: 0 }),
  body('stock_quantity').optional().isInt({ min: 0 }),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('is_available').optional().isBoolean()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, category_id, description, image, price, sale_price, stock_quantity, is_available } = req.body;
  
  const result = db.prepare(`
    INSERT INTO products (category_id, name, description, image, price, sale_price, stock_quantity, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(category_id, name, description, image, price, sale_price, stock_quantity || 0, is_available ? 1 : 0);

  res.status(201).json({ 
    success: true, 
    id: result.lastInsertRowid,
    message: 'Product created successfully'
  });
});

// PUT update product
router.put('/products/:id', adminAuth, [
  body('name').optional().isString(),
  body('category_id').optional().isInt(),
  body('price').optional().isFloat({ min: 0 }),
  body('sale_price').optional().isFloat({ min: 0 }),
  body('stock_quantity').optional().isInt({ min: 0 }),
  body('is_available').optional().isBoolean(),
  body('status').optional().isIn(['active', 'inactive'])
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const updates = [];
  const params = [];
  const fields = ['name', 'category_id', 'description', 'image', 'price', 'sale_price', 'stock_quantity', 'is_available', 'status'];
  
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);
  
  db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true, message: 'Product updated successfully' });
});

// DELETE product
router.delete('/products/:id', adminAuth, (req, res) => {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json({ success: true, message: 'Product deleted successfully' });
});

// GET categories (admin)
router.get('/categories', adminAuth, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  res.json(categories);
});

// POST create category
router.post('/categories', adminAuth, [
  body('name').isString().notEmpty(),
  body('slug').isString().notEmpty(),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('sort_order').optional().isInt()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, slug, description, image, sort_order } = req.body;
  
  const result = db.prepare(`
    INSERT INTO categories (name, slug, description, image, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, slug, description, image, sort_order || 0);

  res.status(201).json({ 
    success: true, 
    id: result.lastInsertRowid,
    message: 'Category created successfully'
  });
});

// PUT update category
router.put('/categories/:id', adminAuth, [
  body('name').optional().isString(),
  body('slug').optional().isString(),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('sort_order').optional().isInt(),
  body('status').optional().isIn(['active', 'inactive'])
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const updates = [];
  const params = [];
  const fields = ['name', 'slug', 'description', 'image', 'sort_order', 'status'];
  
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);
  
  db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true, message: 'Category updated successfully' });
});

// DELETE category
router.delete('/categories/:id', adminAuth, (req, res) => {
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Category not found' });
  }
  res.json({ success: true, message: 'Category deleted successfully' });
});

// GET failed notifications
router.get('/notifications/failed', adminAuth, (req, res) => {
  const logs = db.prepare(`
    SELECT * FROM telegram_notification_logs 
    WHERE status = 'failed' 
    ORDER BY sent_at DESC
  `).all();
  res.json(logs);
});

// POST retry notification
router.post('/notifications/:logId/retry', adminAuth, async (req, res) => {
  try {
    const bot = req.app.locals.bot;
    await retryNotification(bot, req.params.logId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT telegram settings
router.put('/telegram-settings', adminAuth, [
  body('sales_group_chat_id').optional().isString(),
  body('admin_chat_ids').optional().isString(),
  body('customer_notifications_enabled').optional().isBoolean(),
  body('sales_notifications_enabled').optional().isBoolean()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { sales_group_chat_id, admin_chat_ids, customer_notifications_enabled, sales_notifications_enabled } = req.body;
  
  db.prepare(`
    UPDATE telegram_settings 
    SET sales_group_chat_id = COALESCE(?, sales_group_chat_id),
        admin_chat_ids = COALESCE(?, admin_chat_ids),
        customer_notifications_enabled = COALESCE(?, customer_notifications_enabled),
        sales_notifications_enabled = COALESCE(?, sales_notifications_enabled)
    WHERE id = 1
  `).run(sales_group_chat_id, admin_chat_ids, customer_notifications_enabled ? 1 : 0, sales_notifications_enabled ? 1 : 0);

  res.json({ success: true });
});

// GET telegram settings
router.get('/telegram-settings', adminAuth, (req, res) => {
  const settings = db.prepare('SELECT * FROM telegram_settings WHERE id = 1').get();
  res.json(settings);
});

// GET dashboard stats
router.get('/dashboard', adminAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  const stats = {
    totalOrders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
    pendingOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count,
    completedOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count,
    cancelledOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'").get().count,
    todayOrders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?').get(today).count,
    todaySales: db.prepare('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE DATE(created_at) = ? AND status != "cancelled"').get(today).total,
    totalSales: db.prepare('SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != "cancelled"').get().total,
    totalCustomers: db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
    totalProducts: db.prepare('SELECT COUNT(*) as count FROM products WHERE status = "active"').get().count
  };
  
  res.json(stats);
});

export default router;