'use strict';

const express = require('express');
const { register, login, AuthError } = require('../auth');

const router = express.Router();

router.post('/register', (req, res) => {
  try {
    const user = register(req.body || {});
    req.session.userId = user.id;
    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
});

router.post('/login', (req, res) => {
  try {
    const user = login(req.body || {});

    // Rotate the session id on login. Without this, a session fixation
    // attack works: an attacker sets a known session cookie on a victim's
    // browser and inherits it the moment the victim signs in.
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Could not sign you in.' });
      req.session.userId = user.id;
      res.json({ user });
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('shop.sid');
    res.json({ ok: true });
  });
});

/** Who am I? Used by every page on load to decide what to render. */
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
