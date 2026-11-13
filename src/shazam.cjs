const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const execute = promisify(execFile);
const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

function mergeTracks(existing, rows, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const tracks = new Map(existing.filter(track => !excluded.has(track.id)).map(track => [track.id, { ...track }]));
  for (const row of rows) {
    const title = String(row.title || '').trim();
    const artist = String(row.artist || '').trim();
    if (!title) continue;
    const id = createHash('sha256').update(JSON.stringify([normalize(title), normalize(artist)])).digest('hex');
    if (excluded.has(id)) continue;
    const timestamp = row.date == null ? NaN : (Number(row.date) + 978307200) * 1000;
    const date = new Date(timestamp);
    const identifiedAt = Number.isFinite(date.getTime()) ? date.toISOString() : null;
    const previous = tracks.get(id);
    tracks.set(id, { ...previous, id, title, artist, selected: previous?.selected ?? true,
      identifiedAt: !previous?.identifiedAt || identifiedAt > previous.identifiedAt ? identifiedAt : previous.identifiedAt });
  }
  return [...tracks.values()].sort((a, b) => (b.identifiedAt || '').localeCompare(a.identifiedAt || ''));
}

async function importShazam(home, existing = [], excludedIds = [], databasePath = null) {
  if (process.platform !== 'darwin') throw new Error('A leitura direta do Shazam está disponível no macOS.');
  let databases;
  if (databasePath) {
    if (typeof databasePath !== 'string' || !path.isAbsolute(databasePath) || !fs.existsSync(databasePath)) throw new Error('O banco do Shazam configurado não está disponível. Escolha outro arquivo ou use a detecção automática em Configurações.');
    databases = [databasePath];
  } else {
    const groups = path.join(home, 'Library', 'Group Containers');
    let directories;
    try { directories = await fs.promises.readdir(groups); }
    catch { throw new Error('Não foi possível acessar a biblioteca do Shazam neste Mac.'); }
    databases = directories.filter(name => name.endsWith('.group.com.shazam'))
      .map(name => path.join(groups, name, 'com.shazam.mac.Shazam', 'ShazamDataModel.sqlite')).filter(file => fs.existsSync(file));
  }
  if (!databases.length) throw new Error('Histórico do Shazam não encontrado neste Mac. Abra o Shazam ou escolha o banco manualmente em Configurações.');
  const rows = [];
  for (const file of databases) {
    try {
      const { stdout } = await execute('/usr/bin/sqlite3', ['-readonly', '-json', file,
        'SELECT ZTRACKNAME AS title, ZSUBTITLE AS artist, ZDATE AS date FROM ZSHTAGRESULTMO ORDER BY ZDATE DESC'],
      { timeout: 15000, maxBuffer: 20 * 1024 * 1024 });
      rows.push(...JSON.parse(stdout || '[]'));
    } catch {
      throw new Error('Não foi possível ler o histórico. Feche o Shazam e tente novamente. O formato ou as permissões do macOS podem ter mudado.');
    }
  }
  const tracks = mergeTracks(existing, rows, excludedIds);
  return { tracks, records: rows.length, added: tracks.length - existing.length };
}
module.exports = { mergeTracks, importShazam };
