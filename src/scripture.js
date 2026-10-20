'use strict';
/*
 * Scripture engine: loads Bible text, parses spoken references ("John three sixteen",
 * "first Corinthians thirteen verses four to seven") and finds likely verses for
 * paraphrased quotes using BM25 over all versions. No dependencies.
 */
const fs = require('fs');
const path = require('path');

const VERSION_ORDER = ['WEB', 'KJV', 'ASV', 'BBE', 'YLT', 'Darby'];
const VERSION_LABELS = {
  WEB: 'World English Bible',
  KJV: 'King James Version',
  ASV: 'American Standard Version',
  BBE: 'Bible in Basic English',
  YLT: "Young's Literal Translation",
  Darby: 'Darby Translation',
};

// ---------------------------------------------------------------- data
function load(dataPath) {
  const raw = JSON.parse(fs.readFileSync(dataPath || path.join(__dirname, '..', 'data', 'bible.json'), 'utf8'));
  const versions = Object.keys(raw.versions).sort((a, b) => VERSION_ORDER.indexOf(a) - VERSION_ORDER.indexOf(b));
  return { books: raw.books, versions, text: raw.versions };
}

// ---------------------------------------------------------------- book aliases
const ALIASES = {
  Genesis: ['genesis', 'gen'],
  Exodus: ['exodus', 'exo'],
  Leviticus: ['leviticus', 'lev'],
  Numbers: ['numbers', 'num'],
  Deuteronomy: ['deuteronomy', 'deut'],
  Joshua: ['joshua'],
  Judges: ['judges'],
  Ruth: ['ruth'],
  '1 Samuel': ['1 samuel', '1 sam'],
  '2 Samuel': ['2 samuel', '2 sam'],
  '1 Kings': ['1 kings'],
  '2 Kings': ['2 kings'],
  '1 Chronicles': ['1 chronicles', '1 chron'],
  '2 Chronicles': ['2 chronicles', '2 chron'],
  Ezra: ['ezra'],
  Nehemiah: ['nehemiah'],
  Esther: ['esther'],
  Job: ['job'],
  Psalms: ['psalms', 'psalm', 'psalter'],
  Proverbs: ['proverbs', 'proverb', 'prov'],
  Ecclesiastes: ['ecclesiastes'],
  'Song of Solomon': ['song of solomon', 'song of songs', 'songs of solomon', 'song of song'],
  Isaiah: ['isaiah'],
  Jeremiah: ['jeremiah'],
  Lamentations: ['lamentations'],
  Ezekiel: ['ezekiel'],
  Daniel: ['daniel'],
  Hosea: ['hosea'],
  Joel: ['joel'],
  Amos: ['amos'],
  Obadiah: ['obadiah'],
  Jonah: ['jonah'],
  Micah: ['micah'],
  Nahum: ['nahum'],
  Habakkuk: ['habakkuk'],
  Zephaniah: ['zephaniah'],
  Haggai: ['haggai'],
  Zechariah: ['zechariah'],
  Malachi: ['malachi'],
  Matthew: ['matthew', 'matt'],
  Mark: ['mark'],
  Luke: ['luke'],
  John: ['john'],
  Acts: ['acts', 'acts of the apostles'],
  Romans: ['romans', 'rom'],
  '1 Corinthians': ['1 corinthians', '1 cor'],
  '2 Corinthians': ['2 corinthians', '2 cor'],
  Galatians: ['galatians'],
  Ephesians: ['ephesians'],
  Philippians: ['philippians'],
  Colossians: ['colossians'],
  '1 Thessalonians': ['1 thessalonians'],
  '2 Thessalonians': ['2 thessalonians'],
  '1 Timothy': ['1 timothy'],
  '2 Timothy': ['2 timothy'],
  Titus: ['titus'],
  Philemon: ['philemon'],
  Hebrews: ['hebrews'],
  James: ['james'],
  '1 Peter': ['1 peter'],
  '2 Peter': ['2 peter'],
  '1 John': ['1 john'],
  '2 John': ['2 john'],
  '3 John': ['3 john'],
  Jude: ['jude'],
  Revelation: ['revelation', 'revelations'],
};

// ---------------------------------------------------------------- number words
const ONES = Object.assign(Object.create(null), {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
});
const TENS = Object.assign(Object.create(null), { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });

