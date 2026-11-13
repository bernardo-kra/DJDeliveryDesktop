const ORIGIN = 'https://srv.djdelivery.com';
const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const artistKey = value => String(value || '').split(/\s*(?:&|,|\band\b)\s*/i).map(normalize).filter(Boolean).sort().join('|');
const titleKey = value => normalize(String(value || '').replace(/\s*\(original mix\)\s*$/i, ''));

function candidateFrom(track, sectionId = null, sectionName = null) {
  if (!Number.isSafeInteger(track.id) || track.id <= 0 || !track.title || !track.artist) return null;
  const format = track.mp3version ? 'mp3' : track.format;
  if (!['mp3', 'flac', 'wav', 'aiff', 'aif', 'm4a'].includes(format)) return null;
  const subtitle = String(track.subtitle || '').trim();
  const title = `${track.title}${subtitle ? ` (${subtitle})` : ''}`;
  return { id: track.id, title, artist: String(track.artist), format,
    sectionId: sectionId == null ? null : String(sectionId), sectionName,
    sizeKnown: !track.mp3version && Number.isFinite(track.filesize) && track.filesize > 0,
    filename: typeof track.filename === 'string' ? track.filename : null, filesize: Number(track.filesize) || null,
    url: `${ORIGIN}/a/ms/track/${track.id}/download/${format}` };
}

function classify(wanted, candidates, truncated = false) {
  const groups = new Map();
  for (const candidate of new Map(candidates.map(candidate => [candidate.id, candidate])).values()) {
    const key = JSON.stringify([artistKey(candidate.artist), titleKey(candidate.title), candidate.format, candidate.sectionId || null]);
    const group = groups.get(key);
    if (group) group.copies++;
    else groups.set(key, { ...candidate, copies: 1 });
  }
  const unique = [...groups.values()];
  const exact = unique.filter(candidate => titleKey(candidate.title) === titleKey(wanted.title)
    && artistKey(candidate.artist) === artistKey(wanted.artist));
  const relevant = unique.filter(candidate => {
    const a = titleKey(candidate.title), b = titleKey(wanted.title);
    return Boolean(a && b) && (a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `));
  }).sort((a, b) => Number(exact.includes(b)) - Number(exact.includes(a)));
  return {
    status: truncated ? 'incomplete' : exact.length === 1 ? 'matched' : relevant.length ? 'review' : 'not_found',
    selectedId: !truncated && exact.length === 1 ? exact[0].id : null,
    candidates: relevant, truncated, checkedAt: new Date().toISOString()
  };
}

async function searchTrack(fetch, wanted, stopped = () => false) {
  const candidates = [];
  let truncated = false;
  const queries = [...new Set([`${wanted.artist} ${wanted.title}`.trim(), wanted.title])];
  for (const query of queries) {
    let seenAlbums = 0;
    for (let page = 0; page < 5; page++) {
      if (stopped()) throw new Error('Operação cancelada.');
      const url = new URL('/a/ms/media/search', ORIGIN);
      url.search = new URLSearchParams({ text: query, page: String(page), mp3prefered: 'true' }).toString();
      const response = await fetch(url.href, { credentials: 'include', signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`Busca recusada pelo site (${response.status}). Verifique login e acesso.`);
      if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('Abra o DJ Delivery e entre na sua conta antes de buscar.');
      const data = await response.json();
      if (!Object.hasOwn(data, 'albums')) throw new Error('Resposta de busca inesperada. Verifique o login no DJ Delivery.');
      if (data.albums != null && !Array.isArray(data.albums)) throw new Error('O formato do catálogo mudou.');
      const albums = data.albums || [];
      for (const album of albums) for (const item of album.tracks || []) {
        const candidate = candidateFrom(item, album.section_id, album.section_nm || null);
        if (candidate) candidates.push(candidate);
      }
      seenAlbums += albums.length;
      if (!albums.length || (Number.isFinite(data.total_items) && seenAlbums >= data.total_items)) break;
      if (page === 4) truncated = true;
      else await new Promise(resolve => setTimeout(resolve, 400));
    }
    const result = classify(wanted, candidates, truncated);
    if (result.status === 'matched' || result.candidates.length) return result;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return classify(wanted, candidates, truncated);
}

module.exports = { searchTrack, classify, candidateFrom, ORIGIN };
