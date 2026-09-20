import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import db from './db.js';
import customerRoutes from './routes/customer.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.WEBAPP_URL,
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Initialize Telegram Bot
const BOT_TOKEN = process.env.BOT_TOKEN;
let bot = null;

if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  
  bot.onText(/\/start/, (msg) => {
    const webAppUrl = process.env.WEBAPP_URL || 'https://example.com';
    bot.sendMessage(msg.chat.id, '👋 Welcome! Tap below to open the menu and order.', {
      reply_markup: { 
        inline_keyboard: [[
          { text: '🍽️ Open Menu & Order', web_app: { url: webAppUrl } }
        ]]
      }
    });
  });

  console.log('🤖 Telegram bot initialized');
} else {
  console.warn('⚠️ BOT_TOKEN missing — Telegram features disabled.');
}

// Make bot available to routes
app.locals.bot = bot;

// Routes
app.use('/api', customerRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});

export { bot };