// parse a run of number words starting at i; returns [value, nextIndex] or null
function parseNumber(tokens, i) {
  let j = i;
  let value = 0;
  let took = false;
  const t = (k) => tokens[k];
  // "[a|one] hundred [and] ..."
  if ((t(j) === 'a' || t(j) in ONES) && t(j + 1) === 'hundred') {
    value = (t(j) === 'a' ? 1 : ONES[t(j)]) * 100;
    j += 2;
    took = true;
    if (t(j) === 'and') j += 1;
  } else if (t(j) === 'hundred') {
    value = 100; j += 1; took = true;
    if (t(j) === 'and') j += 1;
  }
  if (t(j) in TENS) {
    value += TENS[t(j)]; j += 1; took = true;
    if (t(j) in ONES && ONES[t(j)] >= 1 && ONES[t(j)] <= 9) { value += ONES[t(j)]; j += 1; }
  } else if (t(j) in ONES) {
    // only take a lone ones/teens word if we have not consumed a "hundred" prefix without remainder
    value += ONES[t(j)]; j += 1; took = true;
  }
  return took ? [value, j] : null;
}

const ORDINALS = Object.assign(Object.create(null), { first: '1', second: '2', third: '3', '1st': '1', '2nd': '2', '3rd': '3', i: '1', ii: '2', iii: '3' });
const NUMBERED_BOOK_WORDS = new Set([
  'samuel', 'kings', 'chronicles', 'corinthians', 'thessalonians', 'timothy', 'peter', 'john',
]);

