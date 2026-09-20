import db from '../db.js';

export function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = db.prepare(`SELECT COUNT(*) as c FROM orders WHERE order_number LIKE ?`).get(`ORD-${date}-%`).c + 1;
  return `ORD-${date}-${String(seq).padStart(4, '0')}`;
}

export function upsertCustomer(user, extra = {}) {
  db.prepare(`
    INSERT INTO customers (telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, phone, delivery_address)
    VALUES (@id, @username, @first_name, @last_name, @phone, @address)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      telegram_username = excluded.telegram_username,
      telegram_first_name = excluded.telegram_first_name,
      telegram_last_name = excluded.telegram_last_name,
      phone = COALESCE(excluded.phone, customers.phone),
      delivery_address = COALESCE(excluded.delivery_address, customers.delivery_address),
      updated_at = CURRENT_TIMESTAMP
  `).run({
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    phone: extra.phone || null,
    address: extra.address || null
  });
}

export function formatCurrency(amount, currency = '$') {
  return `${currency}${amount.toFixed(2)}`;
}

export function sanitizeInput(str) {
  if (!str) return str;
  return str.replace(/[<>]/g, '');
}

export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, '-');
}