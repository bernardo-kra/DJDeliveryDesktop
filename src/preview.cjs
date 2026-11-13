const { ORIGIN } = require('./catalog.cjs');

function previewHandler(fetch, getTracks) {
  return async request => {
    const url = new URL(request.url);
    const id = /^\/(\d+)$/.exec(url.pathname)?.[1];
    if (url.hostname !== 'track' || !id || url.search || !['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 400 });
    }
    const allowed = getTracks().some(track => track.match?.candidates?.some(candidate => String(candidate.id) === id));
    if (!allowed) return new Response(null, { status: 404 });
    const headers = {};
    const range = request.headers.get('range');
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
    try {
      const upstream = await fetch(`${ORIGIN}/prelisten/track/${id}.mp3`, {
        method: request.method, credentials: 'include', headers, signal: AbortSignal.timeout(30000)
      });
      if (![200, 206].includes(upstream.status) || !/^(audio\/|application\/octet-stream)/i.test(upstream.headers.get('content-type') || '')) {
        await upstream.body?.cancel();
        return new Response(null, { status: 502 });
      }
      const responseHeaders = { 'cache-control': 'no-store' };
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders[name] = value;
      }
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch { return new Response(null, { status: 502 }); }
  };
}

module.exports = { previewHandler };
