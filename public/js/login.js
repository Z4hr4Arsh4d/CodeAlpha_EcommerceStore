/* Sign in / create account, on one page with two tabs. */

const form = document.getElementById('form');
const alertBox = document.getElementById('alert');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

let mode = 'login';

/** Where to send them afterwards. */
function nextUrl() {
  const next = new URLSearchParams(location.search).get('next');
  // Only ever accept a same-site path. An attacker who can set ?next= to an
  // absolute URL turns this into an open redirect — a phishing primitive
  // that borrows your domain's credibility.
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/';
}

function renderForm() {
  alertBox.innerHTML = '';

  form.innerHTML = mode === 'login'
    ? `
      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required autocomplete="email"
               value="demo@codealpha.tech">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required
               autocomplete="current-password" value="demo1234">
      </div>
      <button class="btn block lg" type="submit" style="margin-top:6px">Sign in</button>`
    : `
      <div class="field">
        <label for="name">Your name</label>
        <input id="name" name="name" required autocomplete="name" placeholder="Zahra Arshad">
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required autocomplete="email">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required
               autocomplete="new-password" minlength="8">
        <p class="small muted" style="margin:6px 0 0">At least 8 characters.</p>
      </div>
      <button class="btn block lg" type="submit" style="margin-top:6px">Create account</button>`;
}

function setMode(next) {
  mode = next;
  tabLogin.classList.toggle('on', mode === 'login');
  tabRegister.classList.toggle('on', mode === 'register');
  document.title = mode === 'login'
    ? 'Sign in — CodeAlpha Store'
    : 'Create account — CodeAlpha Store';
  renderForm();
}

tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const button = form.querySelector('button[type=submit]');
  const label = button.textContent;

  alertBox.innerHTML = '';
  button.disabled = true;
  button.textContent = mode === 'login' ? 'Signing in…' : 'Creating your account…';

  const payload = mode === 'login'
    ? { email: form.email.value, password: form.password.value }
    : {
        name: form.name.value,
        email: form.email.value,
        password: form.password.value,
      };

  try {
    await API.post(`/api/auth/${mode}`, payload);
    location.href = nextUrl();
  } catch (error) {
    alertBox.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    button.disabled = false;
    button.textContent = label;
  }
});

// Already signed in? No reason to show this page.
Session.load().then((user) => {
  if (user) location.href = nextUrl();
});

setMode('login');
