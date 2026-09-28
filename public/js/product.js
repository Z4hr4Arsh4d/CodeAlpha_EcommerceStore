/* Product details page. */

const view = document.getElementById('view');
const slug = new URLSearchParams(location.search).get('slug');
const id = new URLSearchParams(location.search).get('id');

let current = null;
let quantity = 1;

function render(product, related) {
  const out = product.stock === 0;
  const max = Math.min(product.stock, 99);

  view.innerHTML = `
    <p class="small muted" style="margin-bottom:18px">
      <a href="/">Shop</a> &rsaquo;
      <a href="/?cat=${encodeURIComponent(product.category)}">${escapeHtml(product.category)}</a> &rsaquo;
      ${escapeHtml(product.name)}
    </p>

    <div class="detail">
      <div class="hero" style="${thumbStyle(product.colour)}">${product.emoji}</div>

      <div>
        <div class="cat muted small" style="text-transform:uppercase;letter-spacing:.06em">${escapeHtml(product.category)}</div>
        <h1>${escapeHtml(product.name)}</h1>

        <div class="row" style="margin-bottom:14px">
          <span class="stars">${stars(product.rating)}</span>
          <span class="muted small">${product.rating} out of 5</span>
        </div>

        <p style="font-size:1.75rem;font-weight:700;margin:0 0 6px">${money(product.price_pence)}</p>

        <p class="small ${out ? '' : 'muted'}" style="margin-bottom:20px">
          ${out
            ? '<span style="color:var(--danger);font-weight:600">Out of stock</span>'
            : product.stock <= 5
              ? `<span style="color:var(--warn);font-weight:600">Only ${product.stock} left in stock</span>`
              : `${product.stock} in stock · free delivery over £50`}
        </p>

        <p style="margin-bottom:24px">${escapeHtml(product.description)}</p>

        ${out ? '' : `
          <div class="row" style="margin-bottom:16px">
            <div class="qty">
              <button type="button" id="minus" aria-label="Decrease quantity">−</button>
              <span id="qty">1</span>
              <button type="button" id="plus" aria-label="Increase quantity">+</button>
            </div>
            <span class="muted small">Maximum ${max}</span>
          </div>
          <button class="btn lg block" id="add">Add to basket</button>
        `}
      </div>
    </div>

    ${related.length ? `
      <section style="margin-top:56px">
        <h2>More in ${escapeHtml(product.category)}</h2>
        <div class="grid">
          ${related.map((item) => `
            <article class="product">
              <div class="thumb" style="${thumbStyle(item.colour)}">${item.emoji}</div>
              <div class="body">
                <div class="name"><a href="/product?slug=${encodeURIComponent(item.slug)}">${escapeHtml(item.name)}</a></div>
                <div class="foot"><span class="price">${money(item.price_pence)}</span></div>
              </div>
            </article>`).join('')}
        </div>
      </section>` : ''}
  `;

  if (out) return;

  const label = document.getElementById('qty');

  document.getElementById('minus').addEventListener('click', () => {
    quantity = Math.max(1, quantity - 1);
    label.textContent = quantity;
  });

  document.getElementById('plus').addEventListener('click', () => {
    quantity = Math.min(max, quantity + 1);
    label.textContent = quantity;
  });

  document.getElementById('add').addEventListener('click', addToCart);
}

async function addToCart() {
  if (!Session.user) return requireSignIn('Sign in to start a basket.');

  const button = document.getElementById('add');
  button.disabled = true;
  button.textContent = 'Adding…';

  try {
    const cart = await API.post('/api/cart', { productId: current.id, quantity });
    Session.cartCount = cart.count;
    renderHeader();
    toast(`${quantity} × ${current.name} added`);
    button.textContent = 'Added to basket ✓';
    setTimeout(() => { button.textContent = 'Add to basket'; button.disabled = false; }, 1400);
  } catch (error) {
    toast(error.message);
    button.textContent = 'Add to basket';
    button.disabled = false;
  }
}

async function load() {
  const key = slug || id;

  if (!key) {
    view.innerHTML = `<div class="empty">
        <div class="icon">🤔</div>
        <h2>No product specified</h2>
        <p><a class="btn" href="/">Back to the shop</a></p>
      </div>`;
    return;
  }

  view.innerHTML = '<div class="skeleton" style="height:420px"></div>';

  try {
    const { product, related } = await API.get(`/api/products/${encodeURIComponent(key)}`);
    current = product;
    document.title = `${product.name} — CodeAlpha Store`;
    render(product, related);
  } catch (error) {
    view.innerHTML = `<div class="empty">
        <div class="icon">🔍</div>
        <h2>${escapeHtml(error.message)}</h2>
        <p><a class="btn" href="/">Back to the shop</a></p>
      </div>`;
  }
}

load();
