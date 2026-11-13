const { test } = require('node:test');
const assert = require('node:assert/strict');
const { candidateFrom, classify, searchTrack } = require('../src/catalog.cjs');
const wanted = { title: 'Morena', artist: 'Joutro Mundo' };
const candidate = (id = 1, subtitle = null, artist = wanted.artist) => candidateFrom({ id, title: wanted.title, artist, subtitle, format: 'mp3' });

test('uma exata única é automática; remix e outros artistas exigem revisão', () => {
  assert.equal(classify(wanted, [candidate()]).status, 'matched');
  assert.equal(classify(wanted, [candidate(1, 'Original Mix')]).status, 'matched');
  assert.equal(classify(wanted, [candidate(1, 'Club Remix')]).status, 'review');
  assert.equal(classify(wanted, [candidate(1, null, 'Outro')]).status, 'review');
  assert.equal(classify(wanted, []).status, 'not_found');
  assert.equal(classify({ title: 'Sosse', artist: 'Fede Klotz' }, [{ id: 3, title: 'Sossego', artist: 'Tim Maia' }]).status, 'not_found');
});

test('cópias da mesma versão são agrupadas e busca parcial impede automático', () => {
  assert.equal(classify(wanted, [candidate(), candidate()]).status, 'matched');
  assert.equal(classify(wanted, [candidate(1), candidate(2)]).status, 'matched');
  assert.equal(classify(wanted, [candidate(1), candidate(2)]).candidates[0].copies, 2);
  assert.equal(classify(wanted, [candidate(1, 'Radio Edit'), candidate(2, 'Club Remix')]).candidates.length, 2);
  assert.equal(classify(wanted, [candidate()], true).status, 'incomplete');
});

test('pontuação e acentos são normalizados, nomes e versões são preservados', () => {
  const track = { title: 'Emoriô', artist: 'Poolside & Fatnotronic' };
  assert.equal(classify(track, [{ id: 1, title: 'Emorio', artist: 'Fatnotronic, Poolside' }]).status, 'matched');
  assert.equal(classify({ ...wanted, title: 'Morena (Remix)' }, [candidate()]).status, 'review');
});

test('links são montados com ID numérico e formato permitido', () => {
  assert.equal(candidateFrom({ id: '../x', title: 'x', artist: 'y', format: 'mp3' }), null);
  assert.equal(candidateFrom({ id: 1, title: 'x', artist: 'y', format: 'html' }), null);
  const mp3 = candidateFrom({ id: 1, title: 'x', artist: 'y', format: 'flac', mp3version: true });
  assert.equal(mp3.url, 'https://srv.djdelivery.com/a/ms/track/1/download/mp3');
});

test('busca lê álbuns e pagina sem confundir outras faixas com correspondências', async () => {
  const seen = [];
  const fetch = async url => {
    seen.push(new URL(url));
    return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ total_items: 1, albums: [{ tracks: [
      { id: 1, title: 'Outra faixa', artist: 'Joutro Mundo', format: 'mp3' },
      { id: 2, title: 'Morena', artist: 'Joutro Mundo', format: 'mp3' }
    ] }] }) };
  };
  const result = await searchTrack(fetch, wanted);
  assert.equal(result.status, 'matched'); assert.equal(result.selectedId, 2);
  assert.equal(result.candidates.length, 1);
  assert.equal(seen[0].searchParams.get('text'), 'Joutro Mundo Morena');
});

test('login inválido e cancelamento falham sem classificar como não encontrado', async () => {
  await assert.rejects(searchTrack(async () => ({ ok: false, status: 401 }), wanted), /401/);
  await assert.rejects(searchTrack(async () => { throw Error('não deveria buscar'); }, wanted, () => true), /cancelada/);
});
