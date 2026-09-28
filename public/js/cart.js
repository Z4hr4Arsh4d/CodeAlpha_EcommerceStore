/* Basket page: line items, quantity controls, totals. */

const view = document.getElementById('view');

function render(cart) {
  if (cart.items.length === 0) {
    view.innerHTML = `<div class="empty">
        <div class="icon">🧺</div>
        <h2>Your basket is empty</h2>
        <p class="muted">Nothing here yet.</p>
        <p style="margin-top:20px"><a class="btn" href="/">Browse the shop</a></p>
      </div>`;
    return;
  }

  view.innerHTML = `
    <div class="two-col">
      <div class="card pad">
        ${cart.items.map(line).join('')}
        <div style="margin-top:18px; text-align:right">
          <button class="btn danger sm" id="clear">Empty basket</button>
        </div>
      </div>

      <div class="card pad">
        <h3>Summary</h3>
        <div class="totals" style="margin-top:14px">
          <div class="line"><span>Subtotal</span><span>${money(cart.subtotalPence)}</span></div>
          <div class="line">
            <span>Delivery</span>
            <span>${cart.deliveryPence === 0 ? '<strong style="color:var(--success)">Free</strong>' : money(cart.deliveryPence)}</span>
          </div>
          ${cart.deliveryPence > 0 ? `
            <p class="small muted" style="margin:0">
              Spend ${money(5000 - cart.subtotalPence)} more for free delivery.
            </p>` : ''}
          <div class="line grand"><span>Total</span><span>${money(cart.totalPence)}</span></div>
        </div>
        <a class="btn block lg" href="/checkout" style="margin-top:18px">Checkout</a>
        <p class="center small muted" style="margin-top:12px"><a href="/">Continue shopping</a></p>
      </div>
    </div>`;
}

function line(item) {
  const atMax = item.quantity >= item.stock;

  return `
    <div class="cart-line" data-product="${item.product_id}">
      <div class="thumb" style="${thumbStyle(item.colour)}">${item.emoji}</div>

      <div>
        <div style="font-weight:600">
          <a href="/product?slug=${encodeURIComponent(item.slug)}">${escapeHtml(item.name)}</a>
        </div>
        <div class="muted small">${money(item.price_pence)} each</div>
        ${atMax ? `<div class="small" style="color:var(--warn)">Maximum stock reached</div>` : ''}
      </div>

      <div style="text-align:right">
        <div class="qty" style="margin-bottom:8px">
          <button type="button" data-step="-1" aria-label="Decrease">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-step="1" ${atMax ? 'disabled' : ''} aria-label="Increase">+</button>
        </div>
        <div style="font-weight:700">${money(item.line_total_pence)}</div>
        <button class="btn danger sm" data-remove style="margin-top:4px">Remove</button>
      </div>
    </div>`;
}

async function update(productId, quantity) {
  try {
    const cart = await API.patch(`/api/cart/${productId}`, { quantity });
    Session.cartCount = cart.count;
    renderHeader();
    render(cart);
  } catch (error) {
    toast(error.message);
  }
}

view.addEventListener('click', async (event) => {
  const row = event.target.closest('[data-product]');
  if (!row) {
    if (event.target.id === 'clear') {
      if (!confirm('Empty your basket?')) return;
      const cart = await API.delete('/api/cart');
      Session.cartCount = 0;
      renderHeader();
      render(cart);
    }
    return;
  }

  const productId = Number(row.dataset.product);
  const current = Number(row.querySelector('.qty span').textContent);

  if (event.target.closest('[data-remove]')) {
    return update(productId, 0);
  }

  const step = event.target.closest('[data-step]');
  if (step) {
    const next = current + Number(step.dataset.step);
    return update(productId, Math.max(0, next));
  }
});

async function load() {
  view.innerHTML = '<div class="skeleton" style="height:280px"></div>';

  await Session.load();

  if (!Session.user) {
    view.innerHTML = `<div class="empty">
        <div class="icon">🔐</div>
        <h2>Sign in to see your basket</h2>
        <p class="muted">Your basket is saved to your account, so it follows you between devices.</p>
        <p style="margin-top:20px"><a class="btn" href="/login?next=%2Fcart">Sign in</a></p>
      </div>`;
    return;
  }

  try {
    render(await API.get('/api/cart'));
  } catch (error) {
    view.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
  }
}

load();
