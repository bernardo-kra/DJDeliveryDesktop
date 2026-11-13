const fs = require('node:fs');
const path = require('node:path');

function availableFile(record, stat = fs.statSync) {
  if (record.status !== 'completed' || !(record.received > 0)) return false;
  try {
    const file = stat(record.path);
    return file.isFile() && file.size === record.received;
  } catch { return false; }
}

function findDownloaded(downloads, candidate, stat = fs.statSync) {
  if (!candidate) return undefined;
  return downloads.find(record => {
    const format = path.extname(record.path || '').slice(1).toLowerCase();
    const matches = record.catalogId === candidate.id || (candidate.filename && record.name === candidate.filename
      && candidate.filesize > 0 && record.received === candidate.filesize);
    return matches && format === candidate.format && availableFile(record, stat);
  });
}

function selectedDownload(downloads, track, stat = fs.statSync) {
  const candidate = track.match?.candidates?.find(item => item.id === track.match.selectedId);
  return findDownloaded(downloads, candidate, stat);
}

module.exports = { availableFile, findDownloaded, selectedDownload };
