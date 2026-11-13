const path = require('node:path');

function safeName(name) {
  const clean = String(name).replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180);
  return !clean || /^\.+$/.test(clean) ? 'download' : clean;
}

function availablePath(folder, filename, exists, reserved = new Set()) {
  const name = safeName(filename);
  const { name: stem, ext } = path.parse(name);
  let candidate = path.join(folder, name);
  let index = 1;
  while (exists(candidate) || reserved.has(candidate)) {
    candidate = path.join(folder, `${stem} (${index++})${ext}`);
  }
  return candidate;
}

module.exports = { safeName, availablePath };
