/**
 * API tests for the e-commerce store.
 *
 * These run against a real server on a real (temporary) SQLite database —
 * no mocks. A mocked database would happily agree that stock decremented
 * when it did not, which is precisely the bug worth catching.
 *
 *   npm test
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Point at a throwaway database BEFORE anything requires src/db.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-test-'));
process.env.DB_PATH = path.join(tempDir, 'test.db');
process.env.SESSION_SECRET = 'test-secret';

const app = require('../server');
const { db } = require('../src/db');
const { seed } = require('../src/seed');

let server;
let base;

/** A tiny client that remembers cookies, so sessions work across requests. */
function client() {
  let cookie = '';

  return async function call(method, url, body) {
    const response = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const setCookie = response.headers.getSetCookie?.() || [];
    if (setCookie.length) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');

    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  };
}

test.before(async () => {
  seed();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  server?.close();
  try { db.close(); } catch { /* already closed */ }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------- products */

test('the catalogue loads and is paginated', async () => {
  const call = client();
  const { status, data } = await call('GET', '/api/products?limit=5');

  assert.equal(status, 200);
  assert.equal(data.products.length, 5);
  assert.ok(data.pagination.total >= 16);
  assert.ok(data.pagination.pages > 1);
});

test('search matches name, description and category', async () => {
  const call = client();
  const { data } = await call('GET', '/api/products?search=keyboard');

  assert.ok(data.products.length >= 1);
  assert.ok(
    data.products.some((p) => p.name.toLowerCase().includes('keyboard'))
  );
});

test('category filtering narrows the results', async () => {
  const call = client();
  const { data } = await call('GET', '/api/products?category=kitchen&limit=48');

  assert.ok(data.products.length > 0);
  assert.ok(data.products.every((p) => p.category === 'kitchen'));
});

test('sorting by price actually sorts', async () => {
  const call = client();
  const { data } = await call('GET', '/api/products?sort=price-asc&limit=48');

  const prices = data.products.map((p) => p.price_pence);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});

test('an unknown sort value falls back rather than injecting SQL', async () => {
  const call = client();
  const { status } = await call(
    'GET',
    '/api/products?sort=' + encodeURIComponent('name; DROP TABLE products--')
  );

  assert.equal(status, 200);
  // The table is still there.
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM products').get().n > 0);
});

test('a product can be fetched by slug', async () => {
  const call = client();
  const { status, data } = await call('GET', '/api/products/meridian-mechanical-keyboard');

  assert.equal(status, 200);
  assert.equal(data.product.name, 'Meridian Mechanical Keyboard');
  assert.ok(Array.isArray(data.related));
});

test('an unknown product returns 404, not a crash', async () => {
  const call = client();
  const { status } = await call('GET', '/api/products/does-not-exist');
  assert.equal(status, 404);
});

/* ----------------------------------------------------------------- auth */

test('a new account can be registered and is signed in immediately', async () => {
  const call = client();
  const { status, data } = await call('POST', '/api/auth/register', {
    name: 'Test Person',
    email: 'test1@example.com',
    password: 'password123',
  });

  assert.equal(status, 201);
  assert.equal(data.user.email, 'test1@example.com');
  assert.equal(data.user.password_hash, undefined, 'the hash must never be sent');

  const me = await call('GET', '/api/auth/me');
  assert.equal(me.data.user.email, 'test1@example.com');
});

test('the password is stored hashed, never in plain text', async () => {
  const row = db
    .prepare('SELECT password_hash FROM users WHERE email = ?')
    .get('test1@example.com');

  assert.ok(row.password_hash.startsWith('$2'), 'should be a bcrypt hash');
  assert.ok(!row.password_hash.includes('password123'));
});

test('a short password is rejected', async () => {
  const call = client();
  const { status } = await call('POST', '/api/auth/register', {
    name: 'Short', email: 'short@example.com', password: 'abc',
  });
  assert.equal(status, 422);
});

test('a duplicate email is rejected', async () => {
  const call = client();
  const { status } = await call('POST', '/api/auth/register', {
    name: 'Copy', email: 'test1@example.com', password: 'password123',
  });
  assert.equal(status, 409);
});

test('emails are matched case-insensitively', async () => {
  const call = client();
  const { status } = await call('POST', '/api/auth/login', {
    email: 'TEST1@EXAMPLE.COM', password: 'password123',
  });
  assert.equal(status, 200);
});

test('a wrong password does not reveal whether the account exists', async () => {
  const call = client();

  const wrongPassword = await call('POST', '/api/auth/login', {
    email: 'test1@example.com', password: 'wrongwrongwrong',
  });
  const noSuchUser = await call('POST', '/api/auth/login', {
    email: 'nobody@example.com', password: 'wrongwrongwrong',
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.equal(
    wrongPassword.data.error,
    noSuchUser.data.error,
    'identical messages, or the endpoint becomes an account enumerator'
  );
});

test('signing out ends the session', async () => {
  const call = client();
  await call('POST', '/api/auth/login', {
    email: 'demo@codealpha.tech', password: 'demo1234',
  });

  await call('POST', '/api/auth/logout');

  const me = await call('GET', '/api/auth/me');
  assert.equal(me.data.user, null);
});

/* ----------------------------------------------------------------- cart */

test('the cart requires authentication', async () => {
  const call = client();
  const { status, data } = await call('GET', '/api/cart');

  assert.equal(status, 401);
  assert.equal(data.code, 'AUTH_REQUIRED');
});

test('items can be added and the totals are correct', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Cart Tester', email: 'cart@example.com', password: 'password123',
  });

  const notebook = db
    .prepare('SELECT * FROM products WHERE slug = ?')
    .get('lumen-field-notebook');

  const { status, data } = await call('POST', '/api/cart', {
    productId: notebook.id, quantity: 3,
  });

  assert.equal(status, 201);
  assert.equal(data.count, 3);
  assert.equal(data.subtotalPence, notebook.price_pence * 3);
});

test('adding the same product again bumps the quantity, not the line count', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Bump', email: 'bump@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 5').get();

  await call('POST', '/api/cart', { productId: product.id, quantity: 2 });
  const { data } = await call('POST', '/api/cart', { productId: product.id, quantity: 3 });

  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].quantity, 5);
});

