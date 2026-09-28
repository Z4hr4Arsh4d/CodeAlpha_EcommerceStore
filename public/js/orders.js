/* Order history. */

const view = document.getElementById('view');

function orderCard(order) {
  const date = new Date(order.created_at + 'Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return `
    <article class="order" style="margin-bottom:18px">
      <div class="head">
        <div>
          <strong>${escapeHtml(order.reference)}</strong>
          <span class="pill" style="margin-left:8px">${escapeHtml(order.status)}</span>
          <div class="muted small">${date} · ${units} item${units === 1 ? '' : 's'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:1.1rem">${money(order.total_pence)}</div>
          <div class="muted small">${escapeHtml(order.city)}, ${escapeHtml(order.postcode)}</div>
        </div>
      </div>

      <div class="items">
        ${order.items.map((item) => `
          <div class="item">
            <span>${escapeHtml(item.product_name)} <span class="muted">× ${item.quantity}</span></span>
            <span>${money(item.unit_pence * item.quantity)}</span>
          </div>`).join('')}
      </div>
    </article>`;
}

async function load() {
  view.innerHTML = '<div class="skeleton" style="height:220px"></div>';

  await Session.load();

  if (!Session.user) {
    view.innerHTML = `<div class="empty">
        <div class="icon">🔐</div>
        <h2>Sign in to see your orders</h2>
        <p style="margin-top:20px"><a class="btn" href="/login?next=%2Forders">Sign in</a></p>
      </div>`;
    return;
  }

  try {
    const { orders } = await API.get('/api/orders');

    if (orders.length === 0) {
      view.innerHTML = `<div class="empty">
          <div class="icon">📦</div>
          <h2>No orders yet</h2>
          <p class="muted">Anything you buy will appear here.</p>
          <p style="margin-top:20px"><a class="btn" href="/">Browse the shop</a></p>
        </div>`;
      return;
    }

    const spent = orders.reduce((sum, order) => sum + order.total_pence, 0);

    view.innerHTML = `
      <p class="muted small" style="margin-bottom:18px">
        ${orders.length} order${orders.length === 1 ? '' : 's'} · ${money(spent)} total
      </p>
      ${orders.map(orderCard).join('')}`;
  } catch (error) {
    view.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
  }
}

load();
