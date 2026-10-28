// Protezione con password per Cloudflare Pages.
// Imposta la variabile SITE_PASSWORD nelle impostazioni del progetto Cloudflare.
// Senza SITE_PASSWORD il sito resta aperto a tutti.

const COOKIE = 'bl_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 giorni

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function loginPage(message, status = 401) {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex"><title>Bottino Lab · Accesso</title>
<style>
:root{--bg:#EEF2EF;--surface:#fff;--fg:#13201A;--muted:#5A6B62;--line:#CCD6D0;--accent:#0E6E52;--no:#B03A44}
@media (prefers-color-scheme:dark){:root{--bg:#0F1613;--surface:#17211C;--fg:#E6EEE9;--muted:#93A69C;--line:#2A3832;--accent:#4FC69C;--no:#F0848C;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
form{width:100%;max-width:360px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:24px;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font:800 32px/1 "Arial Narrow",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.5px}
h1 span{color:var(--accent)}
p{margin:0;color:var(--muted);font-size:14px}
label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);display:flex;flex-direction:column;gap:4px}
input{font:inherit;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
button{font:inherit;font-weight:700;padding:10px;border-radius:8px;border:0;background:var(--accent);color:var(--surface);cursor:pointer}
.err{color:var(--no);font-size:14px}
</style></head><body>
<form method="post" action="/login">
  <h1>Bottino <span>Lab</span></h1>
  <p>Area riservata. Inserisci la password per entrare.</p>
  ${message ? `<div class="err" role="alert">${message}</div>` : ''}
  <label>Password<input type="password" name="password" autocomplete="current-password" required autofocus></label>
  <button type="submit">Entra</button>
</form></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  });
}

export async function onRequest({ request, env, next }) {
  const password = env.SITE_PASSWORD;
  if (!password) return next();

  const url = new URL(request.url);
  const token = await sha256(password + '|bottino-lab');

  if (url.pathname === '/logout') {
    return new Response(null, {
      status: 303,
      headers: [
        ['Location', '/'],
        ['Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`],
        ['Set-Cookie', 'bl_session=; Path=/; Max-Age=0; Secure; SameSite=Lax']
      ]
    });
  }

  if (url.pathname === '/login' && request.method === 'POST') {
    const form = await request.formData();
    const given = String(form.get('password') || '');
    if (safeEqual(await sha256(given + '|bottino-lab'), token)) {
      return new Response(null, {
        status: 303,
        headers: [
          ['Location', '/'],
          ['Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`],
          ['Set-Cookie', `bl_session=1; Path=/; Max-Age=${MAX_AGE}; Secure; SameSite=Lax`]
        ]
      });
    }
    return loginPage('Password errata. Riprova.', 401);
  }

  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  if (match && safeEqual(match[1], token)) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set('X-Robots-Tag', 'noindex');
    return out;
  }
  return loginPage('');
}