// Normalise spoken text: lowercase, number words -> digits, ordinals before numbered books.
function normalise(text) {
  const cleaned = String(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/(\d)\s*:\s*(\d)/g, '$1 : $2')
    .replace(/[^a-z0-9:\-–' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i];
    // numbered books: "first john", "i corinthians", "one john" handled after number conversion
    if (tok in ORDINALS && NUMBERED_BOOK_WORDS.has(tokens[i + 1])) {
      out.push(ORDINALS[tok]); i += 1; continue;
    }
    const num = parseNumber(tokens, i);
    // a bare "a"/"and" must never be converted
    if (num && tok !== 'and' && tok !== 'a') {
      out.push(String(num[0])); i = num[1]; continue;
    }
    if (tok === 'a' && num) { out.push(String(num[0])); i = num[1]; continue; }
    out.push(tok); i += 1;
  }
  return out.join(' ');
}

// ---------------------------------------------------------------- reference regex
function buildRefRegex() {
  const all = [];
  for (const [book, list] of Object.entries(ALIASES)) for (const a of list) all.push([a, book]);
  all.sort((a, b) => b[0].length - a[0].length);
  const map = new Map(all.map(([a, b]) => [a, b]));
  const alt = all.map(([a]) => a.replace(/ /g, '\\s+')).join('|');
  const re = new RegExp(
    '(?:^|\\s)(' + alt + ')\\s+(?:chapter\\s+)?(\\d{1,3})' +
      '(?:\\s*(?::|\\bverses?\\b|\\bvs\\b|\\band verses?\\b)\\s*(\\d{1,3})' +
      '(?:\\s*(?:-|\\u2013|\\bto\\b|\\bthrough\\b|\\bthru\\b)\\s*(\\d{1,3}))?' +
      '|\\s+(\\d{1,3})(?:\\s*(?:-|\\u2013|\\bto\\b|\\bthrough\\b|\\bthru\\b)\\s*(\\d{1,3}))?)?',
    'g'
  );
  return { re, map };
}

const MAX_VERSES = 12;

// Words that differ between translations (or in everyday speech) but mean the same thing.
const SYNONYMS = Object.assign(Object.create(null), {
  yahweh: 'lord', jehovah: 'lord', jah: 'lord',
  lack: 'want', need: 'want',
  begotten: 'only', born: 'only',
  perish: 'die', destruction: 'die',
  everlast: 'eternal', forever: 'eternal',
  whosoever: 'whoever', whoso: 'whoever',
});

class Scripture {
  constructor(dataPath) {
    const d = load(dataPath);
    this.books = d.books;
    this.versions = d.versions;
    this.text = d.text;
    this.refRe = buildRefRegex();
    this.sessions = new Map();
    this._buildIndex();
  }

  // ------------------------------------------------------------ references
  verseCount(b, c) { return (this.text.KJV[b][c - 1] || []).length; }
  chapterCount(b) { return this.text.KJV[b].length; }

  makeRef(bookIdx, chapter, vStart, vEnd, extra) {
    const chapters = this.chapterCount(bookIdx);
    if (chapter < 1 || chapter > chapters) return null;
    const max = this.verseCount(bookIdx, chapter);
    let partial = false;
    let wholeChapter = false;
    if (!vStart) { vStart = 1; vEnd = Math.min(max, 5); partial = max > 5; wholeChapter = true; }
    if (!vEnd || vEnd < vStart) vEnd = vStart;
    if (vStart > max) return null;
    if (vEnd > max) vEnd = max;
    if (vEnd - vStart + 1 > MAX_VERSES) { vEnd = vStart + MAX_VERSES - 1; partial = true; }
    const book = this.books[bookIdx];
    const shownBook = book === 'Psalms' ? 'Psalm' : book;
    const label = `${shownBook} ${chapter}:${vStart}` + (vEnd > vStart ? `–${vEnd}` : '');
    const verses = {};
    for (const v of this.versions) {
      const arr = this.text[v][bookIdx][chapter - 1] || [];
      const list = [];
      for (let n = vStart; n <= vEnd; n++) if (arr[n - 1]) list.push({ n, text: arr[n - 1] });
      verses[v] = list;
    }
    return { book, bookIdx, chapter, vStart, vEnd, label, partial, wholeChapter, verses, ...extra };
  }

  // Find explicit references inside spoken/typed text.
  findReferences(text, sessionId) {
    const norm = normalise(text);
    const found = [];
    const { re, map } = this.refRe;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(norm))) {
      const alias = m[1].replace(/\s+/g, ' ');
      const bookName = map.get(alias);
      if (!bookName) continue;
      const bookIdx = this.books.indexOf(bookName);
      let chapter = parseInt(m[2], 10);
      let vStart = null;
      let vEnd = null;
      if (m[3]) { vStart = parseInt(m[3], 10); vEnd = m[4] ? parseInt(m[4], 10) : null; }
      else if (m[5]) { vStart = parseInt(m[5], 10); vEnd = m[6] ? parseInt(m[6], 10) : null; }
      // single-chapter books: "Jude 5" means verse 5
      if (this.chapterCount(bookIdx) === 1 && vStart == null && chapter > 1) {
        vStart = chapter; chapter = 1;
      }
      const ref = this.makeRef(bookIdx, chapter, vStart, vEnd, { source: 'reference', confidence: 0.99, spoken: m[0].trim() });
      if (ref) found.push(ref);
    }
    // "verse 16" with no book -> reuse the last chapter mentioned in this session
    if (!found.length && sessionId) {
      const s = this.sessions.get(sessionId);
      const vm = /(?:^|\s)verses?\s+(\d{1,3})(?:\s*(?:-|–|to|through|thru)\s*(\d{1,3}))?/.exec(norm);
      if (s && s.lastRef && Date.now() - s.lastRef.at < 180000 && vm) {
        const ref = this.makeRef(s.lastRef.bookIdx, s.lastRef.chapter, parseInt(vm[1], 10), vm[2] ? parseInt(vm[2], 10) : null,
          { source: 'reference', confidence: 0.9, spoken: vm[0].trim(), carried: true });
        if (ref) found.push(ref);
      }
    }
    if (sessionId && found.length) {
      const last = found[found.length - 1];
      this.sessions.set(sessionId, { lastRef: { bookIdx: last.bookIdx, chapter: last.chapter, at: Date.now() } });
    }
    return found;
  }

  // Manual lookup from the operator box: "John 3:16", "ps 23", "romans 8 28 to 30"
  lookup(query) {
    const refs = this.findReferences(String(query).replace(/(\d+)\s*:\s*(\d+)/g, '$1 : $2'));
    return refs[0] || null;
  }

  // ------------------------------------------------------------ paraphrase index
  _buildIndex() {
    const STOP = new Set(('a an the and or but if of to in on at by for with from as is are was were be been being am do does did ' +
      'he she it they them his her its their him we us our you your i me my this that these those there here then than so ' +
      'not no nor will shall would should could can may might must have has had also which who whom whose what when where ' +
      'unto upon into out up down over very just now said says say saying saith yea thou thee thy thine ye').split(' '));
    this.stop = STOP;
    const nB = this.books.length;
    this.docs = [];           // {b,c,v}
    this.vTokens = [];        // per doc: {Version: Set(stem)}
    this.df = new Map();
    const postings = new Map();
    for (let b = 0; b < nB; b++) {
      const chapters = this.text.KJV[b];
      for (let c = 0; c < chapters.length; c++) {
        for (let v = 0; v < chapters[c].length; v++) {
          const perVersion = {};
          const union = new Map();
          for (const ver of this.versions) {
            const t = (this.text[ver][b][c] || [])[v];
            if (!t) continue;
            const set = new Set(this.tokenise(t, true));
            perVersion[ver] = set;
            const folded = new Set([...set].map((w) => SYNONYMS[w] || w));
            for (const s of folded) union.set(s, (union.get(s) || 0) + 1);
          }
          const id = this.docs.length;
          this.docs.push({ b, c: c + 1, v: v + 1 });
          this.vTokens.push(perVersion);
          let len = 0;
          for (const [s, n] of union) {
            // a term present in several versions counts a little more, but is capped
            const tf = Math.min(2, 1 + (n - 1) * 0.25);
            len += tf;
            if (!postings.has(s)) postings.set(s, []);
            postings.get(s).push([id, tf]);
            this.df.set(s, (this.df.get(s) || 0) + 1);
          }
          this.docs[id].len = len;
        }
      }
    }
    this.postings = postings;
    this.N = this.docs.length;
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / this.N;
  }

  stem(w) {
    if (w.length > 5 && w.endsWith('eth')) w = w.slice(0, -3);
    else if (w.length > 5 && w.endsWith('est')) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
    else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
    return w;
  }

  // raw=true keeps each translation's own wording (no synonym folding); used to pick the best version.
  tokenise(text, raw) {
    const toks = String(text).toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/)
      .map((w) => w.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
      .filter((w) => w.length > 1 && !this.stop.has(w))
      .map((w) => this.stem(w));
    return raw ? toks : toks.map((w) => SYNONYMS[w] || w);
  }

  idf(term) {
    const n = this.df.get(term) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }

  // Suggest verses for a paraphrase / loose quote.
  suggest(text, opts = {}) {
    const cue = !!opts.cue;
    const limit = opts.limit || 3;
    const qTokens = [...new Set(this.tokenise(text))].filter((t) => this.postings.has(t));
    if (qTokens.length < (cue ? 3 : 4)) return [];
    const qRaw = [...new Set(this.tokenise(text, true))].filter((t) => this.postings.has(SYNONYMS[t] || t));
    const k1 = 1.2, b = 0.6;
    const scores = new Map();
    for (const t of qTokens) {
      const idf = this.idf(t);
      for (const [id, tf] of this.postings.get(t)) {
        const d = this.docs[id];
        const s = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * d.len / this.avgLen));
        scores.set(id, (scores.get(id) || 0) + s);
      }
    }
    const top = [...scores.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12);
    const w = (t) => this.idf(SYNONYMS[t] || t);
    const qMass = qRaw.reduce((a, t) => a + w(t), 0);
    const results = [];
    for (const [id] of top) {
      // coverage per version: share of query idf mass found in that version's wording
      let best = null;
      const perVersion = {};
      for (const ver of this.versions) {
        const set = this.vTokens[id][ver];
        if (!set) continue;
        let hit = 0, hitN = 0;
        let folded = null;
        for (const t of qRaw) {
          if (set.has(t)) { hit += w(t); hitN += 1; continue; }
          // same meaning, different wording in this translation (Yahweh/LORD, lack/want): partial credit
          if (!folded) folded = new Set([...set].map((x) => SYNONYMS[x] || x));
          if (folded.has(SYNONYMS[t] || t)) { hit += 0.6 * w(t); hitN += 0.6; }
        }
        perVersion[ver] = hit / qMass;
        if (!best || perVersion[ver] > best.cov + 1e-9) best = { ver, cov: perVersion[ver], hitN };
      }
      // also reward verses whose own wording is mostly explained by the query (precision)
      const verSet = this.vTokens[id][best.ver];
      const precision = verSet && verSet.size ? Math.min(1, best.hitN / verSet.size) : 0;
      const confidence = Math.min(0.97, 0.75 * best.cov + 0.25 * precision * (best.cov > 0.4 ? 1 : 0.5));
      const d = this.docs[id];
      results.push({ d, best, confidence, perVersion });
    }
    results.sort((x, y) => y.confidence - x.confidence);
    const threshold = cue ? 0.38 : 0.52;
    const out = [];
    const seen = new Set();
    for (const r of results) {
      if (r.confidence < threshold || out.length >= limit) continue;
      const key = `${r.d.b}:${r.d.c}:${r.d.v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ref = this.makeRef(r.d.b, r.d.c, r.d.v, r.d.v, {
        source: 'paraphrase',
        confidence: Number(r.confidence.toFixed(2)),
        bestVersion: r.best.ver,
        versionScores: Object.fromEntries(Object.entries(r.perVersion).map(([k, v]) => [k, Number(v.toFixed(2))])),
      });
      if (ref) out.push(ref);
    }
    return out;
  }

  // Does the text sound like the speaker is quoting scripture?
  static hasCue(text) {
    return /\b(the (bible|word|scripture|scriptures|lord) (says|said|tells|declares|reminds)|it is written|it'?s written|scripture says|the bible says|god'?s word says|jesus (said|says|told)|paul (said|writes|wrote|says)|the psalmist|as (the )?(scripture|bible|word)|for it is written|thus saith|the lord said|the book of|verse)\b/i.test(text);
  }

  // Main entry: explicit references first, paraphrase search when none and the text is long enough.
  detect(text, { sessionId, final = true } = {}) {
    const refs = this.findReferences(text, sessionId);
    let suggestions = [];
    if (!refs.length && final) {
      const cue = Scripture.hasCue(text);
      suggestions = this.suggest(text, { cue });
    }
    return { references: refs, suggestions };
  }
}

module.exports = { Scripture, normalise, VERSION_LABELS, VERSION_ORDER };
