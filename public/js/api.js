/* Shared frontend helpers: API calls, money formatting, the header, toasts.
   Loaded by every page before its own script. */

const API = {
  /**
   * One place where every request is made, so error handling exists once.
   *
   * The server always answers /api/* with JSON, including on errors, so this
   * can assume a JSON body and surface `error` as the thrown message. A
   * fetch() sprinkled through each page would mean each page inventing its
   * own idea of what failure looks like.
   */
  async request(url, options = {}) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', // send the session cookie
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      throw new Error(`The server returned an unreadable response (${response.status}).`);
    }

    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      error.code = data.code;
      error.data = data;
      throw error;
    }

    return data;
  },

  get: (url) => API.request(url),
  post: (url, body) => API.request(url, { method: 'POST', body }),
  patch: (url, body) => API.request(url, { method: 'PATCH', body }),
  delete: (url) => API.request(url, { method: 'DELETE' }),
};

/** Pence to "£12.34". Money is integers everywhere until it is displayed. */
function money(pence) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format((pence || 0) / 100);
}

function stars(rating) {
  const full = Math.round(rating || 0);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

/**
 * Escape anything that came from a user or the database before it goes
 * into innerHTML. Product names and delivery addresses are user-controlled;
 * dropping them into markup unescaped is how an XSS lands.
 */
function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

/** A gradient tile standing in for a product photograph. */
function thumbStyle(colour) {
  const base = colour || '#6366f1';
  return `background: linear-gradient(135deg, ${base}22, ${base}55); color: ${base};`;
}

let toastTimer = null;
function toast(message, kind = '') {
  let element = document.getElementById('toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'toast';
    document.body.appendChild(element);
  }
  element.textContent = message;
  element.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2800);
}

/** Session state, fetched once per page load and shared. */
const Session = {
  user: null,
  cartCount: 0,

  async load() {
    try {
      const { user } = await API.get('/api/auth/me');
      this.user = user;
    } catch {
      this.user = null;
    }

    if (this.user) {
      try {
        const cart = await API.get('/api/cart');
        this.cartCount = cart.count;
      } catch {
        this.cartCount = 0;
      }
    }

    renderHeader();
    return this.user;
  },

  async logout() {
    await API.post('/api/auth/logout');
    this.user = null;
    this.cartCount = 0;
    location.href = '/';
  },
};

function renderHeader() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  const here = location.pathname.replace(/\/$/, '') || '/';
  const on = (path) => (here === path ? 'active' : '');

  const links = [
    `<a href="/" class="${on('/')}">Shop</a>`,
    `<a href="/cart" class="${on('/cart')} cart-pill">
       Basket${Session.cartCount ? `<span class="badge">${Session.cartCount}</span>` : ''}
     </a>`,
  ];

  if (Session.user) {
    links.push(`<a href="/orders" class="${on('/orders')}">Orders</a>`);
    links.push(
      `<a href="#" id="logout" title="${escapeHtml(Session.user.email)}">Sign out</a>`
    );
  } else {
    links.push(`<a href="/login" class="${on('/login')}">Sign in</a>`);
  }

  nav.innerHTML = links.join('');

  const logout = document.getElementById('logout');
  if (logout) {
    logout.addEventListener('click', (event) => {
      event.preventDefault();
      Session.logout();
    });
  }
}

/** Send an unauthenticated visitor to sign in, and back here afterwards. */
function requireSignIn(message = 'Please sign in to continue.') {
  toast(message);
  const next = encodeURIComponent(location.pathname + location.search);
  setTimeout(() => { location.href = `/login?next=${next}`; }, 900);
}

document.addEventListener('DOMContentLoaded', () => Session.load());
