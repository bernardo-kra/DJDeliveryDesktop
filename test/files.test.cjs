const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { safeName, availablePath } = require('../src/files.cjs');

test('nomes vindos do site não podem sair da pasta escolhida', () => {
  const folder = path.resolve('/tmp/music');
  for (const name of ['../../segredo.mp3', '..\\segredo.mp3', '/', '..', 'track\x00.mp3']) {
    const result = availablePath(folder, name, () => false);
    assert.equal(path.dirname(result), folder);
  }
  assert.equal(safeName('..'), 'download');
});

test('preserva arquivos existentes e downloads simultâneos de mesmo nome', () => {
  const folder = path.resolve('/tmp/music');
  const existing = path.join(folder, 'Set.mp3');
  const pending = new Set([path.join(folder, 'Set (1).mp3')]);
  assert.equal(availablePath(folder, 'Set.mp3', candidate => candidate === existing, pending), path.join(folder, 'Set (2).mp3'));
});
