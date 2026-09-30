async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  // Single pass: collect `t` and every `v1` value (the header can carry more
  // than one v1= during Stripe key rotation) instead of re-splitting the
  // header a second time later, which would be redundant and, on unusual
  // spacing, out of sync with this pass.
  let ts = null;
  const v1s = [];
  for (const p of sigHeader.split(',')) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (k === 't') ts = Number(v);
    else if (k === 'v1') v1s.push(v);
  }
  if (!Number.isFinite(ts) || v1s.length === 0) return false;
  // Replay protection: Stripe's own libraries allow a 5-minute window on `t`.
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${rawBody}`));
  const expectedHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

  return v1s.some(v => v === expectedHex);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await request.text();

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      payload = null;
    }

    const isViewContent = payload && payload.type === 'view_content';

    if (isViewContent) {
      if (!env.VIEWCONTENT_RELAY_TOKEN || payload.token !== env.VIEWCONTENT_RELAY_TOKEN) {
        console.log('reject: bad relay token');
        return new Response('Forbidden', { status: 403 });
      }
    } else {
      const ok = await verifyStripeSignature(body, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SIGNING_SECRET);
      if (!ok) {
        console.log('reject: invalid signature', request.headers.get('Stripe-Signature') ? 'header present' : 'no header');
        return new Response('Invalid signature', { status: 403 });
      }
    }

    // Which request this is, for the logs: 'view_content' or the Stripe event type + session id.
    const kind = isViewContent
      ? 'view_content'
      : `${payload && payload.type} ${payload && payload.data && payload.data.object && payload.data.object.id}`;

    // Apps Script runs doPost during this POST and only then answers 302 to a
    // one-time echo URL holding the script's reply (verified 2026-09-30: doPost
    // ran in 100/100 probe requests, and a 10 s sleep in doPost delayed the 302
    // by ~11 s). Reading that echo is what fails — slow, 404, or an HTML page
    // from a stray doGet — so a 302 to the echo URL is taken as success and the
    // echo is only read in the background for the log. The script's own
    // failures are reported by the script itself (alerts + daily reconciliation).
    // The Stripe signature is checked once above; the hop to Google is our own
    // request and must not be re-verified.
    const started = Date.now();
    const controller = new AbortController();
    // Our own deadline, below Stripe's (~22 s observed): a 502 gets a prompt Stripe
    // retry, which the script's dedup makes harmless.
    const timer = setTimeout(() => controller.abort(), 20000);
    let upstream;
    try {
      upstream = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err.name === 'AbortError' ? 'timeout' : err.message;
      console.log('upstream fetch failed', kind, `${Date.now() - started}ms`, reason);
      return new Response('Upstream fetch failed: ' + reason, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
    const postMs = Date.now() - started;

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location') || '';
      let target = null;
      try { target = new URL(location); } catch { /* malformed Location */ }
      // Logged without the query string: it carries a one-time key.
      const where = target ? target.host + target.pathname : '(bad location)';
      if (target && target.host === 'script.googleusercontent.com' && target.pathname === '/macros/echo') {
        console.log('upstream', kind, upstream.status, `${postMs}ms`, '-> echo, accepted');
        ctx.waitUntil(
          fetch(location)
            .then(r => r.text().then(t => console.log('echo', kind, r.status, `${Date.now() - started}ms`, t.slice(0, 200))))
            .catch(err => console.log('echo failed', kind, err.message))
        );
        return new Response('Accepted', { status: 200 });
      }
      console.log('upstream', kind, upstream.status, `${postMs}ms`, 'unexpected redirect', where);
      return new Response('Unexpected redirect', { status: 502 });
    }

    const text = await upstream.text();
    console.log('upstream', kind, upstream.status, `${postMs}ms`, upstream.headers.get('content-type'), text.slice(0, 200));

    if (text === 'OK' || text === 'Ignored' || text === 'Not paid') {
      return new Response(text, { status: 200 });
    }
    if (text === 'Forbidden') {
      return new Response(text, { status: 403 });
    }
    if (text.startsWith('Error:')) {
      return new Response(text, { status: 502 });
    }

    return new Response(text, { status: 502 });
  },
};
