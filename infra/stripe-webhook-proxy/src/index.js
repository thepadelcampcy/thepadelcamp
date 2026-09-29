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
  async fetch(request, env) {
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
        return new Response('Forbidden', { status: 403 });
      }
    } else {
      const ok = await verifyStripeSignature(body, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SIGNING_SECRET);
      if (!ok) return new Response('Invalid signature', { status: 403 });
    }

    let upstream;
    try {
      upstream = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (err) {
      return new Response('Upstream fetch failed: ' + err.message, { status: 502 });
    }

    const text = await upstream.text();
    console.log('upstream', upstream.status, text.slice(0, 200));

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
