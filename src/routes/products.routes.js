'use strict';

const express = require('express');
const { db } = require('../db');

const router = express.Router();

const SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
  'price-asc': 'p.price_pence ASC',
  'price-desc': 'p.price_pence DESC',
  rating: 'p.rating DESC',
  name: 'p.name COLLATE NOCASE ASC',
};

/**
 * GET /api/products
 *
 * Supports ?search= &category= &sort= &page= &limit=
 *
 * Every user value goes in as a bound parameter, never string-concatenated.
 * The sort column is the one thing that cannot be bound — SQL will not
 * parameterise an identifier — so it is looked up in a fixed allow-list
 * above rather than interpolated. That is the difference between a sort
 * option and an injection point.
 */
router.get('/', (req, res) => {
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();
  const sort = SORTS[req.query.sort] ? req.query.sort : 'newest';

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 48);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  if (search) {
    where.push('(p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  if (category && category !== 'all') {
    where.push('p.category = ?');
    params.push(category);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM products p ${clause}`)
    .get(...params).n;

  const products = db
    .prepare(
      `SELECT p.* FROM products p ${clause} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  res.json({
    products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

/** Distinct categories, with counts — drives the filter bar. */
router.get('/categories', (req, res) => {
  const categories = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM products GROUP BY category ORDER BY category`
    )
    .all();

  res.json({ categories });
});

/** One product, by numeric id or slug. */
router.get('/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;

  const product = /^\d+$/.test(key)
    ? db.prepare('SELECT * FROM products WHERE id = ?').get(Number(key))
    : db.prepare('SELECT * FROM products WHERE slug = ?').get(key);

  if (!product) {
    return res.status(404).json({ error: 'That product does not exist.' });
  }

  const related = db
    .prepare(
      `SELECT * FROM products
       WHERE category = ? AND id != ?
       ORDER BY rating DESC LIMIT 4`
    )
    .all(product.category, product.id);

  res.json({ product, related });
});

module.exports = router;
