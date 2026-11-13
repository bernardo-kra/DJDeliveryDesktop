const { app, BrowserWindow, WebContentsView, screen, session, ipcMain, dialog, shell, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { availablePath } = require('./files.cjs');
const { importShazam } = require('./shazam.cjs');
const { searchTrack, ORIGIN } = require('./catalog.cjs');
const { previewHandler } = require('./preview.cjs');
const { windowLayout } = require('./window-layout.cjs');
const { availableFile, findDownloaded, selectedDownload } = require('./download-status.cjs');
const { fetchQuota, checkCandidateQuota } = require('./quota.cjs');
const { defaultSettings, normalizeSettings, loadSettings, writeSettings, validateDownloadFolder } = require('./settings.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'delivery-preview', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true
} }]);

let dashboard;
let config;
let stateFile;
let settingsFile;
let settings;
let settingsNotice = '';
let siteSession;
let quota = { status: 'unknown', sections: [], checkedAt: null };
let quotaRequest;
let quotaEpoch = 0;
const active = new Map();
const reserved = new Set();
const siteWindows = new Set();
const siteViews = new Map();
let catalogWindow;
const pendingDownloads = new Map();
let job = { running: false, done: 0, total: 0, message: '' };
let stopJob = false;
let importingShazam = false;
const HOME = 'https://srv.djdelivery.com';
// Packaged and development builds share the existing library and browser session.
if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'dj-delivery-desktop'));
const ownsProfile = app.requestSingleInstanceLock();
if (!ownsProfile) app.quit();
app.on('second-instance', () => {
  if (dashboard && !dashboard.isDestroyed()) {
    if (dashboard.isMinimized()) dashboard.restore();
    dashboard.show(); dashboard.focus();
  }
});