test('delivery is free over the threshold and charged below it', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Delivery', email: 'delivery@example.com', password: 'password123',
  });

  const cheap = db
    .prepare('SELECT * FROM products WHERE price_pence < 2000 AND stock > 0')
    .get();

  const small = await call('POST', '/api/cart', { productId: cheap.id, quantity: 1 });
  assert.equal(small.data.deliveryPence, 499, 'under £50 pays delivery');

  const desk = db
    .prepare('SELECT * FROM products WHERE slug = ?')
    .get('aerodesk-pro-standing-desk');

  const big = await call('POST', '/api/cart', { productId: desk.id, quantity: 1 });
  assert.equal(big.data.deliveryPence, 0, 'over £50 is free');
});

test('stock is respected when adding to the cart', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Greedy', email: 'greedy@example.com', password: 'password123',
  });

  const scarce = db
    .prepare('SELECT * FROM products WHERE stock > 0 ORDER BY stock ASC')
    .get();

  const { status, data } = await call('POST', '/api/cart', {
    productId: scarce.id, quantity: scarce.stock + 5,
  });

  assert.equal(status, 409);
  assert.equal(data.available, scarce.stock);
});

test('an out-of-stock product cannot be added', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Sold Out', email: 'soldout@example.com', password: 'password123',
  });

  const gone = db.prepare('SELECT * FROM products WHERE stock = 0').get();
  const { status, data } = await call('POST', '/api/cart', {
    productId: gone.id, quantity: 1,
  });

  assert.equal(status, 409);
  assert.match(data.error, /out of stock/i);
});

test('setting a quantity of zero removes the line', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Remover', email: 'remove@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 3').get();
  await call('POST', '/api/cart', { productId: product.id, quantity: 2 });

  const { data } = await call('PATCH', `/api/cart/${product.id}`, { quantity: 0 });

  assert.equal(data.items.length, 0);
  assert.equal(data.count, 0);
});

