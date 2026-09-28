'use strict';

const express = require('express');
const { db, getCart } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// The cart belongs to a user, not to a browser tab. That means it survives
// signing in on another device — and it is why every route here is behind
// requireAuth rather than living in localStorage.
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(getCart(req.user.id));
});

/** POST /api/cart  { productId, quantity } */
router.post('/', (req, res) => {
  const productId = Number(req.body?.productId);
  const quantity = Number(req.body?.quantity ?? 1);

  if (!Number.isInteger(productId) || productId < 1) {
    return res.status(400).json({ error: 'A valid product id is required.' });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 99.' });
  }

  const product = db
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(productId);

  if (!product) {
    return res.status(404).json({ error: 'That product does not exist.' });
  }

  const existing = db
    .prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?')
    .get(req.user.id, productId);

  const wanted = (existing?.quantity || 0) + quantity;

  // Check against live stock, including what is already in the cart. Letting
  // someone add twelve of a product with eight in stock only to fail at
  // checkout is a worse experience than refusing it here.
  if (wanted > product.stock) {
    return res.status(409).json({
      error:
        product.stock === 0
          ? `${product.name} is out of stock.`
          : `Only ${product.stock} of ${product.name} left, and you already have ${existing?.quantity || 0} in your basket.`,
      available: product.stock,
    });
  }

  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?')
      .run(wanted, existing.id);
  } else {
    db.prepare(
      'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)'
    ).run(req.user.id, productId, quantity);
  }

  res.status(201).json(getCart(req.user.id));
});

/** PATCH /api/cart/:productId  { quantity }  — 0 removes the line. */
router.patch('/:productId', (req, res) => {
  const productId = Number(req.params.productId);
  const quantity = Number(req.body?.quantity);

  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
    return res.status(400).json({ error: 'Quantity must be between 0 and 99.' });
  }

  if (quantity === 0) {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?')
      .run(req.user.id, productId);
    return res.json(getCart(req.user.id));
  }

  const product = db
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(productId);

  if (!product) {
    return res.status(404).json({ error: 'That product does not exist.' });
  }

  if (quantity > product.stock) {
    return res.status(409).json({
      error: `Only ${product.stock} of ${product.name} left.`,
      available: product.stock,
    });
  }

  const result = db
    .prepare(
      'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?'
    )
    .run(quantity, req.user.id, productId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'That item is not in your basket.' });
  }

  res.json(getCart(req.user.id));
});

router.delete('/:productId', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?')
    .run(req.user.id, Number(req.params.productId));

  res.json(getCart(req.user.id));
});

router.delete('/', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  res.json(getCart(req.user.id));
});

module.exports = router;