function save() {
  const temporary = `${stateFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2));
  fs.renameSync(temporary, stateFile);
}

function snapshot() {
  const stats = new Map();
  const stat = file => {
    if (!stats.has(file)) { try { stats.set(file, fs.statSync(file)); } catch { stats.set(file, null); } }
    const result = stats.get(file);
    if (!result) throw new Error('Arquivo indisponível');
    return result;
  };
  const downloads = config.downloads.map(record => ({ ...record, fileAvailable: availableFile(record, stat) }));
  const tracks = (config.tracks || []).map(track => ({ ...track, match: track.match ? { ...track.match,
    candidates: (track.match.candidates || []).map(candidate => ({ ...candidate,
      downloadedId: findDownloaded(config.downloads, candidate, stat)?.id || null }))
  } : undefined }));
  return { folder: settings.folder, settings, settingsNotice, downloads, tracks, job, quota,
    importingShazam, removedCount: config.excludedTracks?.length || 0,
    undoRemovalCount: config.lastRemovalIds?.length || (config.excludedTracks?.length ? 1 : 0) };
}

function publish() {
  if (dashboard && !dashboard.isDestroyed()) dashboard.webContents.send('state', snapshot());
}

async function refreshQuota(force = false) {
  if (quotaRequest) return quotaRequest;
  if (!force && quota.checkedAt && Date.now() - Date.parse(quota.checkedAt) < 60000) return quota;
  const epoch = quotaEpoch;
  quotaRequest = (async () => {
    try { const fetched = await fetchQuota((...args) => siteSession.fetch(...args)); if (epoch === quotaEpoch) quota = fetched; }
    catch (error) { if (epoch === quotaEpoch) quota = { status: 'error', sections: [], checkedAt: new Date().toISOString(), message: error.message }; }
    finally { if (epoch === quotaEpoch) quotaRequest = undefined; publish(); }
    return quota;
  })();
  return quotaRequest;
}

function showDashboard() {
  if (!dashboard || dashboard.isDestroyed()) createDashboard();
  if (dashboard.isMinimized()) dashboard.restore();
  dashboard.show(); dashboard.focus();
}

function arrangeWindows(win = catalogWindow) {
  if (!win || win.isDestroyed()) return;
  const area = screen.getDisplayMatching(dashboard.getBounds()).workArea;
  const layout = windowLayout(area);
  if (!layout) { showDashboard(); job.message = 'Para alternar, use “Voltar ao app” no catálogo ou ⌘⇧A (Ctrl+Shift+A).'; publish(); return; }
  for (const [target, bounds] of [[dashboard, layout.dashboard], [win, layout.catalog]]) {
    if (target.isFullScreen()) target.setFullScreen(false);
    if (target.isMaximized()) target.unmaximize();
    if (target.isMinimized()) target.restore();
    target.setBounds(bounds); target.show();
  }
  dashboard.focus();
}

function openSite(url = HOME, reuse = true) {
  if (reuse && catalogWindow && !catalogWindow.isDestroyed()) {
    if (url !== HOME) siteViews.get(catalogWindow).webContents.loadURL(url).catch(() => {});
    if (catalogWindow.isMinimized()) catalogWindow.restore();
    catalogWindow.show(); catalogWindow.focus(); return;
  }
  const win = new BrowserWindow({
    width: 900, height: 760, minWidth: 560, minHeight: 560, title: 'DJ Delivery — catálogo',
    webPreferences: { preload: path.join(__dirname, 'site-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  if (reuse) catalogWindow = win;
  const view = new WebContentsView({ webPreferences: { session: siteSession, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(view);
  siteViews.set(win, view);
  const resize = () => { const [width, height] = win.getContentSize(); view.setBounds({ x: 0, y: 54, width, height: Math.max(0, height - 54) }); };
  resize(); win.on('resize', resize);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(path.join(__dirname, 'site.html'));
  siteWindows.add(win);
  win.on('closed', () => {
    siteWindows.delete(win); siteViews.delete(win);
    if (catalogWindow === win) catalogWindow = undefined;
    if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  for (const contents of [win.webContents, view.webContents]) contents.on('before-input-event', (event, input) => {
    if ((input.meta || input.control) && input.shift && input.key.toLowerCase() === 'a') { event.preventDefault(); showDashboard(); }
  });
  view.webContents.on('will-navigate', (event, target) => {
    if (!/^https?:\/\//i.test(target)) event.preventDefault();
  });
  view.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) openSite(target, false);
    return { action: 'deny' };
  });
  view.webContents.on('did-finish-load', () => { void refreshQuota(true); });
  view.webContents.loadURL(url).catch(() => {
    job.message = 'Não foi possível abrir o catálogo. Confira a conexão e use Recarregar no site.'; publish();
  });
  if (reuse && settings.arrangeWindows) arrangeWindows(win);
}

function registerDownloads() {
  siteSession.on('will-download', (_event, item) => {
    const pendingEntry = [...pendingDownloads].find(([url]) => item.getURLChain().includes(url));
    const pending = pendingEntry?.[1];
    if (pendingEntry) { clearTimeout(pending.timer); pendingDownloads.delete(pendingEntry[0]); }
    try {
      if (pending && (!/^(audio\/|application\/(octet-stream|force-download|download|x-download))/i.test(item.getMimeType()))) {
        item.cancel(); pending.reject(new Error('O site não retornou um arquivo de áudio. Verifique login e limite de downloads.')); return;
      }
      if (!settings.setupComplete) throw new Error('Conclua a configuração inicial para baixar músicas.');
      validateDownloadFolder(settings.folder);
      const destination = availablePath(settings.folder, item.getFilename(), fs.existsSync, reserved);
      reserved.add(destination);
      const record = {
        id: randomUUID(), name: path.basename(destination), path: destination,
        status: 'progressing', received: 0, total: item.getTotalBytes(),
        createdAt: new Date().toISOString()
      };
      if (pending) record.trackId = pending.trackId;
      const source = item.getURLChain().map(url => {
        try { const parsed = new URL(url); return parsed.origin === ORIGIN ? parsed.pathname.match(/^\/a\/ms\/track\/(\d+)\/download\//)?.[1] : null; }
        catch { return null; }
      }).find(Boolean);
      if (source) record.catalogId = Number(source);
      active.set(record.id, item);
      config.downloads.unshift(record);
      item.setSavePath(destination);
      save();
      publish();
      item.on('updated', (_event, status) => {
        record.received = item.getReceivedBytes();
        record.total = item.getTotalBytes();
        record.status = status;
        publish();
      });
      item.once('done', (_event, status) => {
        record.status = status;
        record.received = item.getReceivedBytes();
        active.delete(record.id);
        reserved.delete(destination);
        save();
        publish();
        void refreshQuota(true);
        if (pending) {
          if (status === 'completed') pending.resolve(record);
          else pending.reject(new Error(`Download ${status === 'cancelled' ? 'cancelado' : 'interrompido'}.`));
        }
      });
    } catch (error) {
      item.cancel();
      pending?.reject(error);
      dialog.showErrorBox('Não foi possível salvar o download', error.message);
    }
  });
}

async function downloadCandidate(track, candidate) {
  const prior = findDownloaded(config.downloads, candidate);
  if (prior) return Promise.resolve(prior);
  const decision = checkCandidateQuota(await refreshQuota(true), candidate);
  if (stopJob) throw new Error('Operação cancelada.');
  if (!decision.allowed) throw new Error(decision.message);
  // URLs are built from catalog IDs and an allowlisted format, never from renderer input.
  if (!new RegExp('^https://srv\\.djdelivery\\.com/a/ms/track/[0-9]+/download/(mp3|flac|wav|aiff|aif|m4a)$').test(candidate.url)) {
    return Promise.reject(new Error('Link de download inválido. Busque a faixa novamente.'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingDownloads.delete(candidate.url); reject(new Error('O site não iniciou o download. Verifique sua conta.')); }, 30000);
    pendingDownloads.set(candidate.url, { trackId: track.id, resolve, reject, timer });
    try { siteSession.downloadURL(candidate.url); }
    catch (error) { clearTimeout(timer); pendingDownloads.delete(candidate.url); reject(error); }
  });
}

async function runBatch(mode, tracks) {
  stopJob = false;
  job = { running: true, done: 0, total: tracks.length, message: 'Iniciando…' }; publish();
  try {
    for (const track of tracks) {
      if (stopJob) break;
      job.message = `${mode === 'download' ? 'Baixando' : 'Buscando'}: ${track.artist} — ${track.title}`; publish();
      try {
        if (mode !== 'download') {
          track.match = await searchTrack((...args) => siteSession.fetch(...args), track, () => stopJob);
          save(); publish();
        }
        if (stopJob) break;
        if (mode !== 'search' && ['matched', 'confirmed'].includes(track.match?.status)) {
          const candidate = track.match.candidates.find(item => item.id === track.match.selectedId);
          if (candidate) {
            job.message = `Baixando: ${candidate.artist} — ${candidate.title}`; publish();
            await downloadCandidate(track, candidate);
            delete track.downloadError;
          }
        }
      } catch (error) {
        if (stopJob) break;
        if (mode === 'download' || track.match?.status === 'matched' || track.match?.status === 'confirmed') track.downloadError = error.message;
        else track.match = { status: 'error', candidates: [], error: error.message };
        // Stop on access/network failures rather than repeating requests for the whole list.
        job.message = error.message;
        break;
      }
      job.done++; save(); publish();
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    if (stopJob) job.message = 'Operação cancelada.';
    else if (job.done === job.total) job.message = mode === 'search' ? 'Busca concluída. Revise os resultados abaixo.' : 'Fila concluída. Veja os downloads e as faixas pendentes de revisão.';
  } finally { job.running = false; save(); publish(); }
}

function createDashboard() {
  dashboard = new BrowserWindow({
    width: 1180, height: 820, minWidth: 680, minHeight: 560,
    title: 'Delivery Desktop', backgroundColor: '#101117',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  dashboard.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  dashboard.webContents.on('will-navigate', event => event.preventDefault());
  dashboard.on('focus', () => { if (config) { publish(); void refreshQuota(); } });
  dashboard.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  if (!ownsProfile) return;
  stateFile = path.join(app.getPath('userData'), 'downloads.json');
  config = { downloads: [] };
  if (fs.existsSync(stateFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (Array.isArray(saved.downloads)) config = saved;
    } catch { /* Keep the original file until the next successful write. */ }
  }
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    settings = loadSettings(settingsFile, app.getPath('downloads'), config.folder);
    if (!fs.existsSync(settingsFile)) writeSettings(settingsFile, settings);
  } catch {
    settings = defaultSettings(app.getPath('downloads'));
    settingsNotice = 'Não foi possível ler suas configurações. Escolha novamente a pasta e salve para continuar.';
  }
  delete config.folder;
  config.downloads.forEach(record => {
    if (record.status === 'progressing') record.status = 'interrupted';
  });
  config.tracks = Array.isArray(config.tracks) ? config.tracks : [];
  config.excludedTracks = Array.isArray(config.excludedTracks) ? config.excludedTracks : [];
  siteSession = session.fromPartition('persist:djdelivery');
  siteSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  siteSession.setPermissionCheckHandler(() => false);
  protocol.handle('delivery-preview', previewHandler((...args) => siteSession.fetch(...args), () => config.tracks));
  registerDownloads();
  // Only the local dashboard may call privileged actions.
  function handle(channel, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!dashboard || event.sender !== dashboard.webContents || event.senderFrame !== dashboard.webContents.mainFrame) {
        throw new Error('Origem não autorizada');
      }
      return callback(...args);
    });
  }
  handle('get-state', snapshot);
  handle('refresh-quota', () => refreshQuota(true));
  handle('open-site', () => openSite());
  handle('arrange-windows', () => { if (!catalogWindow || catalogWindow.isDestroyed()) openSite(); else arrangeWindows(); });
  handle('select-all-tracks', selected => {
    if (job.running || importingShazam) throw new Error('Aguarde a operação terminar.');
    if (typeof selected !== 'boolean') throw new Error('Seleção inválida.');
    config.tracks.forEach(track => { track.selected = selected && !selectedDownload(config.downloads, track); }); save(); publish();
  });
  function catalogHandle(channel, callback) {
    ipcMain.handle(channel, event => {
      const win = [...siteWindows].find(item => item.webContents === event.sender);
      if (!win || event.senderFrame !== win.webContents.mainFrame) throw new Error('Origem não autorizada');
      callback(win, siteViews.get(win));
    });
  }
  catalogHandle('catalog-dashboard', showDashboard);
  catalogHandle('catalog-arrange', win => arrangeWindows(win));
  catalogHandle('catalog-back', (_win, view) => { if (view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack(); });
  catalogHandle('catalog-reload', (_win, view) => view.webContents.reload());
  handle('start-batch', mode => {
    if (!['search', 'download', 'automatic'].includes(mode)) throw new Error('Operação inválida.');
    if (job.running) throw new Error('Já existe uma operação em andamento.');
    if (importingShazam) throw new Error('Aguarde a importação terminar.');
    if (mode !== 'search') {
      if (!settings.setupComplete) throw new Error('Conclua a configuração inicial antes de baixar.');
      validateDownloadFolder(settings.folder);
    }
    const tracks = config.tracks.filter(track => track.selected && !selectedDownload(config.downloads, track)
      && (mode !== 'download' || ['matched', 'confirmed'].includes(track.match?.status)));
    if (!tracks.length) { job.message = 'Nenhuma faixa pendente para esta operação. As versões já baixadas foram ignoradas.'; publish(); return; }
    void runBatch(mode, tracks).catch(error => { job.running = false; job.message = error.message; publish(); });
  });
  handle('stop-batch', () => {
    stopJob = true;
    for (const [url, pending] of pendingDownloads) {
      clearTimeout(pending.timer); pendingDownloads.delete(url); pending.reject(new Error('Operação cancelada.'));
    }
    for (const record of config.downloads) if (record.trackId) active.get(record.id)?.cancel();
  });
  handle('confirm-match', (id, candidateId) => {
    if (job.running) throw new Error('Aguarde a operação terminar antes de revisar.');
    const track = config.tracks.find(entry => entry.id === id);
    if (!track?.match?.candidates.some(candidate => candidate.id === candidateId)) throw new Error('Resultado inválido.');
    track.match.selectedId = candidateId; track.match.status = 'confirmed';
    save(); publish();
  });
  handle('view-search', id => {
    const track = config.tracks.find(entry => entry.id === id);
    if (!track) throw new Error('Faixa não encontrada.');
    openSite(`${ORIGIN}/#/search?text=${encodeURIComponent(`${track.artist} ${track.title}`.trim())}`);
  });
  handle('import-shazam', async () => {
    if (job.running) throw new Error('Aguarde a operação terminar antes de importar.');
    if (importingShazam) throw new Error('A importação já está em andamento.');
    importingShazam = true; publish();
    try {
      const result = await importShazam(app.getPath('home'), config.tracks, config.excludedTracks.map(track => track.id), settings.shazamDatabase);
      config.tracks = result.tracks;
      save(); publish();
      return { records: result.records, added: result.added, total: result.tracks.length };
    } finally { importingShazam = false; publish(); }
  });
  handle('remove-track', id => {
    if (job.running || importingShazam) throw new Error('Aguarde ou pare a operação antes de excluir.');
    const track = config.tracks.find(entry => entry.id === id);
    if (!track) throw new Error('Faixa não encontrada.');
    config.excludedTracks.push(track);
    config.lastRemovalIds = [track.id];
    config.tracks = config.tracks.filter(entry => entry.id !== id);
    save(); publish();
  });
  handle('clear-tracks', () => {
    if (job.running || importingShazam) throw new Error('Aguarde ou pare a operação antes de limpar a lista.');
    if (!config.tracks.length) return;
    config.lastRemovalIds = config.tracks.map(track => track.id);
    config.excludedTracks = config.excludedTracks.concat(config.tracks);
    config.tracks = [];
    job = { running: false, done: 0, total: 0, message: '' };
    save(); publish();
  });
  handle('undo-remove-track', () => {
    if (job.running || importingShazam) throw new Error('Aguarde ou pare a operação antes de restaurar.');
    const ids = new Set(config.lastRemovalIds?.length ? config.lastRemovalIds : config.excludedTracks.slice(-1).map(track => track.id));
    const restored = config.excludedTracks.filter(track => ids.has(track.id));
    config.excludedTracks = config.excludedTracks.filter(track => !ids.has(track.id));
    config.lastRemovalIds = [];
    config.tracks = config.tracks.concat(restored);
    config.tracks.sort((a, b) => (b.identifiedAt || '').localeCompare(a.identifiedAt || ''));
    save(); publish();
  });
  handle('select-track', (id, selected) => {
    const track = config.tracks.find(entry => entry.id === id);
    if (!track || typeof selected !== 'boolean') throw new Error('Faixa inválida.');
    track.selected = selected;
    save(); publish();
  });
  handle('export-tracks', async () => {
    const selected = config.tracks.filter(track => track.selected);
    if (!selected.length) throw new Error('Selecione ao menos uma faixa.');
    const result = await dialog.showSaveDialog(dashboard, {
      title: 'Exportar lista de músicas', defaultPath: path.join(app.getPath('downloads'), 'Shazam.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled) return false;
    const cell = value => `"${String(value).replace(/"/g, '""')}"`;
    const csv = ['Artista,Música', ...selected.map(track => [track.artist, track.title].map(cell).join(','))].join('\r\n');
    await fs.promises.writeFile(result.filePath, '\uFEFF' + csv, 'utf8');
    return true;
  });
  handle('pick-download-folder', async () => {
    const result = await dialog.showOpenDialog(dashboard, {
      title: 'Escolha onde salvar suas músicas', defaultPath: settings.folder,
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('pick-shazam-database', async () => {
    const result = await dialog.showOpenDialog(dashboard, {
      title: 'Selecione o banco de histórico do Shazam', properties: ['openFile'],
      filters: [{ name: 'Banco do Shazam', extensions: ['sqlite', 'db'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('save-settings', async value => {
    if (active.size || pendingDownloads.size || job.running || importingShazam) throw new Error('Aguarde ou pare a operação antes de alterar as configurações.');
    if (!value || typeof value.folder !== 'string' || !path.isAbsolute(value.folder)
      || typeof value.arrangeWindows !== 'boolean'
      || (value.shazamDatabase !== null && (typeof value.shazamDatabase !== 'string' || !path.isAbsolute(value.shazamDatabase)))) {
      throw new Error('Configurações inválidas. Escolha os caminhos pelos botões de seleção.');
    }
    const next = normalizeSettings({ ...value, setupComplete: true }, defaultSettings(app.getPath('downloads')));
    validateDownloadFolder(next.folder, next.folder === defaultSettings(app.getPath('downloads')).folder);
    if (next.shazamDatabase) await importShazam(app.getPath('home'), [], [], next.shazamDatabase);
    writeSettings(settingsFile, next);
    settings = next; settingsNotice = ''; publish();
  });
  handle('open-folder', async () => {
    if (!settings.setupComplete) throw new Error('Conclua a configuração inicial para abrir sua pasta.');
    validateDownloadFolder(settings.folder);
    const error = await shell.openPath(settings.folder);
    if (error) throw new Error(error);
  });
  handle('show-file', id => {
    const record = config.downloads.find(entry => entry.id === id);
    if (record?.status === 'completed' && fs.existsSync(record.path)) shell.showItemInFolder(record.path);
    else throw new Error('Arquivo não encontrado na pasta original.');
  });
  handle('cancel-download', id => active.get(id)?.cancel());
  handle('logout', async () => {
    if (active.size || job.running) throw new Error('Aguarde ou cancele a operação antes de desconectar.');
    for (const win of siteWindows) win.close();
    await siteSession.clearStorageData();
    quotaEpoch++; quotaRequest = undefined;
    quota = { status: 'unknown', sections: [], checkedAt: null }; publish();
    await siteSession.clearCache();
  });
  createDashboard();
  app.on('activate', () => { if (!dashboard || dashboard.isDestroyed()) createDashboard(); });
});

app.on('before-quit', event => {
  if (active.size && dashboard && !dashboard.isDestroyed()) {
    const answer = dialog.showMessageBoxSync(dashboard, {
      type: 'question', message: 'Há downloads em andamento. Sair e cancelar?',
      buttons: ['Continuar baixando', 'Sair'], defaultId: 0, cancelId: 0
    });
    if (answer === 0) event.preventDefault();
    else for (const item of active.values()) item.cancel();
  }
});
app.on('window-all-closed', () => app.quit());