test('one customer cannot see another customer’s cart', async () => {
  const alice = client();
  const bob = client();

  await alice('POST', '/api/auth/register', {
    name: 'Alice', email: 'alice@example.com', password: 'password123',
  });
  await bob('POST', '/api/auth/register', {
    name: 'Bob', email: 'bob@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 2').get();
  await alice('POST', '/api/cart', { productId: product.id, quantity: 2 });

  const bobsCart = await bob('GET', '/api/cart');
  assert.equal(bobsCart.data.items.length, 0);
});

/* --------------------------------------------------------------- orders */

test('placing an order decrements stock, clears the cart, and snapshots prices', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Buyer', email: 'buyer@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 4').get();
  const stockBefore = product.stock;

  await call('POST', '/api/cart', { productId: product.id, quantity: 2 });

  const { status, data } = await call('POST', '/api/orders', {
    fullName: 'Buyer Person',
    address: '1 Test Street',
    city: 'London',
    postcode: 'E1 6AN',
  });

  assert.equal(status, 201);
  assert.match(data.order.reference, /^ORD-[A-Z0-9]{8}$/);
  assert.equal(data.order.items[0].quantity, 2);
  assert.equal(data.order.items[0].unit_pence, product.price_pence);
  assert.equal(data.order.items[0].product_name, product.name);

  const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id);
  assert.equal(after.stock, stockBefore - 2, 'stock must be decremented');

  const cart = await call('GET', '/api/cart');
  assert.equal(cart.data.items.length, 0, 'the cart is emptied');
});

test('a past order keeps its original price when the product is repriced', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Historian', email: 'history@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 2').get();
  const originalPrice = product.price_pence;

  await call('POST', '/api/cart', { productId: product.id, quantity: 1 });
  const { data } = await call('POST', '/api/orders', {
    fullName: 'H', address: 'A', city: 'C', postcode: 'P',
  });

  // The shop puts the price up afterwards.
  db.prepare('UPDATE products SET price_pence = ? WHERE id = ?')
    .run(originalPrice + 5000, product.id);

  const { data: fetched } = await call('GET', `/api/orders/${data.order.id}`);

  assert.equal(
    fetched.order.items[0].unit_pence,
    originalPrice,
    'a receipt that changes retroactively is not a receipt'
  );

  db.prepare('UPDATE products SET price_pence = ? WHERE id = ?')
    .run(originalPrice, product.id);
});

test('an empty cart cannot be checked out', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Empty', email: 'empty@example.com', password: 'password123',
  });

  const { status } = await call('POST', '/api/orders', {
    fullName: 'E', address: 'A', city: 'C', postcode: 'P',
  });

  assert.equal(status, 400);
});

test('missing delivery details are rejected', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'NoAddress', email: 'noaddress@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 1').get();
  await call('POST', '/api/cart', { productId: product.id, quantity: 1 });

  const { status } = await call('POST', '/api/orders', { fullName: 'Only a name' });
  assert.equal(status, 422);
});

test('one customer cannot read another customer’s order', async () => {
  const alice = client();
  const bob = client();

  await alice('POST', '/api/auth/register', {
    name: 'Alice2', email: 'alice2@example.com', password: 'password123',
  });
  await bob('POST', '/api/auth/register', {
    name: 'Bob2', email: 'bob2@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 2').get();
  await alice('POST', '/api/cart', { productId: product.id, quantity: 1 });

  const { data } = await alice('POST', '/api/orders', {
    fullName: 'A', address: 'A', city: 'C', postcode: 'P',
  });

  const attempt = await bob('GET', `/api/orders/${data.order.id}`);

  assert.equal(attempt.status, 404, 'not 403 — do not confirm it exists');
});

test('a failed order leaves no partial record behind', async () => {
  const call = client();
  await call('POST', '/api/auth/register', {
    name: 'Racer', email: 'racer@example.com', password: 'password123',
  });

  const product = db.prepare('SELECT * FROM products WHERE stock > 3').get();
  await call('POST', '/api/cart', { productId: product.id, quantity: 3 });

  const ordersBefore = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;

  // Somebody else buys the stock out from under them.
  db.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(product.id);

  const { status } = await call('POST', '/api/orders', {
    fullName: 'R', address: 'A', city: 'C', postcode: 'P',
  });

  assert.equal(status, 409);

  const ordersAfter = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  assert.equal(ordersAfter, ordersBefore, 'the transaction must roll back entirely');
});

/* ------------------------------------------------------------ plumbing */

test('an unknown API path returns JSON, not the HTML shell', async () => {
  const call = client();
  const { status, data } = await call('GET', '/api/not-a-real-endpoint');

  assert.equal(status, 404);
  assert.ok(data.error, 'must be JSON so fetch() can report it honestly');
});

test('the health endpoint reports real counts', async () => {
  const call = client();
  const { status, data } = await call('GET', '/api/health');

  assert.equal(status, 200);
  assert.ok(data.counts.products >= 16);
});
