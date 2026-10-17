// Minecraft-Stream-Bingo – lokaler Server ohne externe Abhängigkeiten.
// Start: node server.js   →   Steuerung: http://localhost:3000/   Overlay: http://localhost:3000/overlay.html

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const TASKS_FILE = path.join(ROOT, 'aufgaben.json');
const STATE_FILE = path.join(ROOT, 'data', 'state.json');

const DEFAULT_CONFIG = {
  port: 3000,
  host: '127.0.0.1',
  cardSize: 5,
  freeCenter: true,
  thresholds: { minBits: 1, bigBits: 1000, minDono: 1, bigDono: 10, bigSubgift: 5, minRaidViewers: 1 },
  events: {
    follow: 'leicht', bits: 'leicht', bigBits: 'schwer', dono: 'mittel', bigDono: 'schwer',
    sub: 'mittel', subgift: 'mittel', bigSubgift: 'schwer', raid: 'raid',
  },
  followOncePerUser: true,
};

const TYPE_ALIASES = {
  follow: 'follow', follower: 'follow',
  bits: 'bits', cheer: 'bits',
  dono: 'dono', donation: 'dono', tip: 'dono', spende: 'dono',
  sub: 'sub', subscription: 'sub', resub: 'sub', prime: 'sub',
  subgift: 'subgift', giftsub: 'subgift', gift: 'subgift', subgifts: 'subgift',
  raid: 'raid',
};

// ---------- Dateien laden (bei jedem Zugriff neu, damit man live editieren kann) ----------

const lastGood = {};
function readJson(file, fallback) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    lastGood[file] = value;
    return value;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`⚠️  ${path.basename(file)} konnte nicht gelesen werden: ${err.message}`);
    return lastGood[file] ?? fallback;
  }
}

function loadConfig() {
  const c = readJson(CONFIG_FILE, {});
  return {
    ...DEFAULT_CONFIG,
    ...c,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...c.thresholds },
    events: { ...DEFAULT_CONFIG.events, ...c.events },
  };
}

function loadTasks() {
  return readJson(TASKS_FILE, { leicht: [], mittel: [], schwer: [], raid: [] });
}

// ---------- Zustand ----------

let state = loadState();

function emptyCard(size, freeCenter) {
  const cells = new Array(size * size).fill(null);
  if (freeCenter && size % 2 === 1) cells[Math.floor(cells.length / 2)] = { free: true };
  return { size, cells, number: 1 };
}

function loadState() {
  const cfg = loadConfig();
  const saved = readJson(STATE_FILE, null);
  if (saved && saved.card) return saved;
  return { card: emptyCard(cfg.cardSize, cfg.freeCenter), queue: [], used: {}, followers: [], log: [], bingos: 0 };
}

function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function allTasks() {
  return [...state.card.cells.filter(c => c && !c.free), ...state.queue];
}

function findTask(id) {
  const idx = state.card.cells.findIndex(c => c && c.id === id);
  if (idx !== -1) return { where: 'card', idx, task: state.card.cells[idx] };
  const q = state.queue.findIndex(t => t.id === id);
  if (q !== -1) return { where: 'queue', idx: q, task: state.queue[q] };
  return null;
}

