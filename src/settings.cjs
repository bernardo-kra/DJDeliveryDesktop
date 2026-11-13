const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function defaultSettings(downloadsFolder) {
  return { version: 1, setupComplete: false, folder: path.join(downloadsFolder, 'DJ Delivery'), shazamDatabase: null, arrangeWindows: true };
}

function normalizeSettings(value, defaults) {
  const validFolder = typeof value?.folder === 'string' && path.isAbsolute(value.folder);
  return {
    ...defaults, version: 1,
    folder: validFolder ? value.folder : defaults.folder,
    setupComplete: validFolder && value.setupComplete === true,
    shazamDatabase: typeof value?.shazamDatabase === 'string' && path.isAbsolute(value.shazamDatabase) ? value.shazamDatabase : null,
    arrangeWindows: typeof value?.arrangeWindows === 'boolean' ? value.arrangeWindows : true
  };
}

function loadSettings(file, downloadsFolder, legacyFolder) {
  const defaults = defaultSettings(downloadsFolder);
  if (fs.existsSync(file)) return normalizeSettings(JSON.parse(fs.readFileSync(file, 'utf8')), defaults);
  if (typeof legacyFolder === 'string' && path.isAbsolute(legacyFolder)) return { ...defaults, folder: legacyFolder, setupComplete: true };
  return defaults;
}

function writeSettings(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function validateDownloadFolder(folder, create = false) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Escolha uma pasta de downloads válida.');
  try {
    if (create && !fs.existsSync(folder)) {
      // Only create the leaf chosen by the user, never recreate an absent external volume.
      if (!fs.statSync(path.dirname(folder)).isDirectory()) throw new Error();
      fs.mkdirSync(folder);
    }
    if (!fs.statSync(folder).isDirectory()) throw new Error();
    const probe = path.join(folder, `.delivery-write-${randomUUID()}`);
    const descriptor = fs.openSync(probe, 'wx', 0o600);
    try { fs.closeSync(descriptor); } finally { fs.unlinkSync(probe); }
  } catch { throw new Error('A pasta está indisponível ou sem permissão de escrita. Conecte o disco ou escolha outra pasta em Configurações.'); }
}

module.exports = { defaultSettings, normalizeSettings, loadSettings, writeSettings, validateDownloadFolder };
