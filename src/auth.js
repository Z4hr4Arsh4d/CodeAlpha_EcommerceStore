/**
 * Authentication — registration, login, and the middleware that guards
 * everything behind them.
 *
 * Three decisions worth stating:
 *
 * 1. Passwords are hashed with bcrypt, never stored or logged. A cost factor
 *    of 12 is the current sensible default: slow enough to make offline
 *    cracking expensive, fast enough that a login still feels instant.
 *
 * 2. Login failures say "email or password is incorrect" — never which one
 *    was wrong. Telling an attacker that an email exists turns a password
 *    guess into an account enumeration.
 *
 * 3. The session holds only the user id. Everything else is read fresh from
 *    the database, so a deleted or renamed account cannot keep acting on a
 *    stale copy of itself carried in a cookie.
 */

'use strict';

const bcrypt = require('bcryptjs');
const { db } = require('./db');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

/** Deliberately permissive — the real check is sending a confirmation mail. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validateRegistration({ name, email, password }) {
  const errors = [];

  if (!name || !String(name).trim()) {
    errors.push('Your name is required.');
  } else if (String(name).trim().length > 80) {
    errors.push('That name is too long (80 characters maximum).');
  }

  if (!email || !EMAIL_PATTERN.test(String(email).trim())) {
    errors.push('A valid email address is required.');
  }

  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    errors.push(
      `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }

  return errors;
}

function register({ name, email, password }) {
  const errors = validateRegistration({ name, email, password });
  if (errors.length) throw new AuthError(errors.join(' '), 422);

  const cleanEmail = String(email).trim().toLowerCase();

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(cleanEmail);

  if (existing) {
    // Registration is the one place an account must be acknowledged —
    // there is no way to offer a useful message otherwise.
    throw new AuthError('An account with that email already exists.', 409);
  }

  const hash = bcrypt.hashSync(String(password), BCRYPT_ROUNDS);

  const result = db
    .prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    )
    .run(String(name).trim(), cleanEmail, hash);

  return publicUser(result.lastInsertRowid);
}

function login({ email, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase();

  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(cleanEmail);

  // Run the comparison even when no user was found, against a dummy hash.
  // Returning early would make a missing account measurably faster to reject
  // than a wrong password, which leaks exactly what the generic message is
  // trying to hide.
  const hash = user
    ? user.password_hash
    : '$2a$12$abcdefghijklmnopqrstuvwxyz012345678901234567890123456';

  const matches = bcrypt.compareSync(String(password || ''), hash);

  if (!user || !matches) {
    throw new AuthError('That email or password is incorrect.', 401);
  }

  return publicUser(user.id);
}

/** A user object safe to send to the browser — no hash, ever. */
function publicUser(id) {
  return db
    .prepare('SELECT id, name, email, created_at FROM users WHERE id = ?')
    .get(id);
}

/** Attaches req.user when a valid session exists. Never blocks. */
function attachUser(req, res, next) {
  req.user = req.session?.userId ? publicUser(req.session.userId) : null;

  // A session pointing at a deleted account is stale; clear it rather than
  // leaving a cookie that half-works.
  if (req.session?.userId && !req.user) {
    req.session.destroy(() => next());
    return;
  }

  next();
}

/** Blocks anonymous requests. Use on anything touching a user's own data. */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Please sign in to continue.',
      code: 'AUTH_REQUIRED',
    });
  }
  next();
}

module.exports = {
  register,
  login,
  publicUser,
  attachUser,
  requireAuth,
  AuthError,
  MIN_PASSWORD_LENGTH,
};
