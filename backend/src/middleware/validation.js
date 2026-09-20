import { body, validationResult } from 'express-validator';

export const validateOrder = [
  body('items').isArray().withMessage('Items must be an array'),
  body('items.*.id').isInt().withMessage('Product ID must be an integer'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('idempotency_key').isString().notEmpty().withMessage('Idempotency key is required'),
  body('payment_method').optional().isString(),
  body('phone').optional().isString(),
  body('delivery_address').optional().isString(),
  body('note').optional().isString()
];

export const validateProduct = [
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('category_id').isInt().withMessage('Category ID must be an integer'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('sale_price').optional().isFloat({ min: 0 }),
  body('stock_quantity').optional().isInt({ min: 0 }),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('is_available').optional().isBoolean()
];

export const validateCategory = [
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('slug').isString().notEmpty().withMessage('Slug is required'),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('sort_order').optional().isInt()
];

export const validateStatus = [
  body('status').isIn(['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'completed', 'cancelled', 'rejected'])
    .withMessage('Invalid status'),
  body('changed_by').optional().isString()
];

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};