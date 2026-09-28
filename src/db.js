/**
 * Database layer — schema, connection, and the few queries complex enough
 * to deserve a name.
 *
 * SQLite is the right choice here for one specific reason: a reviewer can
 * clone this repository and run it without installing a database server.
 * The schema below is ordinary relational design and would move to Postgres
 * with almost no changes — the DDL is standard apart from AUTOINCREMENT.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH
  || path.join(__dirname, '..', 'data', 'store.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Write-Ahead Logging lets reads continue during a write, which matters as
// soon as more than one request is in flight. Foreign keys are OFF by default
// in SQLite — a genuine footgun, since every ON DELETE CASCADE below would
// silently do nothing without this line.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    slug        TEXT    NOT NULL UNIQUE,
    description TEXT    NOT NULL DEFAULT '',
    category    TEXT    NOT NULL DEFAULT 'general',
    -- Money is stored in PENCE as an integer, never as a float.
    -- 0.1 + 0.2 !== 0.3 in binary floating point, and a storefront that
    -- rounds a total wrongly loses trust faster than one that looks plain.
    price_pence INTEGER NOT NULL CHECK (price_pence >= 0),
    stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    emoji       TEXT    NOT NULL DEFAULT '📦',
    colour      TEXT    NOT NULL DEFAULT '#6366f1',
    rating      REAL    NOT NULL DEFAULT 4.5,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    -- One row per product per user. Adding the same item again bumps the
    -- quantity rather than creating a duplicate line.
    UNIQUE (user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reference    TEXT    NOT NULL UNIQUE,
    status       TEXT    NOT NULL DEFAULT 'confirmed',
    total_pence  INTEGER NOT NULL,
    full_name    TEXT    NOT NULL,
    address      TEXT    NOT NULL,
    city         TEXT    NOT NULL,
    postcode     TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
    -- The name and price are SNAPSHOTTED at purchase time, not joined at
    -- read time. If a product is renamed or repriced later, a past order
    -- must still show what the customer actually agreed to pay. A receipt
    -- that changes retroactively is not a receipt.
    product_name TEXT   NOT NULL,
    unit_pence   INTEGER NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0)
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_cart_user        ON cart_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user      ON orders(user_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_order_items      ON order_items(order_id);
`);

/** Rows for one user's cart, joined to live product data. */
const cartQuery = db.prepare(`
  SELECT
    c.id          AS cart_item_id,
    c.quantity,
    p.id          AS product_id,
    p.name,
    p.slug,
    p.price_pence,
    p.stock,
    p.emoji,
    p.colour,
    (c.quantity * p.price_pence) AS line_total_pence
  FROM cart_items c
  JOIN products p ON p.id = c.product_id
  WHERE c.user_id = ?
  ORDER BY c.added_at
`);

function getCart(userId) {
  const items = cartQuery.all(userId);
  const subtotal = items.reduce((sum, item) => sum + item.line_total_pence, 0);

  // Free delivery over £50 — a real rule, so the totals code has to do
  // something more interesting than add.
  const deliveryPence = items.length === 0 || subtotal >= 5000 ? 0 : 499;

  return {
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalPence: subtotal,
    deliveryPence,
    totalPence: subtotal + deliveryPence,
  };
}

/** An order with its snapshotted line items. */
function getOrder(orderId, userId) {
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, userId);

  if (!order) return null;

  order.items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
    .all(orderId);

  return order;
}

module.exports = { db, getCart, getOrder, DB_PATH };
