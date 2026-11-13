const { test } = require('node:test');
const assert = require('node:assert/strict');
const { previewHandler } = require('../src/preview.cjs');
const tracks = () => [{ match: { candidates: [{ id: 123 }] } }];

test('prévia usa a sessão, encaminha Range e retorna áudio sem cookies', async () => {
  let received;
  const handler = previewHandler(async (url, options) => {
    received = { url, options };
    return new Response('audio', { status: 206, headers: {
      'content-type': 'audio/mpeg', 'content-range': 'bytes 0-4/20', 'set-cookie': 'secret=hidden'
    } });
  }, tracks);
  const response = await handler(new Request('delivery-preview://track/123', { headers: { Range: 'bytes=0-4' } }));
  assert.equal(received.url, 'https://srv.djdelivery.com/prelisten/track/123.mp3');
  assert.equal(received.options.credentials, 'include');
  assert.equal(received.options.headers.Range, 'bytes=0-4');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-4/20');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(await response.text(), 'audio');
});

test('IDs desconhecidos e rotas arbitrárias não iniciam requisições', async () => {
  const handler = previewHandler(() => { throw Error('Não deveria acessar rede'); }, tracks);
  assert.equal((await handler(new Request('delivery-preview://track/999'))).status, 404);
  assert.equal((await handler(new Request('delivery-preview://other/123'))).status, 400);
  assert.equal((await handler(new Request('delivery-preview://track/123?url=https://example.com'))).status, 400);
});

test('login em HTML e falhas de rede são tratados como prévia indisponível', async () => {
  const html = previewHandler(async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }), tracks);
  assert.equal((await html(new Request('delivery-preview://track/123'))).status, 502);
  const offline = previewHandler(async () => { throw Error('offline'); }, tracks);
  assert.equal((await offline(new Request('delivery-preview://track/123'))).status, 502);
});
