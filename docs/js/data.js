// The reader's briefs: downloaded from their (private) brief repository with their own token,
// cached in IndexedDB, and indexed for the views. Mirrors the Mac app's CloudSync + BriefRepository.

import * as gh from './gh.js';
import { bt, arr, idb, sha256, parseDate, dayKey } from './util.js';

export const config = {
  get repo() { return (localStorage.getItem('cloud.repo') || '').trim(); },
  get branch() { return localStorage.getItem('cloud.branch') || 'main'; },
  get syncRepo() { return (localStorage.getItem('sync.repo') || '').trim() || (this.repo ? this.repo + '-sync' : ''); },
  get ready() { return this.repo.split('/').length === 2 && !!gh.token(); },
};

export const store = {
  briefs: [],          // newest first
  glossary: new Map(), // id → entry
  glossaryIndex: new Map(), // normalised term/alias → id
  focusItems: [],
  dataItems: [],
  profile: null,
  items: new Map(),    // id → {kind, item, brief}
  lastSync: null,
  error: null,
  issues: [],
};

const listeners = new Set();
export function onData(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed() { for (const fn of listeners) fn(); }

let syncing = null;

/** Downloads what changed (by index.json hashes) and rebuilds the store. */
export function syncBriefs() {
  syncing ??= (async () => {
    try {
      if (!config.ready) return;
      const ref = await gh.headCommit(config.repo, config.branch);
      if (!ref) throw new Error('这个晨报仓库还是空的。The brief repository is empty.');
      const index = JSON.parse(await gh.raw(config.repo, 'index.json', ref));
      const wanted = new Set();
      const files = arr(index.files).filter(f => /^(briefs|glossary|research|data)\//.test(f.path) && f.path.endsWith('.json'));
      // A handful at a time: fast on a phone without hammering the API.
      const queue = [...files];
      const work = async () => {
        while (queue.length) {
          const f = queue.shift();
          wanted.add('repo:' + f.path);
          const cached = await idb.get('repo:' + f.path);
          if (cached?.sha256 === f.sha256) continue;
          const text = await gh.raw(config.repo, f.path, ref);
          if (await sha256(text) !== f.sha256) continue; // index and file out of step: next time
          await idb.set('repo:' + f.path, { sha256: f.sha256, text });
        }
      };
      await Promise.all([work(), work(), work(), work()]);
      for (const k of await idb.keys()) if (k.startsWith('repo:') && !wanted.has(k)) await idb.del(k);
      try {
        const profile = await gh.raw(config.repo, 'profile.json', ref);
        await idb.set('profile', profile);
      } catch (e) { if (e.status !== 404) throw e; }
      store.lastSync = new Date();
      localStorage.setItem('cloud.lastSync', store.lastSync.toISOString());
      store.error = null;
      await rebuild();
    } catch (e) {
      store.error = e.message || String(e);
      changed();
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Builds the in-memory model from the cache (also used offline / at launch). */
export async function rebuild() {
  const keys = (await idb.keys()).filter(k => k.startsWith('repo:'));
  const briefs = [], glossary = new Map(), focus = new Map(), data = new Map(), issues = [];
  for (const key of keys) {
    const path = key.slice(5);
    const rec = await idb.get(key);
    let json;
    try { json = JSON.parse(rec.text); } catch { issues.push(`${path}: not valid JSON`); continue; }
    const name = path.split('/').pop();
    if (path.startsWith('briefs/')) {
      const b = normaliseBrief(json, name);
      if (b) briefs.push(b); else issues.push(`${path}: no date`);
    } else if (path.startsWith('glossary/')) {
      for (const e of arr(json.entries ?? json)) if (e?.id && bt(e.term) && bt(e.definition)) glossary.set(e.id, e);
    } else if (path.startsWith('research/')) {
      const column = json.focus ?? focusIDFromName(name);
      for (const it of arr(json.items)) {
        if (!it?.id || !bt(it.title)) continue;
        if (!focus.has(it.id)) focus.set(it.id, { ...it, focus: it.focus ?? column });
      }
    } else if (path.startsWith('data/')) {
      for (const it of arr(json.items)) if (it?.id && !data.has(it.id)) data.set(it.id, it);
    }
  }
  briefs.sort((a, b) => b.id.localeCompare(a.id));
  for (const b of briefs) for (const it of b.research_focus) if (it?.id && !focus.has(it.id)) focus.set(it.id, it);

  const p = await idb.get('profile');
  try { store.profile = p ? JSON.parse(p) : null; } catch { store.profile = null; }

  store.briefs = briefs;
  store.glossary = glossary;
  store.glossaryIndex = new Map();
  for (const e of glossary.values()) {
    const t = bt(e.term);
    for (const s of [t.en, t.zh, ...arr(e.aliases)]) if (s) store.glossaryIndex.set(normaliseTerm(s), e.id);
  }
  store.focusItems = [...focus.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
  store.dataItems = [...data.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  store.issues = issues;
  store.items = new Map();
  // Oldest first, so the newest brief's copy of an id wins.
  for (const b of [...briefs].reverse()) {
    for (const s of b.top_stories) store.items.set(s.id, { kind: 'story', item: s, brief: b });
    for (const f of b.followups) store.items.set(f.id, { kind: 'followup', item: f, brief: b });
    for (const a of b.academic_watch) store.items.set(a.id, { kind: 'academic', item: a, brief: b });
    for (const q of b.quick_scan) store.items.set(q.id, { kind: 'quick', item: q, brief: b });
  }
  for (const f of store.focusItems) if (!store.items.has(f.id)) store.items.set(f.id, { kind: 'focus', item: f });
  for (const d of store.dataItems) if (!store.items.has(d.id)) store.items.set(d.id, { kind: 'data', item: d });
  const last = localStorage.getItem('cloud.lastSync');
  store.lastSync = last ? new Date(last) : null;
  changed();
}

function normaliseBrief(j, name) {
  const date = typeof j.date === 'string' ? j.date.slice(0, 10) : (name.match(/\d{4}-\d{2}-\d{2}/) || [])[0];
  if (!date) return null;
  const list = (k, ok = x => x?.id) => arr(j[k]).filter(ok);
  return {
    ...j,
    id: date,
    executive_brief: list('executive_brief', x => x && bt(x.text)),
    top_stories: list('top_stories', x => x?.id && bt(x.title)),
    followups: list('followups', x => x?.id && bt(x.title)),
    academic_watch: list('academic_watch', x => x?.id && bt(x.title)),
    quick_scan: list('quick_scan', x => x?.id && bt(x.headline)),
    research_focus: list('research_focus', x => x?.id && bt(x.title)),
    topics: list('topics'),
  };
}

/** "focus-phd-2026-10-11.json" → "phd"; the older "focus-2026-10-11.json" / "phd-watch-…" → null. */
function focusIDFromName(name) {
  const m = name.replace(/^cloud-/, '').match(/^focus-(.+)-\d{4}-\d{2}-\d{2}\.json$/);
  return m ? m[1] : null;
}

// Glossary: "“杰克法”" matches "杰克法".
export function normaliseTerm(s) {
  return plainMarkup(s).toLowerCase().replace(/[“”"'‘’《》「」()（）\s]/g, '');
}

function plainMarkup(s) { return s.replace(/\*\*|==|!!|\+\+|\^\^/g, ''); }

export function glossaryID(term) { return store.glossaryIndex.get(normaliseTerm(term)) ?? null; }

/** The brief for today, or the latest one before it. */
export function todaysBrief() {
  const today = dayKey();
  return store.briefs.find(b => b.id <= today) ?? store.briefs[store.briefs.length - 1] ?? null;
}

export function brief(id) { return store.briefs.find(b => b.id === id) ?? null; }

export function item(id) { return store.items.get(id) ?? null; }

export function itemTitle(id) {
  const e = item(id);
  if (!e) return null;
  return bt(e.item.title ?? e.item.headline);
}

// Profile: focus columns and region bands.
export function focusColumns() {
  const f = store.profile?.focus;
  const list = Array.isArray(f) ? f : f ? [f] : [];
  return list.filter(c => c?.id);
}

export function focusItemsIn(column) {
  const cols = focusColumns();
  const ids = new Set(cols.map(c => c.id));
  const first = cols[0]?.id;
  return store.focusItems.filter(i => (ids.has(i.focus) ? i.focus : first) === column);
}

export function themeLabel(column, theme) {
  const t = arr(column?.themes).find(x => x.id === theme);
  if (t) return bt(t.label);
  const builtIn = {
    culture: ['Culture', '文化'], migration: ['Migration', '移民过程'], service_access: ['Service access', '服务获取'],
    law_policy: ['Law & policy', '法律与政策'], prevalence: ['Prevalence & risk', '发生率与风险'], methods: ['Methods', '研究方法'],
    intersectionality: ['Intersectionality', '交叉性'], prevention: ['Prevention & intervention', '预防与干预'], other: ['Other', '其他'],
  }[theme];
  if (builtIn) return { en: builtIn[0], zh: builtIn[1] };
  const readable = String(theme).replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { en: readable, zh: null };
}

export function scopes() { return arr(store.profile?.scopes); }

export function homeRegions() {
  const s = scopes();
  const set = new Set();
  for (const sc of s) if (!sc.everything_else) for (const r of arr(sc.regions)) set.add(r.toLowerCase());
  return set;
}

export function briefTitle() {
  return bt(store.profile?.name) ?? { en: 'Morning Brief', zh: '晨报' };
}

export function sourceSorted(sources) {
  const order = ['official', 'court', 'legislation', 'government', 'police', 'academic', 'media', 'specialist', 'opinion', 'other'];
  const pri = s => s.priority ?? ((order.indexOf(s.type) + 1) || order.length);
  return arr(sources).filter(s => s?.title).sort((a, b) => pri(a) - pri(b));
}

export { parseDate };
