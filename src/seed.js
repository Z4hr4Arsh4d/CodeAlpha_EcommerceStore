/**
 * Seeds the catalogue and a demo account.
 *
 * Safe to run twice: it refuses to wipe an existing database unless you pass
 * --force. Losing somebody's test orders because they re-ran a setup command
 * is a small, avoidable annoyance.
 *
 *   npm run seed     load the catalogue if empty
 *   npm run reset    wipe and reload
 */

'use strict';

const bcrypt = require('bcryptjs');
const { db } = require('./db');

const force = process.argv.includes('--force');

const PRODUCTS = [
  {
    name: 'AeroDesk Pro Standing Desk',
    category: 'furniture',
    price_pence: 54900,
    stock: 12,
    emoji: '🪑',
    colour: '#0ea5e9',
    rating: 4.8,
    description:
      'A motorised standing desk that remembers three height presets and nudges you to change posture every 50 minutes. Solid bamboo top, 120kg lift capacity, ships flat and assembles in about 15 minutes.',
  },
  {
    name: 'Kettle & Co Pour-Over Kettle',
    category: 'kitchen',
    price_pence: 8900,
    stock: 40,
    emoji: '🫖',
    colour: '#f59e0b',
    rating: 4.6,
    description:
      'A gooseneck kettle with a half-degree temperature readout and a 60-second hold. Stainless steel, one litre, built for filter coffee where the pour rate actually matters.',
  },
  {
    name: 'Lumen Field Notebook',
    category: 'stationery',
    price_pence: 1850,
    stock: 120,
    emoji: '📓',
    colour: '#8b5cf6',
    rating: 4.7,
    description:
      '192 pages of 90gsm paper that takes fountain pen ink without bleeding through. Lay-flat binding, water-resistant cover, fits a coat pocket.',
  },
  {
    name: 'Halcyon Contoured Sleep Mask',
    category: 'travel',
    price_pence: 2400,
    stock: 65,
    emoji: '😴',
    colour: '#6366f1',
    rating: 4.5,
    description:
      'A contoured sleep mask with zero pressure on the eyelids, blocking effectively all light. Memory foam, adjustable strap, machine washable.',
  },
  {
    name: 'Ridgeline 28L Trail Pack',
    category: 'outdoor',
    price_pence: 11900,
    stock: 18,
    emoji: '🎒',
    colour: '#10b981',
    rating: 4.9,
    description:
      'A 28 litre hiking pack weighing 780 grams. Recycled ripstop nylon, a hip belt that genuinely carries load, and a sleeve for a 3L reservoir.',
  },
  {
    name: 'Nocturne Desk Lamp',
    category: 'furniture',
    price_pence: 7400,
    stock: 27,
    emoji: '💡',
    colour: '#f43f5e',
    rating: 4.4,
    description:
      'A warm-to-cool adjustable desk lamp with a 95 CRI panel, so colours on paper look like colours. Touch dimming, USB-C powered, weighted base.',
  },
  {
    name: 'Cascade Ceramic Mug Set',
    category: 'kitchen',
    price_pence: 3200,
    stock: 54,
    emoji: '☕',
    colour: '#ec4899',
    rating: 4.3,
    description:
      'Four 350ml stoneware mugs with a reactive glaze, so no two are identical. Dishwasher and microwave safe, and heavy enough not to skid.',
  },
  {
    name: 'Meridian Mechanical Keyboard',
    category: 'tech',
    price_pence: 13900,
    stock: 9,
    emoji: '⌨️',
    colour: '#14b8a6',
    rating: 4.8,
    description:
      'A 75% hot-swappable mechanical keyboard with a gasket mount and sound-dampening foam. Tactile switches fitted, PBT keycaps, USB-C detachable cable.',
  },
  {
    name: 'Cirrus Noise-Cancelling Headphones',
    category: 'tech',
    price_pence: 22900,
    stock: 15,
    emoji: '🎧',
    colour: '#3b82f6',
    rating: 4.7,
    description:
      'Over-ear headphones with adaptive noise cancellation and 34 hours of battery. Memory foam earcups, multipoint pairing, folds flat for travel.',
  },
  {
    name: 'Terra Cotta Planter Trio',
    category: 'home',
    price_pence: 2900,
    stock: 73,
    emoji: '🪴',
    colour: '#f97316',
    rating: 4.2,
    description:
      'Three unglazed terracotta planters in graduated sizes, with matching saucers. Porous clay lets roots breathe, which is most of what keeps a plant alive.',
  },
  {
    name: 'Atlas Wool Throw',
    category: 'home',
    price_pence: 8900,
    stock: 22,
    emoji: '🧣',
    colour: '#a855f7',
    rating: 4.6,
    description:
      'A lambswool throw woven in a herringbone twill, 130 × 180cm. Heavy enough to stay put on a sofa, soft enough to sleep under.',
  },
  {
    name: 'Compass Travel Wallet',
    category: 'travel',
    price_pence: 4500,
    stock: 38,
    emoji: '👜',
    colour: '#0891b2',
    rating: 4.4,
    description:
      'Full-grain leather travel wallet with RFID-blocking card slots, a passport sleeve and a pen loop. Ages well rather than wearing out.',
  },
  {
    name: 'Everyday Chef Knife',
    category: 'kitchen',
    price_pence: 6900,
    stock: 31,
    emoji: '🔪',
    colour: '#dc2626',
    rating: 4.9,
    description:
      'A 20cm chef knife in Japanese stainless, hardened to 58 HRC. Holds an edge, takes one back easily, and the handle balances at the bolster.',
  },
  {
    name: 'Studio Monitor Speakers',
    category: 'tech',
    price_pence: 27900,
    stock: 6,
    emoji: '🔊',
    colour: '#7c3aed',
    rating: 4.5,
    description:
      'A pair of 5-inch active near-field monitors with a flat response curve. Designed to tell you what a mix actually sounds like, not to flatter it.',
  },
  {
    name: 'Grove Bamboo Chopping Board',
    category: 'kitchen',
    price_pence: 3400,
    stock: 0,
    emoji: '🪵',
    colour: '#65a30d',
    rating: 4.1,
    description:
      'End-grain bamboo board with a juice groove, 40 × 30cm. Kind to knife edges and light enough to lift one-handed when full.',
  },
  {
    name: 'Summit Insulated Bottle',
    category: 'outdoor',
    price_pence: 2800,
    stock: 88,
    emoji: '🍶',
    colour: '#059669',
    rating: 4.6,
    description:
      'A 750ml vacuum-insulated bottle that keeps drinks cold for 24 hours or hot for 12. Wide mouth for ice, and a lid that does not leak in a bag.',
  },
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function seed() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;

  if (existing > 0 && !force) {
    console.log(
      `\n  The catalogue already has ${existing} products — nothing to do.`
    );
    console.log('  To wipe and reload:  npm run reset\n');
    return;
  }

  const load = db.transaction(() => {
    if (force) {
      // Order matters: children before parents, or the foreign keys refuse.
      db.exec(`
        DELETE FROM order_items;
        DELETE FROM orders;
        DELETE FROM cart_items;
        DELETE FROM products;
        DELETE FROM users;
      `);
      console.log('  Cleared existing data.');
    }

    const insert = db.prepare(
      `INSERT INTO products
         (name, slug, description, category, price_pence, stock, emoji, colour, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const product of PRODUCTS) {
      insert.run(
        product.name,
        slugify(product.name),
        product.description,
        product.category,
        product.price_pence,
        product.stock,
        product.emoji,
        product.colour,
        product.rating
      );
    }

    // A demo account, so a reviewer can sign in without registering first.
    const hash = bcrypt.hashSync('demo1234', 12);
    db.prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    ).run('Demo Customer', 'demo@codealpha.tech', hash);
  });

  load();

  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const inStock = db
    .prepare('SELECT COUNT(*) AS n FROM products WHERE stock > 0')
    .get().n;

  console.log(`\n  Seeded ${count} products (${inStock} in stock).`);
  console.log('  Demo account: demo@codealpha.tech / demo1234');
  console.log('\n  Start the server with:  npm start\n');
}

if (require.main === module) seed();

module.exports = { seed, PRODUCTS, slugify };
