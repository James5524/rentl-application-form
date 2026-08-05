// Admin password gate for the FormForge dashboard. See server.js's `requireAdmin` for the
// server side of this -- if the server has no ADMIN_KEY set, every request here succeeds
// regardless of what key (if any) is sent, so this gate is harmless to leave in place even
// before ADMIN_KEY is configured.
//
// Loaded BEFORE builder.js (see index.html) so `window.authedFetch` exists by the time
// builder.js's own init code runs. Blocks the page behind a full-screen overlay until a
// working key is entered, so nothing in the dashboard is ever visible/usable first.
(function () {
  const STORAGE_KEY = 'formforge_admin_key';
  let key = localStorage.getItem(STORAGE_KEY) || '';

  const overlay = document.createElement('div');
  overlay.id = 'auth-gate';
  overlay.style.cssText = 'position:fixed;inset:0;background:#f4f5f8;display:flex;align-items:center;justify-content:center;z-index:9999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;';
  overlay.innerHTML = `
    <div style="background:#fff;border:1px solid #e2e5ec;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);padding:32px;width:320px;max-width:90vw;">
      <div style="font-weight:700;font-size:16px;margin-bottom:4px;color:#1f2430;">FormForge</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:18px;">Enter the admin password to continue.</div>
      <input id="auth-gate-input" type="password" placeholder="Password" autofocus
        style="width:100%;padding:9px 11px;border:1px solid #e2e5ec;border-radius:8px;font-size:14px;margin-bottom:10px;box-sizing:border-box;">
      <div id="auth-gate-error" style="color:#dc2626;font-size:13px;margin-bottom:10px;display:none;">Incorrect password.</div>
      <button id="auth-gate-submit" style="width:100%;padding:9px 11px;border:none;border-radius:8px;background:#3b4560;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Continue</button>
    </div>`;

  function showGate() {
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#auth-gate-input');
    const err = overlay.querySelector('#auth-gate-error');
    const submit = overlay.querySelector('#auth-gate-submit');
    input.focus();
    async function attempt() {
      const candidate = input.value;
      const res = await fetch('/api/forms', { headers: { 'x-admin-key': candidate } });
      if (res.ok) {
        localStorage.setItem(STORAGE_KEY, candidate);
        // Reload rather than just hiding the overlay: builder.js's own init (loadFormsList)
        // already ran once, before the key was known, and got a 401 -- it has no way to
        // retry on its own. A reload re-runs everything cleanly with the now-valid key
        // already in place, so checkStoredKey below passes instantly with no visible flash.
        window.location.reload();
      } else {
        err.style.display = 'block';
        input.select();
      }
    }
    submit.onclick = attempt;
    input.onkeydown = (e) => { if (e.key === 'Enter') attempt(); };
  }

  // authedFetch: same signature as fetch, always carries the current key. On a 401 (key
  // missing/wrong/revoked), clears the stored key and re-shows the gate rather than letting
  // callers silently fail against a locked API.
  window.authedFetch = async function authedFetch(url, opts = {}) {
    const headers = Object.assign({}, opts.headers || {}, { 'x-admin-key': key });
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (res.status === 401) {
      localStorage.removeItem(STORAGE_KEY);
      key = '';
      showGate();
    }
    return res;
  };

  // Verify whatever key (if any) is already stored actually still works before letting the
  // rest of the app run -- covers a revoked/rotated key, not just a missing one.
  (async function checkStoredKey() {
    const res = await fetch('/api/forms', { headers: { 'x-admin-key': key } });
    if (!res.ok) showGate();
  })();
})();
