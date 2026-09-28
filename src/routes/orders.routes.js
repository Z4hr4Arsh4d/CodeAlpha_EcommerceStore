'use strict';

const crypto = require('crypto');
const express = require('express');
const { db, getCart, getOrder } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.use(requireAuth);

function reference() {
  // Short, unambiguous, and safe to read down a phone line — no 0/O or 1/I.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `ORD-${code}`;
}

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) return `${label} is required.`;
  if (text.length > 120) return `${label} is too long.`;
  return null;
}

/**
 * POST /api/orders — turn the current cart into an order.
 *
 * The whole thing runs inside one transaction. That is not decoration:
 * between reading stock and writing the order there is a window where a
 * second request could buy the last item. better-sqlite3 transactions are
 * synchronous and serialised, so either the whole order commits — stock
 * decremented, cart cleared, items snapshotted — or none of it does.
 * A half-written order that charged someone and reserved nothing is the
 * single worst failure a shop can have.
 */
router.post('/', (req, res) => {
  const { fullName, address, city, postcode } = req.body || {};

  const errors = [
    required(fullName, 'Full name'),
    required(address, 'Address'),
    required(city, 'City'),
    required(postcode, 'Postcode'),
  ].filter(Boolean);

  if (errors.length) {
    return res.status(422).json({ error: errors.join(' ') });
  }

  const cart = getCart(req.user.id);

  if (cart.items.length === 0) {
    return res.status(400).json({ error: 'Your basket is empty.' });
  }

  // Re-check stock at the moment of purchase. The cart may have been sitting
  // open for an hour while somebody else bought the last one.
  const unavailable = cart.items.filter((item) => item.quantity > item.stock);

  if (unavailable.length) {
    return res.status(409).json({
      error:
        'Some items are no longer available in the quantity you wanted: '
        + unavailable
          .map((i) => `${i.name} (${i.stock} left, you wanted ${i.quantity})`)
          .join('; '),
      items: unavailable.map((i) => ({
        productId: i.product_id,
        available: i.stock,
      })),
    });
  }

  const placeOrder = db.transaction(() => {
    const orderResult = db
      .prepare(
        `INSERT INTO orders
           (user_id, reference, total_pence, full_name, address, city, postcode)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        reference(),
        cart.totalPence,
        String(fullName).trim(),
        String(address).trim(),
        String(city).trim(),
        String(postcode).trim()
      );

    const orderId = orderResult.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO order_items
         (order_id, product_id, product_name, unit_pence, quantity)
       VALUES (?, ?, ?, ?, ?)`
    );

    // The guard in the UPDATE is the real protection. Even if two orders
    // race past the check above, only one can satisfy `stock >= ?`, and the
    // other's transaction rolls back rather than driving stock negative.
    const decrement = db.prepare(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?'
    );

    for (const item of cart.items) {
      insertItem.run(
        orderId,
        item.product_id,
        item.name,        // snapshot
        item.price_pence, // snapshot
        item.quantity
      );

      const updated = decrement.run(item.quantity, item.product_id, item.quantity);

      if (updated.changes === 0) {
        // Throwing here rolls the entire transaction back.
        throw new Error(`OUT_OF_STOCK:${item.name}`);
      }
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);

    return orderId;
  });

  try {
    const orderId = placeOrder();
    res.status(201).json({ order: getOrder(orderId, req.user.id) });
  } catch (error) {
    if (String(error.message).startsWith('OUT_OF_STOCK:')) {
      const name = error.message.split(':')[1];
      return res.status(409).json({
        error: `${name} sold out while you were checking out. Nothing was charged.`,
      });
    }
    throw error;
  }
});

/** The signed-in user's order history, newest first. */
router.get('/', (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);

  const itemsFor = db.prepare(
    'SELECT * FROM order_items WHERE order_id = ? ORDER BY id'
  );

  for (const order of orders) order.items = itemsFor.all(order.id);

  res.json({ orders });
});

/**
 * GET /api/orders/:id
 *
 * The user id is part of the WHERE clause, not checked afterwards. Filtering
 * in the query means there is no path where another customer's order is
 * fetched and then hopefully rejected — it is simply never selected.
 */
router.get('/:id', (req, res) => {
  const order = getOrder(Number(req.params.id), req.user.id);

  if (!order) {
    return res.status(404).json({ error: 'That order does not exist.' });
  }

  res.json({ order });
});

module.exports = router;
