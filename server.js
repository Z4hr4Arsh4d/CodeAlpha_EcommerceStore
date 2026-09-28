/**
 * CodeAlpha Task 1 — Simple E-commerce Store
 * Express + SQLite + vanilla HTML/CSS/JS
 */

'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const { attachUser } = require('./src/auth');
const { db } = require('./src/db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Sessions live in SQLite, not in process memory. The default MemoryStore
// leaks and loses every signed-in user on restart — fine for a demo, wrong
// for anything that claims to be a full-stack application.
app.use(
  session({
    name: 'shop.sid',
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: path.join(__dirname, 'data'),
    }),
    secret: process.env.SESSION_SECRET || 'codealpha-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,                              // JavaScript cannot read it
      sameSite: 'lax',                             // basic CSRF protection
      secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
      maxAge: 1000 * 60 * 60 * 24 * 7,             // one week
    },
  })
);

app.use(attachUser);

app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/products', require('./src/routes/products.routes'));
app.use('/api/cart', require('./src/routes/cart.routes'));
app.use('/api/orders', require('./src/routes/orders.routes'));

app.get('/api/health', (req, res) => {
  const products = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const orders = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;

  res.json({
    status: 'ok',
    signedInAs: req.user ? req.user.email : null,
    counts: { products, users, orders },
  });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// An unknown /api/* path must return JSON. Falling through to the SPA's
// index.html would hand the fetch() layer a page of HTML to parse as JSON,
// producing "Unexpected token <" instead of an honest 404.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('[error]', error);
  res.status(error.status || 500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong on our side.'
        : error.message,
  });
});

if (require.main === module) {
  const products = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;

  if (products === 0) {
    console.log('\n  No products yet. Run  npm run seed  to load the catalogue.\n');
  }

  app.listen(PORT, () => {
    console.log(`\n  CodeAlpha E-commerce Store`);
    console.log(`  ${'-'.repeat(46)}`);
    console.log(`  Running at  http://localhost:${PORT}`);
    console.log(`  Products    ${products}`);
    console.log(`  Demo login  demo@codealpha.tech / demo1234`);
    console.log(`  ${'-'.repeat(46)}\n`);
  });
}

module.exports = app;