// ---------- Logik ----------

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = parseFloat(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function resolveTier(type, amount, cfg) {
  const t = cfg.thresholds;
  const e = cfg.events;
  switch (type) {
    case 'follow': return e.follow;
    case 'bits':
      if (amount && amount < t.minBits) return null;
      return amount >= t.bigBits ? e.bigBits : e.bits;
    case 'dono':
      if (amount && amount < t.minDono) return null;
      return amount >= t.bigDono ? e.bigDono : e.dono;
    case 'sub': return e.sub;
    case 'subgift': return amount >= t.bigSubgift ? e.bigSubgift : e.subgift;
    case 'raid':
      if (amount && amount < t.minRaidViewers) return null;
      return e.raid;
    default: return null;
  }
}

function drawText(tier) {
  const pool = (loadTasks()[tier] || []).filter(Boolean);
  if (!pool.length) return null;
  const active = new Set(allTasks().map(t => t.template));
  state.used[tier] = (state.used[tier] || []).filter(x => pool.includes(x));
  let candidates = pool.filter(x => !active.has(x) && !state.used[tier].includes(x));
  if (!candidates.length) {
    // Alle Aufgaben dieser Stufe schon einmal dran gewesen → von vorne beginnen.
    state.used[tier] = [];
    candidates = pool.filter(x => !active.has(x));
  }
  if (!candidates.length) candidates = pool;
  const text = candidates[Math.floor(Math.random() * candidates.length)];
  state.used[tier].push(text);
  return text;
}

function fillText(template, user) {
  return template.replace(/\{user\}/g, user || 'den Raid');
}

function placeTask(task) {
  const empty = state.card.cells.map((c, i) => (c === null ? i : -1)).filter(i => i !== -1);
  if (!empty.length) {
    state.queue.push(task);
    return 'queue';
  }
  const idx = empty[Math.floor(Math.random() * empty.length)];
  state.card.cells[idx] = task;
  return 'card';
}

function createTask(tier, event) {
  const template = drawText(tier);
  if (!template) return null;
  return {
    id: crypto.randomUUID(),
    template,
    text: fillText(template, event.user),
    tier,
    done: false,
    event,
    addedAt: Date.now(),
  };
}

function addLog(entry) {
  state.log.unshift({ at: Date.now(), ...entry });
  state.log = state.log.slice(0, 50);
}

function countBingos() {
  const { size, cells } = state.card;
  const ok = i => cells[i] && (cells[i].free || cells[i].done);
  const lines = [];
  for (let r = 0; r < size; r++) lines.push([...Array(size)].map((_, c) => r * size + c));
  for (let c = 0; c < size; c++) lines.push([...Array(size)].map((_, r) => r * size + c));
  lines.push([...Array(size)].map((_, i) => i * size + i));
  lines.push([...Array(size)].map((_, i) => i * size + (size - 1 - i)));
  return lines.filter(line => line.every(ok)).length;
}

function updateBingos() {
  const now = countBingos();
  const gained = now > state.bingos;
  state.bingos = now;
  return gained;
}

// ---------- Aktionen ----------

const actions = {
  event(p) {
    const cfg = loadConfig();
    const type = TYPE_ALIASES[String(p.type || '').toLowerCase()];
    if (!type) return { status: 400, body: { ok: false, error: `Unbekannter Event-Typ "${p.type}"` } };
    const user = String(p.user || '').trim().slice(0, 40);
    const amount = parseAmount(p.amount);

    if (type === 'follow' && cfg.followOncePerUser && user) {
      const key = user.toLowerCase();
      if (state.followers.includes(key)) {
        return { body: { ok: true, ignored: true, reason: `${user} hat schon eine Follow-Aufgabe ausgelöst` } };
      }
      state.followers.push(key);
    }

    const tier = resolveTier(type, amount, cfg);
    if (!tier) return { body: { ok: true, ignored: true, reason: 'Unter der Mindestgrenze oder Event deaktiviert' } };

    const task = createTask(tier, { type, user, amount });
    if (!task) return { status: 500, body: { ok: false, error: `Keine Aufgaben für Stufe "${tier}" in aufgaben.json` } };
    const where = placeTask(task);
    addLog({ type, user, amount, tier, text: task.text });
    return { body: { ok: true, task, where }, toast: { task, where } };
  },

  add(p) {
    const tier = String(p.tier || 'leicht');
    const task = createTask(tier, { type: 'manual', user: String(p.user || '').trim().slice(0, 40), amount: 0 });
    if (!task) return { status: 400, body: { ok: false, error: `Keine Aufgaben für Stufe "${tier}"` } };
    const where = placeTask(task);
    addLog({ type: 'manual', user: task.event.user, tier, text: task.text });
    return { body: { ok: true, task, where }, toast: { task, where } };
  },

  toggle(p) {
    const found = findTask(p.id);
    if (!found) return { status: 404, body: { ok: false, error: 'Aufgabe nicht gefunden' } };
    found.task.done = p.done === undefined ? !found.task.done : String(p.done) === 'true';
    found.task.doneAt = found.task.done ? Date.now() : null;
    return { body: { ok: true, task: found.task } };
  },

  reroll(p) {
    const found = findTask(p.id);
    if (!found) return { status: 404, body: { ok: false, error: 'Aufgabe nicht gefunden' } };
    const old = found.task;
    const template = drawText(old.tier);
    if (!template) return { status: 400, body: { ok: false, error: 'Keine Aufgaben verfügbar' } };
    Object.assign(old, { template, text: fillText(template, old.event.user), done: false, doneAt: null, addedAt: Date.now() });
    return { body: { ok: true, task: old }, toast: { task: old, where: found.where, reroll: true } };
  },

  remove(p) {
    const found = findTask(p.id);
    if (!found) return { status: 404, body: { ok: false, error: 'Aufgabe nicht gefunden' } };
    if (found.where === 'card') {
      state.card.cells[found.idx] = null;
      // Nächste Aufgabe aus der Warteschlange nachrücken lassen.
      if (state.queue.length) state.card.cells[found.idx] = state.queue.shift();
    } else {
      state.queue.splice(found.idx, 1);
    }
    return { body: { ok: true } };
  },

  newcard() {
    const cfg = loadConfig();
    const carry = [
      ...state.card.cells.filter(c => c && !c.free && !c.done),
      ...state.queue,
    ];
    const number = (state.card.number || 1) + 1;
    state.card = emptyCard(cfg.cardSize, cfg.freeCenter);
    state.card.number = number;
    state.queue = [];
    state.bingos = 0;
    carry.forEach(placeTask);
    addLog({ type: 'system', text: `Neue Karte #${number} (${carry.length} offene Aufgaben übernommen)` });
    return { body: { ok: true } };
  },

  reset() {
    const cfg = loadConfig();
    state = { card: emptyCard(cfg.cardSize, cfg.freeCenter), queue: [], used: {}, followers: [], log: [], bingos: 0 };
    addLog({ type: 'system', text: 'Alles zurückgesetzt' });
    return { body: { ok: true } };
  },
};

// ---------- Live-Updates (Server-Sent Events) ----------

const clients = new Set();

function publicState() {
  const cfg = loadConfig();
  const tasks = loadTasks();
  return {
    card: state.card,
    queue: state.queue,
    log: state.log,
    bingos: state.bingos,
    config: { thresholds: cfg.thresholds, events: cfg.events },
    poolSizes: Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, v.length])),
  };
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve(Object.fromEntries(new URLSearchParams(data))); }
    });
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/control.html' : decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  if (pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (pathname === '/api/state') return sendJson(res, 200, publicState());

  const action = pathname.startsWith('/api/') && actions[pathname.slice(5)];
  if (action) {
    // GET mit Query-Parametern (z. B. Streamer.bot „Fetch URL“) und POST mit JSON funktionieren beide.
    const params = { ...Object.fromEntries(url.searchParams), ...(req.method === 'POST' ? await readBody(req) : {}) };
    let result;
    try {
      result = action(params);
    } catch (err) {
      console.error(err);
      return sendJson(res, 500, { ok: false, error: err.message });
    }
    const changed = result.body.ok && !result.body.ignored;
    if (changed) {
      const gainedBingo = updateBingos();
      saveState();
      broadcast('state', publicState());
      if (result.toast) broadcast('task', result.toast);
      if (gainedBingo) broadcast('bingo', { bingos: state.bingos });
    }
    if (pathname === '/api/event') {
      const p = params;
      const info = result.body.task ? `→ [${result.body.task.tier}] ${result.body.task.text}` : `→ ${result.body.reason || result.body.error}`;
      console.log(`${new Date().toLocaleTimeString('de-DE')}  ${p.type} ${p.user || ''} ${p.amount || ''} ${info}`);
    }
    return sendJson(res, result.status || 200, result.body);
  }

  if (pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Unbekannter Endpunkt' });
  serveStatic(req, res, pathname);
});

const cfg = loadConfig();
server.listen(cfg.port, cfg.host, () => {
  const base = `http://localhost:${cfg.port}`;
  console.log('');
  console.log('  ⛏️  Minecraft-Stream-Bingo läuft');
  console.log(`  Steuerung:  ${base}/`);
  console.log(`  Overlay:    ${base}/overlay.html            (Bingo-Karte)`);
  console.log(`              ${base}/overlay.html?mode=list  (Liste offener Aufgaben)`);
  console.log('  Beenden mit Strg+C');
  console.log('');
});
