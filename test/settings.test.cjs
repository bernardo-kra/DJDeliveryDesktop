const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { defaultSettings, loadSettings, normalizeSettings, writeSettings, validateDownloadFolder } = require('../src/settings.cjs');

function workspace(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-settings-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

test('instalações novas usam o Downloads do usuário e exigem configuração inicial', t => {
  const folder = workspace(t);
  const first = loadSettings(path.join(folder, 'a.json'), path.join(folder, 'usuario-a/Downloads'));
  const second = loadSettings(path.join(folder, 'b.json'), path.join(folder, 'usuario-b/Downloads'));
  assert.notEqual(first.folder, second.folder);
  assert.equal(first.folder, path.join(folder, 'usuario-a/Downloads/DJ Delivery'));
  assert.equal(first.setupComplete, false);
  assert.equal(first.shazamDatabase, null);
});

test('migra a pasta antiga e preserva preferências após reabrir', t => {
  const folder = workspace(t), file = path.join(folder, 'settings.json');
  const legacy = path.join(folder, 'Disco externo/Músicas');
  const settings = loadSettings(file, path.join(folder, 'Downloads'), legacy);
  assert.equal(settings.folder, legacy); assert.equal(settings.setupComplete, true);
  const selected = { ...settings, arrangeWindows: false, shazamDatabase: path.join(folder, 'Shazam.sqlite') };
  writeSettings(file, selected);
  assert.deepEqual(loadSettings(file, '/outro/Downloads', '/pasta/antiga'), selected);
  assert.equal(fs.readdirSync(folder).filter(name => name.endsWith('.tmp')).length, 0);
});

test('validação rejeita caminhos relativos e não propaga campos de conta', () => {
  const defaults = defaultSettings('/user/Downloads');
  const result = normalizeSettings({ folder: '../shared', setupComplete: true, token: 'não salvar', password: 'não salvar' }, defaults);
  assert.equal(result.setupComplete, false);
  assert.equal(result.folder, '/user/Downloads/DJ Delivery');
  assert.equal(Object.hasOwn(result, 'token'), false);
  assert.equal(Object.hasOwn(result, 'password'), false);
});

test('pasta configurada é gravável e não recria diretórios de discos ausentes', t => {
  const folder = workspace(t), destination = path.join(folder, 'Músicas');
  validateDownloadFolder(destination, true);
  assert.ok(fs.statSync(destination).isDirectory());
  assert.deepEqual(fs.readdirSync(destination), []);
  assert.throws(() => validateDownloadFolder(path.join(folder, 'disco-ausente/Músicas'), true), /indisponível/);
  assert.equal(fs.existsSync(path.join(folder, 'disco-ausente')), false);
  fs.rmdirSync(destination);
  assert.throws(() => validateDownloadFolder(destination), /indisponível/);
  assert.equal(fs.existsSync(destination), false);
});

test('configuração corrompida não é sobrescrita durante a leitura', t => {
  const file = path.join(workspace(t), 'settings.json'); fs.writeFileSync(file, '{invalid');
  assert.throws(() => loadSettings(file, '/user/Downloads'));
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
});
