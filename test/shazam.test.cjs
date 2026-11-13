const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeTracks } = require('../src/shazam.cjs');

test('agrupa repetições e preserva versões e artistas diferentes', () => {
  const tracks = mergeTracks([], [
    { title: ' Música ', artist: 'ARTISTA', date: 100 },
    { title: 'Música', artist: 'artista', date: 200 },
    { title: 'Música (Remix)', artist: 'Artista', date: 300 },
    { title: 'Música', artist: 'Outro artista', date: 400 },
    { title: '', artist: 'Sem música' }
  ]);
  assert.equal(tracks.length, 3);
  assert.equal(tracks[2].identifiedAt, new Date((978307200 + 200) * 1000).toISOString());
});

test('reimportar mantém seleção e não duplica histórico', () => {
  const rows = [{ title: 'Faixa', artist: 'Artista', date: 100 }];
  const initial = mergeTracks([], rows);
  initial[0].selected = false;
  initial[0].match = { status: 'confirmed', selectedId: 123 };
  const updated = mergeTracks(initial, [...rows, { ...rows[0], date: 200 }]);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].selected, false);
  assert.deepEqual(updated[0].match, { status: 'confirmed', selectedId: 123 });
  assert.equal(initial[0].identifiedAt, new Date((978307200 + 100) * 1000).toISOString());
  assert.equal(updated[0].identifiedAt, new Date((978307200 + 200) * 1000).toISOString());
});

test('datas ausentes não impedem importar e limites entre título e artista não colidem', () => {
  const tracks = mergeTracks([], [{ title: 'A B', artist: 'C' }, { title: 'A', artist: 'B C' }]);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].identifiedAt, null);
});

test('excluídas não retornam em importações futuras, inclusive com reconhecimento novo', () => {
  const rows = [{ title: 'Faixa', artist: 'Artista', date: 100 }, { title: 'Outra', artist: 'Artista', date: 200 }];
  const initial = mergeTracks([], rows);
  const removed = initial.find(track => track.title === 'Faixa');
  const kept = initial.filter(track => track.id !== removed.id);
  const exclusions = JSON.parse(JSON.stringify([removed.id]));
  const result = mergeTracks(kept, [...rows, { title: ' FAIXA ', artist: 'ARTISTA', date: 300 }], exclusions);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Outra');
  assert.equal(mergeTracks(initial, rows, exclusions).length, 1);
  assert.equal(mergeTracks(result, rows, []).length, 2);
});
