const api = window.delivery;
const list = document.querySelector('#downloads');
let current = { downloads: [], folder: '' };
let activePanel = 'tracks';
const statuses = { progressing: 'Baixando', completed: 'Concluído', cancelled: 'Cancelado', interrupted: 'Interrompido — inicie novamente pelo site' };
const bytes = value => `${(value / 1024 / 1024).toFixed(1)} MB`;
const draftVersions = new Map();
const player = document.querySelector('#preview-player');
let previewTrackId;
let previewGeneration = 0;

function closePreview() {
  previewGeneration++;
  player.pause(); player.removeAttribute('src'); player.load();
  previewTrackId = undefined;
  document.querySelector('#preview').hidden = true;
  document.body.classList.remove('has-preview');
}

async function playPreview(track, candidate) {
  const generation = ++previewGeneration;
  previewTrackId = track.id;
  document.querySelector('#preview').hidden = false;
  document.body.classList.add('has-preview');
  document.querySelector('#preview-title').textContent = `${candidate.artist} — ${candidate.title}`;
  document.querySelector('#preview-status').textContent = 'Carregando prévia…';
  player.pause();
  player.src = `delivery-preview://track/${candidate.id}`;
  try { await player.play(); }
  catch (error) {
    if (generation === previewGeneration && error.name !== 'AbortError') document.querySelector('#preview-status').textContent = 'Não foi possível tocar a prévia. Verifique o login no DJ Delivery ou use “Ver no site”.';
  }
}
document.querySelector('#close-preview').onclick = closePreview;
player.onplaying = () => { document.querySelector('#preview-status').textContent = 'Prévia disponibilizada pelo DJ Delivery.'; };
player.onerror = () => {
  if (previewTrackId) document.querySelector('#preview-status').textContent = 'Prévia indisponível. Verifique o login no DJ Delivery ou use “Ver no site”.';
};

async function action(callback, success = '') {
  try { document.querySelector('#message').textContent = ''; await callback(); if (success) document.querySelector('#message').textContent = success; }
  catch (error) { document.querySelector('#message').textContent = error.message; }
}

function render(state = current) {
  current = state;
  renderTracks();
  document.querySelector('#folder-path').textContent = state.folder;
  document.querySelector('#count').textContent = state.downloads.length;
  const query = document.querySelector('#search').value.toLocaleLowerCase();
  const entries = state.downloads.filter(item => item.name.toLocaleLowerCase().includes(query));
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = query ? 'Nenhum arquivo encontrado.' : 'Sua seleção aparece aqui. Abra o DJ Delivery e clique no download de uma música.';
    list.append(empty);
  }
  for (const item of entries) {
    const row = document.createElement('article'); row.className = 'download';
    const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = '♫';
    const details = document.createElement('div'); details.className = 'details';
    const name = document.createElement('div'); name.className = 'filename'; name.textContent = item.name;
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${item.status === 'completed' && !item.fileAvailable ? 'Arquivo indisponível na pasta original' : statuses[item.status] || item.status} · ${bytes(item.received)}${item.total ? ` / ${bytes(item.total)}` : ''}`;
    details.append(name, meta);
    if (item.status === 'progressing') {
      const progress = document.createElement('progress');
      progress.setAttribute('aria-label', `Progresso de ${item.name}`);
      if (item.total > 0) { progress.max = item.total; progress.value = item.received; }
      details.append(progress);
    }
    row.append(icon, details);
    if (item.status === 'progressing' || (item.status === 'completed' && item.fileAvailable)) {
      const button = document.createElement('button');
      button.textContent = item.status === 'completed' ? 'Mostrar na pasta' : 'Cancelar';
      button.onclick = () => action(() => item.status === 'completed' ? api.showFile(item.id) : api.cancel(item.id));
      row.append(button);
    }
    list.append(row);
  }
}
document.querySelector('#site').onclick = () => action(() => api.openSite());
document.querySelector('#arrange-windows').onclick = () => action(() => api.arrangeWindows());
document.querySelector('#choose').onclick = () => action(() => api.chooseFolder());
document.querySelector('#folder').onclick = () => action(() => api.openFolder());
document.querySelector('#logout').onclick = () => action(() => { closePreview(); return api.logout(); }, 'Conta desconectada deste aplicativo.');
document.querySelector('#search').oninput = () => render();
api.onState(render);
action(async () => render(await api.state()));

function completedDownload(track) {
  const candidate = track.match?.candidates?.find(item => item.id === track.match.selectedId);
  return candidateDownload(candidate);
}

function candidateDownload(candidate) {
  return candidate && current.downloads.find(record => record.id === candidate.downloadedId && record.fileAvailable);
}

function showPanel(name) {
  activePanel = name;
  const selection = name === 'tracks';
  document.querySelector('#selection-panel').hidden = !selection;
  document.querySelector('#downloads-panel').hidden = selection;
  document.querySelector('#page-title').textContent = selection ? 'Suas músicas' : 'Downloads';
  document.querySelector('#import-shazam').hidden = !selection;
  for (const key of ['tracks', 'downloads']) {
    const button = document.querySelector(`#nav-${key}`);
    button.classList.toggle('active', name === key);
    button.setAttribute('aria-pressed', String(name === key));
  }
  updateHeading();
}
document.querySelector('#nav-tracks').onclick = () => showPanel('tracks');
document.querySelector('#nav-downloads').onclick = () => showPanel('downloads');

