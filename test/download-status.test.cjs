const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { availableFile, findDownloaded, selectedDownload } = require('../src/download-status.cjs');

test('download concluído só é reconhecido enquanto o arquivo completo existe', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-status-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'musica.mp3'); fs.writeFileSync(filename, 'audio');
  const record = { id: 'saved', catalogId: 1, path: filename, status: 'completed', received: 5 };
  const candidate = { id: 1, format: 'mp3' };
  assert.equal(findDownloaded([record], candidate)?.id, 'saved');
  fs.writeFileSync(filename, 'au');
  assert.equal(findDownloaded([record], candidate), undefined);
  fs.unlinkSync(filename);
  assert.equal(availableFile(record), false);
});

test('outra versão ou formato não contam como a versão escolhida', () => {
  const stat = () => ({ size: 5, isFile: () => true });
  const downloads = [{ id: 'saved', catalogId: 1, path: '/music/a.mp3', status: 'completed', received: 5 }];
  assert.equal(findDownloaded(downloads, { id: 2, format: 'mp3' }, stat), undefined);
  assert.equal(findDownloaded(downloads, { id: 1, format: 'flac' }, stat), undefined);
  const track = { match: { selectedId: 2, candidates: [{ id: 1, format: 'mp3' }, { id: 2, format: 'mp3' }] } };
  assert.equal(selectedDownload(downloads, track, stat), undefined);
  track.match.selectedId = 1;
  assert.equal(selectedDownload(downloads, track, stat)?.id, 'saved');
});

test('histórico antigo sem ID usa nome e tamanho; cancelados e diretórios não contam', () => {
  const record = { id: 'legacy', name: 'a.mp3', path: '/music/a.mp3', status: 'completed', received: 5 };
  const candidate = { id: 1, filename: 'a.mp3', filesize: 5, format: 'mp3' };
  const stat = () => ({ size: 5, isFile: () => true });
  assert.equal(findDownloaded([record], candidate, stat)?.id, 'legacy');
  assert.equal(findDownloaded([{ ...record, status: 'cancelled' }], candidate, stat), undefined);
  assert.equal(availableFile(record, () => ({ size: 5, isFile: () => false })), false);
});
