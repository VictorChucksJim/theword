'use strict';
/*
 * Scripture Captions server (no dependencies).
 *   /          operator page (microphone, transcript, scripture suggestions, controls)
 *   /output    transparent overlay for a vMix Web Browser input
 *   /events    server-sent events feeding the overlay
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Scripture, VERSION_LABELS } = require('./src/scripture');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC = path.join(__dirname, 'public');

console.log('Loading Bible data...');
const scripture = new Scripture();
console.log(`Ready: ${scripture.docs.length} verses, versions: ${scripture.versions.join(', ')}`);

// ------------------------------------------------------------ shared state
const defaults = {
  version: 'WEB',          // version shown for explicit references
  autoShowReferences: true,
  autoShowParaphrase: false,
  hideAfter: 25,           // seconds the scripture card stays up (0 = until hidden)
  captionsOn: true,
  captionLines: 2,
  captionSize: 3.6,        // vw
  scriptureSize: 2.7,      // vw
  captionClearAfter: 6,    // seconds of silence before captions fade
  position: 'bottom',      // bottom | top
  presentationMode: 'auto', // auto | sermon | music
  autoSwitchMode: false,    // operator-controlled safety default
  hymnSearchEnabled: true,
  liveLyricsEnabled: true,
};
const state = {
  settings: { ...defaults },
  caption: { text: '', final: true, at: 0 },
  scripture: null,         // { ref, version }
};
const clients = new Set();

function broadcast(type, payload) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(msg);
}

function pickVersionText(ref, version) {
  const list = ref.verses[version] || ref.verses[scripture.versions[0]];
  return list;
}

function showScripture(ref, version) {
  const ver = scripture.versions.includes(version) ? version : state.settings.version;
  const verses = pickVersionText(ref, ver);
  state.scripture = {
    label: ref.label,
    version: ver,
    versionName: VERSION_LABELS[ver] || ver,
    verses,
    partial: !!ref.partial,
    shownAt: Date.now(),
  };
  broadcast('scripture', state.scripture);
}

function hideScripture() {
  state.scripture = null;
  broadcast('scripture', null);
}

// ------------------------------------------------------------ http helpers
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 200000) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveFile(res, file) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

// trim a reference for the wire (browser only needs label + verses for every version)
function wireRef(ref) {
  return {
    label: ref.label,
    bookIdx: ref.bookIdx,
    chapter: ref.chapter,
    vStart: ref.vStart,
    vEnd: ref.vEnd,
    source: ref.source,
    confidence: ref.confidence,
    bestVersion: ref.bestVersion || null,
    versionScores: ref.versionScores || null,
    spoken: ref.spoken || null,
    partial: !!ref.partial,
    wholeChapter: !!ref.wholeChapter,
    verses: ref.verses,
  };
}

// ------------------------------------------------------------ server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') return serveFile(res, 'control.html');
    if (req.method === 'GET' && url.pathname === '/output') return serveFile(res, 'output.html');

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 1000\n\n');
      res.write(`event: hello\ndata: ${JSON.stringify({ settings: state.settings, caption: state.caption, scripture: state.scripture })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/info') {
      return sendJSON(res, 200, {
        versions: scripture.versions.map((v) => ({ id: v, name: VERSION_LABELS[v] || v })),
        settings: state.settings,
        urls: lanUrls(),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/caption') {
      const { text = '', final = false } = await readBody(req);
      state.caption = { text: String(text).slice(0, 600), final: !!final, at: Date.now() };
      if (state.settings.captionsOn && (state.settings.presentationMode !== 'music' || state.settings.liveLyricsEnabled)) broadcast('caption', state.caption);
      return sendJSON(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/detect') {
      const { text = '', final = true, sessionId = 'default' } = await readBody(req);
      const t0 = Date.now();
      if (state.settings.presentationMode === 'music') return sendJSON(res, 200, { references: [], suggestions: [], autoShown: null, ms: 0 });
      const { references, suggestions } = scripture.detect(String(text).slice(0, 800), { sessionId, final });
      let autoShown = null;
      // while the speaker is still talking (interim text) skip bare chapters, which may still become a verse
      const settled = references.filter((r) => final || !r.wholeChapter);
      const cur = state.scripture;
      const alreadyUp = (label) => cur && cur.label === label && Date.now() - cur.shownAt < 8000;
      if (settled.length && state.settings.autoShowReferences) {
        const r = settled[settled.length - 1];
        if (!alreadyUp(r.label)) showScripture(r, state.settings.version);
        autoShown = r.label;
      } else if (!references.length && suggestions.length && state.settings.autoShowParaphrase && suggestions[0].confidence >= 0.8) {
        const r = suggestions[0];
        showScripture(r, r.bestVersion);
        autoShown = r.label;
      }
      return sendJSON(res, 200, {
        references: references.map(wireRef),
        suggestions: suggestions.map(wireRef),
        autoShown,
        ms: Date.now() - t0,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/hymns') {
      if (!state.settings.hymnSearchEnabled) return sendJSON(res, 200, { results: [] });
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (q.length < 2) return sendJSON(res, 200, { results: [] });
      const hymns = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'hymns.json'), 'utf8'));
      const terms = q.split(/\\s+/).filter(Boolean);
      const results = hymns.map((h) => {
        const hay = (h.title + ' ' + h.author + ' ' + h.lyrics.join(' ')).toLowerCase();
        const hits = terms.filter((term) => hay.includes(term)).length;
        return { ...h, score: hits / terms.length };
      }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
      return sendJSON(res, 200, { results });
    }

    if (req.method === 'GET' && url.pathname === '/api/lookup') {
      const ref = scripture.lookup(url.searchParams.get('q') || '');
      if (!ref) return sendJSON(res, 404, { error: 'Reference not found' });
      return sendJSON(res, 200, wireRef({ ...ref, source: 'manual' }));
    }

    if (req.method === 'POST' && url.pathname === '/api/show') {
      const body = await readBody(req);
      let ref = null;
      if (Number.isInteger(body.bookIdx) && body.bookIdx >= 0 && body.bookIdx < scripture.books.length) {
        ref = scripture.makeRef(body.bookIdx, body.chapter | 0, body.vStart | 0, body.vEnd | 0, {});
      } else {
        ref = scripture.lookup(body.label || '');
      }
      if (!ref) return sendJSON(res, 404, { error: 'Reference not found' });
      if (body.partial) ref.partial = true;
      showScripture(ref, body.version);
      return sendJSON(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/hide') {
      hideScripture();
      return sendJSON(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/clear-captions') {
      state.caption = { text: '', final: true, at: Date.now() };
      broadcast('caption', state.caption);
      return sendJSON(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const incoming = await readBody(req);
      for (const k of Object.keys(defaults)) {
        if (!(k in incoming)) continue;
        if (typeof incoming[k] === typeof defaults[k]) state.settings[k] = incoming[k];
      }
      if (!scripture.versions.includes(state.settings.version)) state.settings.version = defaults.version;
      broadcast('settings', state.settings);
      return sendJSON(res, 200, state.settings);
    }

    res.writeHead(404); res.end('Not found');
  } catch (err) {
    sendJSON(res, 400, { error: String(err.message || err) });
  }
});

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${PORT}`);
  }
  return out;
}

server.listen(PORT, () => {
  console.log('\nScripture Captions is running.');
  console.log(`  Operator page : http://localhost:${PORT}/        (open in Chrome or Edge)`);
  console.log(`  vMix overlay  : http://localhost:${PORT}/output  (add as a Web Browser input)`);
  const lan = lanUrls();
  if (lan.length) console.log(`  Other PCs     : ${lan.map((u) => u + '/output').join('  ')}`);
  console.log('\nPress Ctrl+C to stop.\n');
});
