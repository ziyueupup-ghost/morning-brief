// Small shared helpers: bilingual text, dates, DOM building, storage.

/** Bilingual text from brief JSON: "text", {en, zh}, or a list of either (joined). */
export function bt(x) {
  if (x == null) return null;
  if (typeof x === 'string') return { en: x, zh: null };
  if (Array.isArray(x)) {
    const parts = x.map(bt).filter(Boolean);
    if (!parts.length) return null;
    const zh = parts.map(p => p.zh).filter(Boolean);
    return { en: parts.map(p => p.en).join(' '), zh: zh.length ? zh.join('') : null };
  }
  if (typeof x === 'object') {
    const en = typeof x.en === 'string' ? x.en : null, zh = typeof x.zh === 'string' && x.zh ? x.zh : null;
    if (en == null && zh == null) return null;
    return { en: en ?? zh, zh };
  }
  return { en: String(x), zh: null };
}

/** A list field that may be missing, null, one value or a list. */
export function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
export function bts(x) { return arr(x).map(bt).filter(Boolean); }

// Language modes, as in the Mac app: "english", "chinese", "bilingual".
export const lang = {
  get brief() { return localStorage.getItem('languageMode') || 'chinese'; },
  get article() { return localStorage.getItem('articleLanguageMode') || this.brief; },
};

/** UI string for the brief language. */
export function L(en, zh, sep = ' · ', mode = lang.brief) {
  if (mode === 'english') return en;
  if (mode === 'chinese') return zh;
  return en === zh ? en : en + sep + zh;
}

/** One line for tight spaces. */
export function primary(t, mode = lang.brief) {
  t = bt(t);
  if (!t) return '';
  return mode === 'chinese' ? (t.zh || t.en) : t.en;
}

// Dates. Brief days are "YYYY-MM-DD" in the reader's own time zone.
export function dayKey(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function parseDate(s) {
  if (!s || typeof s !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  if (/^\d{4}-\d{2}$/.test(s)) { const [y, m] = s.split('-').map(Number); return new Date(y, m - 1, 1); }
  if (/^\d{4}$/.test(s)) return new Date(Number(s), 0, 1);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** ISO 8601 without fractional seconds — the only form the Mac app's decoder accepts. */
export function iso(d = new Date()) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

export function fmtDay(d, mode = lang.brief, opts = {}) {
  d = d instanceof Date ? d : parseDate(d);
  if (!d) return '';
  const zh = mode === 'chinese';
  const o = { year: opts.year === false ? undefined : 'numeric', month: zh ? 'long' : 'short', day: 'numeric', ...(opts.weekday ? { weekday: zh ? 'short' : 'long' } : {}) };
  return d.toLocaleDateString(zh ? 'zh-CN' : 'en-AU', o);
}

export function fmtTime(d) {
  d = d instanceof Date ? d : parseDate(d);
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export function daysUntil(d) {
  d = d instanceof Date ? d : parseDate(d);
  if (!d) return null;
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

export function relDays(d) {
  const n = daysUntil(d);
  if (n == null) return '';
  if (n === 0) return L('today', '今天');
  if (n === 1) return L('tomorrow', '明天');
  if (n === -1) return L('yesterday', '昨天');
  return n > 0 ? L(`in ${n} days`, `${n} 天后`) : L(`${-n} days ago`, `${-n} 天前`);
}

/** Only http(s) links are opened. */
export function webURL(s) {
  if (!s || typeof s !== 'string') return null;
  try { const u = new URL(s.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

export function doiURL(doi) {
  if (!doi) return null;
  return webURL(doi.startsWith('http') ? doi : `https://doi.org/${doi}`);
}

// DOM
/** h('div.card', {onclick}, child, …) — tiny element builder. */
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Replaces an element's children; null / false entries are skipped and arrays flattened. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export function link(href, ...children) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, ...children);
}

/** 64-bit FNV-1a in base 36 — the Mac app's TextAnchor block key, so marks match across devices. */
export function fnv36(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
  for (const b of new TextEncoder().encode(text)) hash = ((hash ^ BigInt(b)) * prime) & mask;
  return hash.toString(36);
}

export function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  })).toUpperCase();
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function getJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function setJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

/** Stable JSON (sorted keys) for comparing values. */
export function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}

// IndexedDB: a cache of downloaded repo files and remote sync files, so reading works offline.
let dbp;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('morning-brief', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

export const idb = {
  async get(key) {
    const d = await db();
    return new Promise(res => { const r = d.transaction('files').objectStore('files').get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
  },
  async set(key, value) {
    const d = await db();
    return new Promise(res => { const t = d.transaction('files', 'readwrite'); t.objectStore('files').put(value, key); t.oncomplete = t.onerror = () => res(); });
  },
  async del(key) {
    const d = await db();
    return new Promise(res => { const t = d.transaction('files', 'readwrite'); t.objectStore('files').delete(key); t.oncomplete = t.onerror = () => res(); });
  },
  async keys() {
    const d = await db();
    return new Promise(res => { const r = d.transaction('files').objectStore('files').getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
  },
  async clear() {
    const d = await db();
    return new Promise(res => { const t = d.transaction('files', 'readwrite'); t.objectStore('files').clear(); t.oncomplete = t.onerror = () => res(); });
  },
};

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, ms);
}