function updateHeading() {
  const tracks = current.tracks || [];
  const ready = tracks.filter(track => ['matched', 'confirmed'].includes(track.match?.status) && !completedDownload(track)).length;
  document.querySelector('#shazam-summary').textContent = activePanel === 'downloads'
    ? `${current.downloads.length} arquivos no histórico`
    : !tracks.length ? 'Importe músicas do Shazam para começar.' : `${tracks.length} músicas${ready ? ` · ${ready} ${ready === 1 ? 'pronta' : 'prontas'} para baixar` : ''}`;
}

function renderTracks() {
  const tracks = current.tracks || [];
  if (previewTrackId && !tracks.some(track => track.id === previewTrackId)) closePreview();
  const container = document.querySelector('#tracks');
  const expandedVersions = new Set([...container.querySelectorAll('.versions[open]')].map(node => node.dataset.trackId));
  const focused = document.activeElement?.closest('#tracks [data-control]');
  const focusTrack = focused?.closest('article')?.dataset.trackId;
  const focusControl = focused?.dataset.control;
  const query = document.querySelector('#track-search').value.toLocaleLowerCase();
  const job = current.job || {};
  const busy = Boolean(job.running || current.importingShazam);
  const pendingSelected = tracks.filter(track => track.selected && !completedDownload(track));
  const readySelected = pendingSelected.filter(track => ['matched', 'confirmed'].includes(track.match?.status));
  document.querySelector('#download-tracks').hidden = !readySelected.length;
  document.querySelector('#download-tracks').textContent = `Baixar (${readySelected.length})`;
  document.querySelector('#auto-tracks').hidden = !pendingSelected.length;
  document.querySelector('#download-availability').textContent = readySelected.length ? ''
    : pendingSelected.length ? 'Busque as músicas ou escolha uma versão para baixar.'
    : tracks.length && tracks.every(track => completedDownload(track)) ? 'Todas as versões escolhidas já foram baixadas.' : '';
  for (const id of ['search-tracks', 'download-tracks', 'auto-tracks', 'import-shazam', 'export-tracks']) document.getElementById(id).disabled = busy;
  document.querySelector('#search-tracks').disabled = busy || !pendingSelected.length;
  for (const id of ['select-all', 'clear-selection']) document.getElementById(id).disabled = busy || !tracks.length;
  document.querySelector('#clear-tracks').disabled = busy || !tracks.length;
  const undo = document.querySelector('#undo-remove-track');
  undo.hidden = !current.removedCount;
  undo.disabled = busy;
  undo.textContent = current.undoRemovalCount > 1 ? `↶ Restaurar ${current.undoRemovalCount} músicas` : '↶ Desfazer exclusão';
  document.querySelector('#stop-batch').hidden = !job.running;
  document.querySelector('#job-status').textContent = job.message ? `${job.done || 0}/${job.total || 0} · ${job.message}` : '';
  updateHeading();
  document.querySelector('#selection-count').textContent = pendingSelected.length ? `${pendingSelected.length} selecionadas` : '';
  container.replaceChildren();
  const filter = document.querySelector('#track-filter').value;
  const visible = tracks.filter(track => {
    if (!`${track.title} ${track.artist}`.toLocaleLowerCase().includes(query)) return false;
    if (filter === 'completed') return Boolean(completedDownload(track));
    if (filter === 'ready') return ['matched', 'confirmed'].includes(track.match?.status) && !completedDownload(track);
    if (filter === 'review') return !track.match || ['review', 'incomplete', 'error'].includes(track.match.status);
    if (filter === 'not_found') return track.match?.status === 'not_found';
    return true;
  });
  if (!visible.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = !tracks.length ? 'Sua seleção começa aqui. Importe músicas do Shazam para buscar no catálogo.' : 'Nenhuma música para este filtro.';
    container.append(empty);
  }
  for (const track of visible) {
    const row = document.createElement('article'); row.className = 'download';
    row.dataset.trackId = track.id;
    const downloaded = completedDownload(track);
    if (downloaded) row.classList.add('already-downloaded');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'track-select';
    checkbox.dataset.control = 'select';
    checkbox.checked = track.selected && !downloaded; checkbox.setAttribute('aria-label', `Selecionar ${track.title}`);
    checkbox.disabled = busy || Boolean(downloaded);
    if (downloaded) checkbox.title = 'Esta versão já foi baixada e não entra na fila.';
    checkbox.onchange = () => action(() => api.selectTrack(track.id, checkbox.checked));
    const details = document.createElement('div'); details.className = 'details';
    const title = document.createElement('div'); title.className = 'filename'; title.textContent = track.title;
    const artist = document.createElement('div'); artist.className = 'meta'; artist.textContent = track.artist || 'Artista não informado';
    details.append(title, artist);
    if (track.match) {
      const label = document.createElement('div'); label.className = 'match-state';
      label.dataset.status = track.match.status;
      const labels = { matched: 'Pronta para baixar', confirmed: 'Versão escolhida', review: 'Escolha uma versão', not_found: 'Não encontrada', incomplete: 'Busca parcial · revise as versões', error: 'Erro na busca' };
      label.textContent = labels[track.match.status] || track.match.status;
      if (track.match.error) label.textContent += `: ${track.match.error}`;
      details.append(label);
      const savedArea = document.createElement('div'); details.append(savedArea);
      const showSaved = candidate => {
        savedArea.replaceChildren();
        const completed = candidateDownload(candidate);
        label.hidden = Boolean(completed);
        if (!completed) return false;
        const badge = document.createElement('span'); badge.className = 'downloaded-badge'; badge.textContent = '✓ Já baixada';
        const saved = document.createElement('button'); saved.className = 'saved-file'; saved.textContent = 'Mostrar arquivo ↗';
        saved.title = completed.path;
        saved.onclick = () => action(() => api.showFile(completed.id));
        savedArea.append(badge, saved); return true;
      };
      showSaved(track.match.candidates?.find(item => item.id === track.match.selectedId));
      if (track.match.candidates?.length) {
        const select = document.createElement('select'); select.className = 'candidate'; select.disabled = Boolean(job.running);
        select.dataset.control = 'version';
        select.setAttribute('aria-label', `Versão de ${track.title}`);
        const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Selecione uma versão para ouvir…'; select.append(placeholder);
        for (const candidate of track.match.candidates) {
          const option = document.createElement('option'); option.value = String(candidate.id);
          option.textContent = `${candidate.artist} — ${candidate.title}`;
          if (candidateDownload(candidate)) option.textContent += ' · ✓ Já baixada';
          select.append(option);
        }
        const selectedId = draftVersions.has(track.id) ? draftVersions.get(track.id) : track.match.selectedId || (track.match.candidates.length === 1 ? track.match.candidates[0].id : null);
        select.value = selectedId ? String(selectedId) : '';
        const controls = document.createElement('div'); controls.className = 'version-actions';
        const listen = document.createElement('button'); listen.textContent = '▶ Ouvir';
        listen.setAttribute('aria-label', `Ouvir versão de ${track.title}`);
        const confirm = document.createElement('button'); confirm.textContent = 'Escolher esta versão';
        const updateControls = () => {
          listen.disabled = !select.value;
          const completed = showSaved(track.match.candidates.find(item => item.id === Number(select.value)));
          confirm.hidden = completed || !select.value || (Number(select.value) === track.match.selectedId && ['matched', 'confirmed'].includes(track.match.status));
          confirm.disabled = busy || !select.value || (Number(select.value) === track.match.selectedId && ['matched', 'confirmed'].includes(track.match.status));
        };
        select.onchange = () => {
          draftVersions.set(track.id, select.value ? Number(select.value) : null);
          updateControls();
        };
        listen.onclick = () => {
          const candidate = track.match.candidates.find(item => item.id === Number(select.value));
          if (candidate) void playPreview(track, candidate);
        };
        confirm.onclick = () => action(() => api.confirmMatch(track.id, Number(select.value)), 'Versão confirmada. Use “Baixar exatas e confirmadas” para baixar.');
        updateControls(); controls.append(listen, confirm);
        if (track.match.candidates.length > 1) {
          const versions = document.createElement('details'); versions.className = 'versions';
          versions.dataset.trackId = track.id; versions.open = expandedVersions.has(track.id);
          const summary = document.createElement('summary'); summary.textContent = `Ouvir e comparar · ${track.match.candidates.length} versões`;
          versions.append(summary, select, controls); details.append(versions);
        } else {
          select.hidden = true;
          const only = track.match.candidates[0];
          if (only.artist !== track.artist || only.title !== track.title) {
            const caption = document.createElement('div'); caption.className = 'version-caption'; caption.textContent = `${only.artist} — ${only.title}`; details.append(caption);
          }
          details.append(select, controls);
        }
      }
    }
    if (track.downloadError) {
      const error = document.createElement('div'); error.className = 'match-state'; error.textContent = track.downloadError; details.append(error);
    }
    const view = document.createElement('button'); view.textContent = 'Ver no catálogo ↗';
    view.onclick = () => action(() => api.viewSearch(track.id));
    const remove = document.createElement('button'); remove.className = 'remove-track'; remove.textContent = 'Excluir';
    remove.setAttribute('aria-label', `Excluir ${track.title} da lista`);
    remove.title = 'Remove da lista e das próximas importações. Mantém os arquivos baixados.';
    remove.disabled = busy;
    remove.onclick = () => action(() => api.removeTrack(track.id), 'Música excluída da lista. Os arquivos baixados foram mantidos.');
    const actions = document.createElement('details'); actions.className = 'track-actions menu';
    const summary = document.createElement('summary'); summary.textContent = '⋯'; summary.setAttribute('aria-label', `Ações de ${track.title}`);
    const menu = document.createElement('div'); menu.className = 'menu-content'; menu.append(view, remove);
    actions.append(summary, menu);
    row.append(checkbox, details, actions); container.append(row);
  }
  if (focusTrack && focusControl) container.querySelector(`article[data-track-id="${CSS.escape(focusTrack)}"] [data-control="${CSS.escape(focusControl)}"]`)?.focus({ preventScroll: true });
}
document.querySelector('#track-search').oninput = renderTracks;
document.querySelector('#track-filter').onchange = renderTracks;
document.querySelector('#select-all').onclick = () => action(() => api.selectAllTracks(true));
document.querySelector('#clear-selection').onclick = () => action(() => api.selectAllTracks(false));
document.querySelector('#import-shazam').onclick = async () => {
  const button = document.querySelector('#import-shazam');
  button.disabled = true; button.textContent = 'Importando…';
  await action(async () => {
    const result = await api.importShazam();
    document.querySelector('#message').textContent = `${result.records} registros lidos; ${result.total} músicas na lista; ${result.added} novas.`;
  });
  button.disabled = false; button.textContent = 'Importar Shazam';
};
document.querySelector('#export-tracks').onclick = () => action(() => api.exportTracks());
document.querySelector('#search-tracks').onclick = () => action(() => api.startBatch('search'));
document.querySelector('#download-tracks').onclick = () => action(() => api.startBatch('download'));
document.querySelector('#auto-tracks').onclick = () => action(() => api.startBatch('automatic'));
document.querySelector('#stop-batch').onclick = () => action(() => api.stopBatch());
document.querySelector('#undo-remove-track').onclick = () => action(() => api.undoRemoveTrack(), 'Exclusão desfeita.');
document.querySelector('#clear-tracks').onclick = () => action(() => api.clearTracks(), 'Lista removida do app. Use Restaurar para desfazer. Os arquivos baixados foram mantidos.');
document.querySelector('#refresh-files').onclick = () => action(async () => render(await api.state()), 'Verificação dos arquivos atualizada.');

document.addEventListener('toggle', event => {
  if (event.target.matches('details.menu[open]')) {
    document.querySelectorAll('details.menu[open]').forEach(menu => { if (menu !== event.target) menu.open = false; });
  }
}, true);
document.addEventListener('click', event => {
  document.querySelectorAll('details.menu[open]').forEach(menu => {
    if (!menu.contains(event.target) || event.target.closest('button')) menu.open = false;
  });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); });
});
let messageTimer;
new MutationObserver(() => {
  clearTimeout(messageTimer);
  if (document.querySelector('#message').textContent) messageTimer = setTimeout(() => { document.querySelector('#message').textContent = ''; }, 7000);
}).observe(document.querySelector('#message'), { childList: true, characterData: true, subtree: true });
