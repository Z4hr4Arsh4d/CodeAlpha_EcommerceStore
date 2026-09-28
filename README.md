# CodeAlpha Task 1 — Simple E-commerce Store

A working storefront: product catalogue, search and filtering, a server-side
shopping basket, checkout with stock reservation, and order history.

**Stack:** Express.js · SQLite · vanilla HTML/CSS/JavaScript — no framework,
no build step.

---

## Run it

Requires **Node 18 or newer** (check with `node --version`).

```bash
npm install
npm run seed      # loads 16 products and a demo account
npm start
```

Open **http://localhost:3000**

**Demo account:** `demo@codealpha.tech` / `demo1234`
(or create your own — registration works)

```bash
npm test          # 30 API tests
npm run reset     # wipe and reload the catalogue
```

---

## Brief requirements

| Required | Where |
|---|---|
| Product listings | `/` — search, category filter, 5 sort orders, pagination |
| Product details page | `/product?slug=…` — full description, stock, related items |
| Shopping cart | `/cart` — server-side, tied to the account, live totals |
| Order processing | `/checkout` — stock reservation, transactional, reference number |
| User registration / login | `/login` — bcrypt, sessions, both flows on one page |
| Database for products, users, orders | SQLite, 5 tables, foreign keys enforced |

---

## How it is put together

```
server.js              Express app, session config, static serving
src/
  db.js                Schema, connection, cart and order queries
  auth.js              Registration, login, session middleware
  seed.js              Catalogue and demo account
  routes/
    auth.routes.js     register · login · logout · me
    products.routes.js list · categories · one product
    cart.routes.js     get · add · update · remove · clear
    orders.routes.js   checkout · history · one order
public/
  index.html           Product listing
  product.html         Product details
  cart.html            Basket
  checkout.html        Delivery details and confirmation
  orders.html          Order history
  login.html           Sign in / create account
  css/styles.css       One stylesheet, light and dark
  js/api.js            Shared fetch wrapper, header, toasts
  js/*.js              One script per page
tests/api.test.js      30 tests against a real server
```

---

## Decisions worth explaining

**Money is stored in pence, as integers.** `0.1 + 0.2 !== 0.3` in binary
floating point. A storefront that rounds a total wrongly loses trust faster
than one that looks plain, so prices are integers everywhere and only become
`£12.34` at the moment they are displayed.

**Order lines snapshot the name and price.** `order_items` stores
`product_name` and `unit_pence` rather than joining to `products` at read
time. If a product is renamed or repriced later, a past order still shows what
the customer actually agreed to pay — a receipt that changes retroactively is
not a receipt.

**Checkout is one transaction.** Between reading stock and writing the order
there is a window where a second request could buy the last item. The whole
operation — insert order, insert lines, decrement stock, clear cart — commits
or rolls back together, and the stock update carries its own
`WHERE stock >= ?` guard so a race cannot drive stock negative. There is a
test that simulates exactly this and asserts no partial order is left behind.

**The basket lives in the database, not `localStorage`.** It belongs to a
user, so it survives signing in on another device. That is why every cart
route is behind authentication.

**Login says "email or password is incorrect" — never which.** Telling an
attacker that an email exists turns a password guess into account
enumeration. The bcrypt comparison also runs against a dummy hash when no user
is found, so a missing account is not measurably faster to reject than a wrong
password. There is a test asserting both messages are byte-identical.

**The sort column is looked up in an allow-list.** SQL will not parameterise
an identifier, so `?sort=` is the one value that cannot be bound. It is
matched against a fixed map rather than interpolated — that is the difference
between a sort option and an injection point, and there is a test that sends
`name; DROP TABLE products--` and checks the table survives.

---

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | `{name, email, password}` |
| `POST` | `/api/auth/login` | `{email, password}` |
| `POST` | `/api/auth/logout` | |
| `GET` | `/api/auth/me` | Current user or `null` |
| `GET` | `/api/products` | `?search= &category= &sort= &page= &limit=` |
| `GET` | `/api/products/categories` | With counts |
| `GET` | `/api/products/:idOrSlug` | Plus related items |
| `GET` | `/api/cart` | 🔒 |
| `POST` | `/api/cart` | 🔒 `{productId, quantity}` |
| `PATCH` | `/api/cart/:productId` | 🔒 `{quantity}` — 0 removes |
| `DELETE` | `/api/cart/:productId` | 🔒 |
| `DELETE` | `/api/cart` | 🔒 Empty the basket |
| `POST` | `/api/orders` | 🔒 `{fullName, address, city, postcode}` |
| `GET` | `/api/orders` | 🔒 History |
| `GET` | `/api/orders/:id` | 🔒 One order |
| `GET` | `/api/health` | Counts |

🔒 = requires a session. Returns `401 {code: "AUTH_REQUIRED"}` otherwise.

---

## Tests

```bash
npm test
```

30 tests against a real Express server and a real temporary SQLite database —
no mocks, because a mocked database will happily agree that stock decremented
when it did not.

They cover pagination, search, category filtering, sort injection, password
hashing, timing-safe login messages, duplicate registration, cart stock
limits, out-of-stock handling, delivery threshold maths, cross-user cart
isolation, transactional checkout, price snapshotting, order access control,
and rollback on a stock race.

---

## Configuration

Copy `.env.example` to `.env` to change anything:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | dev default | **Change before deploying** |
| `DB_PATH` | `./data/store.db` | SQLite file |
| `NODE_ENV` | `development` | `production` requires HTTPS for cookies |

---

## What this would need before production

Stated plainly, because a project that claims to be finished is less credible
than one that knows its edges:

- **Payment.** Checkout records an order; no money moves. A real integration
  (Stripe, and a webhook to confirm) is the next step.
- **CSRF tokens.** `sameSite: lax` cookies block the common case, but a
  state-changing API should carry a token.
- **Rate limiting.** Nothing stops a thousand login attempts a minute.
- **Email.** No order confirmation is sent.
- **Admin interface.** Products are seeded from a file; there is no UI to add
  or edit them.

---

**Zahra Arshad** · CodeAlpha Full Stack Development Internship
