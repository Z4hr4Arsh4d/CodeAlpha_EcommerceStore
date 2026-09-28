/* Checkout: delivery details, order summary, order placement. */

const view = document.getElementById('view');

function renderForm(cart) {
  view.innerHTML = `
    <div class="two-col">
      <form class="card pad" id="form">
        <h3>Delivery details</h3>
        <div id="alert" style="margin:14px 0"></div>

        <div class="field">
          <label for="fullName">Full name</label>
          <input id="fullName" name="fullName" required autocomplete="name"
                 value="${escapeHtml(Session.user.name)}">
        </div>

        <div class="field">
          <label for="address">Address</label>
          <input id="address" name="address" required autocomplete="street-address"
                 placeholder="221B Baker Street">
        </div>

        <div class="field-row" style="margin-top:14px">
          <div class="field" style="margin:0">
            <label for="city">City</label>
            <input id="city" name="city" required autocomplete="address-level2" placeholder="London">
          </div>
          <div class="field" style="margin:0">
            <label for="postcode">Postcode</label>
            <input id="postcode" name="postcode" required autocomplete="postal-code" placeholder="NW1 6XE">
          </div>
        </div>

        <p class="small muted" style="margin-top:18px">
          This is a demonstration store. No payment is taken and no card details are collected.
        </p>

        <button class="btn lg block" type="submit" id="place" style="margin-top:10px">
          Place order · ${money(cart.totalPence)}
        </button>
      </form>

      <div class="card pad">
        <h3>Your order</h3>
        <div style="margin-top:12px">
          ${cart.items.map((item) => `
            <div class="spread small" style="padding:7px 0">
              <span>${escapeHtml(item.name)} <span class="muted">× ${item.quantity}</span></span>
              <span style="white-space:nowrap">${money(item.line_total_pence)}</span>
            </div>`).join('')}
        </div>
        <div class="totals" style="margin-top:14px; border-top:1px solid var(--border); padding-top:14px">
          <div class="line"><span>Subtotal</span><span>${money(cart.subtotalPence)}</span></div>
          <div class="line"><span>Delivery</span><span>${cart.deliveryPence === 0 ? 'Free' : money(cart.deliveryPence)}</span></div>
          <div class="line grand"><span>Total</span><span>${money(cart.totalPence)}</span></div>
        </div>
        <p class="center small" style="margin-top:14px"><a href="/cart">Edit basket</a></p>
      </div>
    </div>`;

  document.getElementById('form').addEventListener('submit', submit);
}

async function submit(event) {
  event.preventDefault();

  const button = document.getElementById('place');
  const alert = document.getElementById('alert');
  const form = event.target;

  alert.innerHTML = '';
  button.disabled = true;
  button.textContent = 'Placing your order…';

  try {
    const { order } = await API.post('/api/orders', {
      fullName: form.fullName.value,
      address: form.address.value,
      city: form.city.value,
      postcode: form.postcode.value,
    });

    Session.cartCount = 0;
    renderHeader();
    renderConfirmation(order);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    alert.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    button.disabled = false;
    button.textContent = 'Place order';

    // Stock changed while they were filling the form — the summary on screen
    // is now wrong, so send them back rather than letting them retry against
    // stale numbers.
    if (error.status === 409) {
      setTimeout(() => { location.href = '/cart'; }, 2600);
    }
  }
}

function renderConfirmation(order) {
  document.querySelector('.page-head h1').textContent = 'Order confirmed';

  view.innerHTML = `
    <div class="card pad" style="max-width:620px;margin:0 auto">
      <div class="center" style="padding:14px 0 22px">
        <div style="font-size:3.4rem">✅</div>
        <h2 style="margin-top:10px">Thank you, ${escapeHtml(order.full_name.split(' ')[0])}</h2>
        <p class="muted">Your order reference is <strong>${escapeHtml(order.reference)}</strong></p>
      </div>

      <div style="border-top:1px solid var(--border); padding-top:16px">
        ${order.items.map((item) => `
          <div class="spread small" style="padding:7px 0">
            <span>${escapeHtml(item.product_name)} <span class="muted">× ${item.quantity}</span></span>
            <span>${money(item.unit_pence * item.quantity)}</span>
          </div>`).join('')}
        <div class="line grand spread" style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;font-weight:700;font-size:1.1rem">
          <span>Total paid</span><span>${money(order.total_pence)}</span>
        </div>
      </div>

      <div style="border-top:1px solid var(--border); margin-top:18px; padding-top:16px">
        <div class="muted small">Delivering to</div>
        <div>${escapeHtml(order.full_name)}<br>
             ${escapeHtml(order.address)}<br>
             ${escapeHtml(order.city)}, ${escapeHtml(order.postcode)}</div>
      </div>

      <div class="row" style="margin-top:24px">
        <a class="btn grow" href="/orders">View your orders</a>
        <a class="btn ghost grow" href="/">Keep shopping</a>
      </div>
    </div>`;
}

async function load() {
  view.innerHTML = '<div class="skeleton" style="height:340px"></div>';

  await Session.load();

  if (!Session.user) {
    return requireSignIn('Sign in to check out.');
  }

  try {
    const cart = await API.get('/api/cart');

    if (cart.items.length === 0) {
      view.innerHTML = `<div class="empty">
          <div class="icon">🧺</div>
          <h2>Your basket is empty</h2>
          <p style="margin-top:20px"><a class="btn" href="/">Browse the shop</a></p>
        </div>`;
      return;
    }

    renderForm(cart);
  } catch (error) {
    view.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
  }
}

load();
