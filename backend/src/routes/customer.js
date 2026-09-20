import express from 'express';
import { body, validationResult } from 'express-validator';
import { requireTelegramAuth } from '../telegramAuth.js';
import { notifyNewOrder } from '../notify.js';
import db from '../db.js';
import { generateOrderNumber, upsertCustomer } from '../utils/helpers.js';

const router = express.Router();
const BOT_TOKEN = process.env.BOT_TOKEN;

// Customer auth middleware
const customerAuth = requireTelegramAuth(BOT_TOKEN);

// GET categories
router.get('/categories', (req, res) => {
  const rows = db.prepare(`SELECT * FROM categories WHERE status = 'active' ORDER BY sort_order`).all();
  res.json(rows);
});

// GET products
router.get('/products', (req, res) => {
  const { category_id, search } = req.query;
  let query = `SELECT * FROM products WHERE status = 'active'`;
  const params = [];
  
  if (category_id) {
    query += ' AND category_id = ?';
    params.push(category_id);
  }
  if (search) {
    query += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY sort_order, id';
  
  res.json(db.prepare(query).all(...params));
});

// GET product by id
router.get('/products/:id', (req, res) => {
  const product = db.prepare(`SELECT * FROM products WHERE id = ? AND status = 'active'`).get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// Create order
router.post('/orders', customerAuth, [
  body('items').isArray().withMessage('Items must be an array'),
  body('items.*.id').isInt().withMessage('Product ID must be an integer'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('idempotency_key').isString().notEmpty().withMessage('Idempotency key is required'),
  body('payment_method').optional().isString(),
  body('phone').optional().isString(),
  body('delivery_address').optional().isString(),
  body('note').optional().isString()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { items, phone, delivery_address, payment_method, note, idempotency_key } = req.body;
  const user = req.telegramUser;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  // Idempotency check
  const existing = db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(idempotency_key);
  if (existing) {
    return res.status(200).json({ 
      success: true, 
      orderId: existing.id, 
      orderNumber: existing.order_number, 
      duplicate: true 
    });
  }

  try {
    const result = db.transaction(() => {
      upsertCustomer(user, { phone, address: delivery_address });

      // Re-fetch products from DB - never trust client data
      let subtotal = 0;
      const resolvedItems = [];
      
      for (const reqItem of items) {
        const product = db.prepare(`SELECT * FROM products WHERE id = ? AND status = 'active'`).get(reqItem.id);
        if (!product) throw new Error(`Product ${reqItem.id} not found or unavailable`);
        if (!product.is_available) throw new Error(`${product.name} is out of stock`);

        const quantity = parseInt(reqItem.quantity, 10);
        if (!quantity || quantity < 1) throw new Error(`Invalid quantity for ${product.name}`);
        if (product.stock_quantity !== null && product.stock_quantity < quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        const price = product.sale_price ?? product.price;
        const lineSubtotal = Math.round(price * quantity * 100) / 100;
        subtotal += lineSubtotal;
        resolvedItems.push({ product, quantity, price, lineSubtotal });
      }
      subtotal = Math.round(subtotal * 100) / 100;

      const deliveryFee = 0;
      const discount = 0;
      const total = Math.round((subtotal + deliveryFee - discount) * 100) / 100;

      const orderNumber = generateOrderNumber();
      const orderResult = db.prepare(`
        INSERT INTO orders (order_number, idempotency_key, telegram_user_id, customer_name, telegram_username, phone, delivery_address, payment_method, subtotal, delivery_fee, discount, total, note, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        orderNumber, idempotency_key, user.id,
        `${user.first_name} ${user.last_name || ''}`.trim(), user.username || null,
        phone || null, delivery_address || null, payment_method || 'cash',
        subtotal, deliveryFee, discount, total, note || null
      );
      const orderId = orderResult.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const it of resolvedItems) {
        insertItem.run(orderId, it.product.id, it.product.name, it.price, it.quantity, it.lineSubtotal);
        db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(it.quantity, it.product.id);
      }

      db.prepare(`
        INSERT INTO order_status_history (order_id, old_status, new_status, changed_by)
        VALUES (?, NULL, 'pending', 'system')
      `).run(orderId);

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
      
      return { orderId, orderNumber, order, items: orderItems };
    })();

    // Send notifications after commit - failure doesn't affect order
    const bot = req.app.locals.bot;
    notifyNewOrder(bot, result.order, result.items).catch(e => console.error('notify error:', e));

    res.status(201).json({ 
      success: true, 
      orderId: result.orderId, 
      orderNumber: result.orderNumber 
    });
  } catch (err) {
    console.error('Order creation error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET customer orders
router.get('/orders', customerAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE telegram_user_id = ? ORDER BY created_at DESC').all(req.telegramUser.id);
  res.json(rows);
});

// GET order by id
router.get('/orders/:id', customerAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND telegram_user_id = ?').get(req.params.id, req.telegramUser.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items });
});

// PUT update customer profile
router.put('/profile', customerAuth, [
  body('phone').optional().isString(),
  body('delivery_address').optional().isString()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { phone, delivery_address } = req.body;
  const user = req.telegramUser;

  db.prepare(`
    UPDATE customers 
    SET phone = COALESCE(?, phone),
        delivery_address = COALESCE(?, delivery_address),
        updated_at = CURRENT_TIMESTAMP
    WHERE telegram_user_id = ?
  `).run(phone, delivery_address, user.id);

  res.json({ success: true });
});

// GET customer profile
router.get('/profile', customerAuth, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE telegram_user_id = ?').get(req.telegramUser.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

export default router;