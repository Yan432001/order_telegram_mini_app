import dotenv from 'dotenv';
import db from './db.js';

dotenv.config();

function formatOrderMessage(order, items, forSales) {
  const lines = [];
  lines.push(forSales ? '🛒 NEW ORDER' : '✅ ORDER RECEIVED');
  lines.push('');
  lines.push(`Order: ${order.order_number}`);
  lines.push('');
  if (forSales) {
    lines.push(`👤 Customer: ${order.customer_name || 'N/A'}`);
    lines.push(`📱 Phone: ${order.phone || 'N/A'}`);
    if (order.delivery_address) lines.push(`📍 Address: ${order.delivery_address}`);
    lines.push('');
    lines.push('🛍 ITEMS:');
    items.forEach((it, i) => {
      lines.push(`${i + 1}. ${it.product_name}`);
      lines.push(`   ${it.quantity} × $${it.price.toFixed(2)} = $${it.subtotal.toFixed(2)}`);
    });
    lines.push('');
  }
  lines.push(`Total: $${order.total.toFixed(2)}`);
  lines.push(`Status: ${order.status.toUpperCase()}`);
  if (order.note) lines.push(`\n📝 Note: ${order.note}`);
  return lines.join('\n');
}

async function sendAndLog(bot, chatId, message, orderId, type) {
  let status = 'sent';
  let errorMessage = null;
  try {
    if (!bot || !chatId) throw new Error('Bot not configured or chat_id missing');
    await bot.sendMessage(chatId, message);
  } catch (err) {
    status = 'failed';
    errorMessage = err.message;
    console.error(`Telegram notify failed [${type}] order ${orderId}:`, err.message);
  }
  db.prepare(`
    INSERT INTO telegram_notification_logs (order_id, chat_id, notification_type, message, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, chatId || null, type, message, status, errorMessage);
}

export async function notifyNewOrder(bot, order, items) {
  const settings = db.prepare('SELECT * FROM telegram_settings WHERE id = 1').get();

  if (settings?.sales_notifications_enabled && settings.sales_group_chat_id) {
    const salesMsg = formatOrderMessage(order, items, true);
    await sendAndLog(bot, settings.sales_group_chat_id, salesMsg, order.id, 'sales_new_order');
  }

  if (settings?.customer_notifications_enabled && order.telegram_user_id) {
    const customerMsg = formatOrderMessage(order, items, false);
    await sendAndLog(bot, order.telegram_user_id, customerMsg, order.id, 'customer_confirmation');
  }
}

export async function notifyStatusChange(bot, order, oldStatus, newStatus) {
  const settings = db.prepare('SELECT * FROM telegram_settings WHERE id = 1').get();
  if (!settings?.customer_notifications_enabled || !order.telegram_user_id) return;

  const message = newStatus === 'completed'
    ? `✅ ORDER COMPLETED\n\nOrder ${order.order_number} has been completed.\n\nThank you for your order!`
    : `🔔 ORDER UPDATE\n\nOrder: ${order.order_number}\n\nStatus changed:\n${oldStatus} → ${newStatus}`;

  await sendAndLog(bot, order.telegram_user_id, message, order.id, 'status_update');
}

export async function retryNotification(bot, logId) {
  const log = db.prepare('SELECT * FROM telegram_notification_logs WHERE id = ?').get(logId);
  if (!log) throw new Error('Notification log not found');
  await sendAndLog(bot, log.chat_id, log.message, log.order_id, log.notification_type);
}