import crypto from 'crypto';

/**
 * Validates Telegram WebApp initData server-side.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Constant-time compare
  const hashBuf = Buffer.from(hash, 'hex');
  const computedBuf = Buffer.from(computedHash, 'hex');
  if (hashBuf.length !== computedBuf.length || !crypto.timingSafeEqual(hashBuf, computedBuf)) {
    return null;
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    return null; // expired
  }

  const userRaw = params.get('user');
  if (!userRaw) return null;

  try {
    const user = JSON.parse(userRaw);
    return { user, authDate };
  } catch {
    return null;
  }
}

/**
 * Express middleware: expects raw initData string in `x-telegram-init-data` header.
 * Attaches req.telegramUser on success, otherwise responds 401.
 */
export function requireTelegramAuth(botToken) {
  return (req, res, next) => {
    const initData = req.header('x-telegram-init-data');
    const result = validateInitData(initData, botToken);
    if (!result) {
      return res.status(401).json({ error: 'Invalid or expired Telegram authentication' });
    }
    req.telegramUser = result.user;
    next();
  };
}