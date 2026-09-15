export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await request.text();

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
