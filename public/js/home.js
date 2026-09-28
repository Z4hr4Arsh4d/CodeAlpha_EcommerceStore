/* Product listing: search, category filter, sort, pagination. */

const state = { search: '', category: 'all', sort: 'newest', page: 1 };

const grid = document.getElementById('grid');
const chips = document.getElementById('chips');
const countLabel = document.getElementById('count');
const pagination = document.getElementById('pagination');

function productCard(product) {
  const out = product.stock === 0;
  const low = !out && product.stock <= 5;

  const tag = out
    ? '<span class="tag out">Out of stock</span>'
    : low
      ? `<span class="tag low">Only ${product.stock} left</span>`
      : '';

  return `
    <article class="product">
      <div class="thumb" style="${thumbStyle(product.colour)}">
        ${product.emoji}${tag}
      </div>
      <div class="body">
        <div class="cat">${escapeHtml(product.category)}</div>
        <div class="name"><a href="/product?slug=${encodeURIComponent(product.slug)}">${escapeHtml(product.name)}</a></div>
        <div class="stars" title="${product.rating} out of 5">${stars(product.rating)} <span class="muted small">${product.rating}</span></div>
        <div class="foot">
          <span class="price">${money(product.price_pence)}</span>
          <button class="btn sm" data-add="${product.id}" ${out ? 'disabled' : ''}>
            ${out ? 'Sold out' : 'Add'}
          </button>
        </div>
      </div>
    </article>`;
}

function showSkeletons() {
  grid.innerHTML = Array.from({ length: 8 })
    .map(() => '<div class="skeleton" style="height: 290px"></div>')
    .join('');
}

async function loadCategories() {
  const { categories } = await API.get('/api/products/categories');
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  chips.innerHTML = [
    `<button class="chip ${state.category === 'all' ? 'on' : ''}" data-cat="all">All ${total}</button>`,
    ...categories.map(
      (c) => `<button class="chip ${state.category === c.category ? 'on' : ''}" data-cat="${escapeHtml(c.category)}">${escapeHtml(c.category)} ${c.count}</button>`
    ),
  ].join('');
}

async function loadProducts() {
  showSkeletons();

  const params = new URLSearchParams({
    sort: state.sort,
    page: String(state.page),
    limit: '12',
  });
  if (state.search) params.set('search', state.search);
  if (state.category !== 'all') params.set('category', state.category);

  try {
    const { products, pagination: page } = await API.get(`/api/products?${params}`);

    if (products.length === 0) {
      grid.innerHTML = '';
      grid.insertAdjacentHTML('beforebegin', '');
      grid.innerHTML = `<div class="empty" style="grid-column: 1/-1">
          <div class="icon">🔍</div>
          <h3>Nothing matched that</h3>
          <p>Try a different search, or clear the filters.</p>
        </div>`;
      countLabel.textContent = '';
      pagination.innerHTML = '';
      return;
    }

    grid.innerHTML = products.map(productCard).join('');

    countLabel.textContent = `${page.total} product${page.total === 1 ? '' : 's'}`;
    renderPagination(page);
  } catch (error) {
    grid.innerHTML = `<div class="msg error" style="grid-column: 1/-1">${escapeHtml(error.message)}</div>`;
  }
}

function renderPagination({ page, pages }) {
  if (pages <= 1) { pagination.innerHTML = ''; return; }

  const buttons = [
    `<button class="btn ghost sm" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button>`,
  ];

  for (let n = 1; n <= pages; n += 1) {
    buttons.push(
      `<button class="btn ${n === page ? '' : 'ghost'} sm" data-page="${n}">${n}</button>`
    );
  }

  buttons.push(
    `<button class="btn ghost sm" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next</button>`
  );

  pagination.innerHTML = buttons.join('');
}

async function addToCart(productId, button) {
  if (!Session.user) return requireSignIn('Sign in to start a basket.');

  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Adding…';

  try {
    const cart = await API.post('/api/cart', { productId: Number(productId), quantity: 1 });
    Session.cartCount = cart.count;
    renderHeader();
    toast('Added to your basket');
    button.textContent = 'Added ✓';
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1100);
  } catch (error) {
    toast(error.message);
    button.textContent = original;
    button.disabled = false;
  }
}

/* -------------------------------------------------------------- events */

// One listener on the container rather than one per button: the grid is
// re-rendered on every filter change, and per-card listeners would have to
// be re-attached each time (and leak if they were not).
grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (button) addToCart(button.dataset.add, button);
});

chips.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-cat]');
  if (!chip) return;
  state.category = chip.dataset.cat;
  state.page = 1;
  loadCategories();
  loadProducts();
});

pagination.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  state.page = Number(button.dataset.page);
  loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Debounced so typing "keyboard" fires one request, not eight.
let searchTimer = null;
document.getElementById('search').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = event.target.value.trim();
    state.page = 1;
    loadProducts();
  }, 280);
});

document.getElementById('sort').addEventListener('change', (event) => {
  state.sort = event.target.value;
  state.page = 1;
  loadProducts();
});

loadCategories();
loadProducts();
