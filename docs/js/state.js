// The reader's own state (read, saved, notes, tags, vocabulary, annotations) in the Mac app's
// UserState format, synced through a private "sync" repository: every device writes only its own
// state-<device>.json and merges the others three-way against what it last synced — the same
// scheme (and the same merge rules) as the Mac app's StateMerge.

import * as gh from './gh.js';
import { config } from './data.js';
import { canon, debounce, getJSON, setJSON, iso, idb } from './util.js';

const SETS = ['read', 'saved', 'pinned', 'favourites', 'pinnedTopics'];
const DICTS = ['topicSeenDay', 'notes', 'savedAt', 'itemTags', 'tagColors', 'readAt', 'dayNotes', 'vocab', 'annotations'];

export function emptyState() {
  const s = { tagNames: [] };
  for (const k of SETS) s[k] = [];
  for (const k of DICTS) s[k] = {};
  return s;
}

/** Any state file → the canonical shape (sets sorted, missing fields empty). */
function normalise(j) {
  const s = emptyState();
  if (!j || typeof j !== 'object') return s;
  for (const k of SETS) if (Array.isArray(j[k])) s[k] = [...new Set(j[k].filter(x => typeof x === 'string'))].sort();
  for (const k of DICTS) if (j[k] && typeof j[k] === 'object' && !Array.isArray(j[k])) s[k] = { ...j[k] };
  if (Array.isArray(j.tagNames)) s.tagNames = j.tagNames.filter(x => typeof x === 'string');
  // Entries the Mac would reject are dropped here too, so they can't be synced back.
  s.vocab = filterDict(s.vocab, v => v && typeof v.id === 'string' && typeof v.term === 'string');
  s.annotations = filterDict(s.annotations, a => a && typeof a.id === 'string' && typeof a.block === 'string'
    && Number.isInteger(a.location) && Number.isInteger(a.length) && typeof a.quote === 'string' && a.createdAt && a.updatedAt);
  s.notes = filterDict(s.notes, n => n && n.id && n.itemID && typeof n.text === 'string' && n.createdAt && n.updatedAt);
  return s;
}

function filterDict(d, ok) {
  const out = {};
  for (const [k, v] of Object.entries(d)) if (ok(v)) out[k] = v;
  return out;
}

// MARK: Three-way merge (port of StateMerge.swift)

function mergeSet(base, local, remote) {
  const b = new Set(base), l = new Set(local), r = new Set(remote);
  const out = new Set(base);
  for (const x of l) if (!b.has(x)) out.add(x);
  for (const x of r) if (!b.has(x)) out.add(x);
  for (const x of b) if (!l.has(x) || !r.has(x)) out.delete(x);
  return [...out].sort();
}

function mergeDict(base, local, remote, conflict) {
  const out = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    const b = base[k], l = local[k], r = remote[k];
    const cb = canon(b), cl = canon(l), cr = canon(r);
    let v;
    if (cl === cb) v = r;
    else if (cr === cb || cr === cl) v = l;
    else if (l !== undefined && r !== undefined) v = conflict(l, r);
    else v = l ?? r; // one side deleted, the other edited: keep the edit
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeOrdered(base, local, remote) {
  const removed = new Set([...base.filter(t => !local.includes(t)), ...base.filter(t => !remote.includes(t))]);
  const out = local.filter(t => !removed.has(t));
  for (const t of remote) if (!out.includes(t) && !removed.has(t)) out.push(t);
  return out;
}

const newer = (a, b) => ((a.updatedAt || '') >= (b.updatedAt || '') ? a : b);

export function merge(base, local, remoteIn, remoteKeys) {
  const remote = { ...remoteIn };
  // A field an older app version doesn't write wasn't deleted there: treat it as unchanged.
  for (const k of ['readAt', 'dayNotes', 'vocab', 'annotations']) if (remoteKeys && !remoteKeys.has(k)) remote[k] = base[k];
  const out = emptyState();
  for (const k of SETS) out[k] = mergeSet(base[k], local[k], remote[k]);
  out.topicSeenDay = mergeDict(base.topicSeenDay, local.topicSeenDay, remote.topicSeenDay, (l, r) => (l > r ? l : r));
  out.notes = mergeDict(base.notes, local.notes, remote.notes, newer);
  out.savedAt = mergeDict(base.savedAt, local.savedAt, remote.savedAt, l => l);
  out.itemTags = mergeDict(base.itemTags, local.itemTags, remote.itemTags, (l, r) => [...l, ...r.filter(t => !l.includes(t))]);
  out.tagColors = mergeDict(base.tagColors, local.tagColors, remote.tagColors, l => l);
  out.readAt = mergeDict(base.readAt, local.readAt, remote.readAt, (l, r) => (l < r ? l : r));
  out.dayNotes = mergeDict(base.dayNotes, local.dayNotes, remote.dayNotes, l => l);
  out.annotations = mergeDict(base.annotations, local.annotations, remote.annotations, newer);
  out.vocab = mergeDict(base.vocab, local.vocab, remote.vocab, newer);
  out.tagNames = mergeOrdered(base.tagNames, local.tagNames, remote.tagNames);
  const known = new Set(out.tagNames);
  for (const [k, v] of Object.entries(out.itemTags)) {
    const f = v.filter(t => known.has(t));
    if (f.length) out.itemTags[k] = f; else delete out.itemTags[k];
  }
  const saved = new Set(out.saved), read = new Set(out.read);
  for (const k of Object.keys(out.savedAt)) if (!saved.has(k)) delete out.savedAt[k];
  for (const k of Object.keys(out.readAt)) if (!read.has(k)) delete out.readAt[k];
  return out;
}

// MARK: Local state

export const state = { current: normalise(getJSON('state', null)) };
const listeners = new Set();
export function onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let queued = false;
function notify() {
  // After the current task, once: a change made while a page renders mustn't re-render it midway.
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; for (const fn of listeners) fn(); }, 0);
}

/** Applies a change and schedules a sync. */
export function mutate(fn) {
  const next = structuredClone(state.current);
  fn(next);
  for (const k of SETS) next[k] = [...new Set(next[k])].sort();
  if (canon(next) === canon(state.current)) return;
  state.current = next;
  setJSON('state', next);
  notify();
  scheduleSync();
}

export const is = {
  read: id => state.current.read.includes(id),
  saved: id => state.current.saved.includes(id),
};

export function setRead(id, read = true) {
  if (is.read(id) === read) return;
  mutate(s => {
    if (read) { s.read.push(id); s.readAt[id] ??= iso(); }
    else { s.read = s.read.filter(x => x !== id); delete s.readAt[id]; }
  });
}

export function toggleSaved(id) {
  mutate(s => {
    if (s.saved.includes(id)) { s.saved = s.saved.filter(x => x !== id); delete s.savedAt[id]; }
    else { s.saved.push(id); s.savedAt[id] = iso(); }
  });
}

export function setNote(itemID, text) {
  mutate(s => {
    const old = s.notes[itemID];
    if (!text.trim()) { delete s.notes[itemID]; return; }
    const now = iso();
    s.notes[itemID] = { id: old?.id ?? crypto.randomUUID().toUpperCase(), itemID, text, createdAt: old?.createdAt ?? now, updatedAt: now };
  });
}

// MARK: Sync

const device = (() => {
  let id = localStorage.getItem('sync.deviceID');
  if (!id) { id = 'web' + Math.random().toString(16).slice(2, 7); localStorage.setItem('sync.deviceID', id); }
  return id;
})();

export const sync = { status: 'idle', error: null, lastSync: getJSON('sync.last', null), devices: [], device };

function setStatus(status, error = null) {
  sync.status = status; sync.error = error;
  notify();
}

let running = null, again = false;
export const scheduleSync = debounce(() => syncState(), 2500);

export function syncState() {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      if (!config.ready || !config.syncRepo) return;
      setStatus('syncing');
      const repo = config.syncRepo;
      const ref = await gh.headCommit(repo);
      const files = ref ? await gh.list(repo, '', ref) : [];
      const mineName = `state-${device}.json`;
      // Each other device's file is merged against the copy of it merged last time, so only what
      // changed THERE since then counts as a change — a device that's been offline for a week
      // hasn't "deleted" everything added elsewhere meanwhile.
      const bases = getJSON('sync.bases', {}); // file name → that file's contents at the last merge
      const devices = [], remotes = [];
      for (const f of files) {
        if (f.type !== 'file' || !/^state-.+\.json$/.test(f.name) || f.name === mineName) continue;
        devices.push(f.name.slice(6, -5));
        const cacheKey = 'sync:' + f.name;
        let cached = await idb.get(cacheKey);
        if (cached?.sha !== f.sha) {
          const text = await gh.raw(repo, f.path, ref);
          let json;
          try { json = JSON.parse(text); } catch { continue; } // half-written: next time
          cached = { sha: f.sha, json };
          await idb.set(cacheKey, cached);
        }
        if (bases[f.name]?.sha === f.sha) continue; // unchanged since we merged it
        remotes.push({ name: f.name, sha: f.sha, json: cached.json });
      }
      const baseFor = async name => normalise((await idb.get('base:' + name)) ?? null);
      const remoteBases = await Promise.all(remotes.map(r => baseFor(r.name)));
      // No await from here to the assignment, so a change made meanwhile isn't lost.
      let merged = state.current;
      remotes.forEach((r, i) => { merged = merge(remoteBases[i], merged, normalise(r.json), new Set(Object.keys(r.json || {}))); });
      sync.devices = devices;
      if (canon(merged) !== canon(state.current)) {
        state.current = merged;
        setJSON('state', merged);
        notify();
      }
      // Write this device's copy only when it changed.
      const text = JSON.stringify(sortKeys(merged), null, 2);
      const mine = files.find(f => f.name === mineName);
      if (localStorage.getItem('sync.mineText') !== text || !mine) {
        await gh.put(repo, mineName, text, { sha: mine?.sha, message: `Sync from ${device}` });
        localStorage.setItem('sync.mineText', text);
      }
      for (const r of remotes) { await idb.set('base:' + r.name, r.json); bases[r.name] = { sha: r.sha }; }
      setJSON('sync.bases', bases);
      sync.lastSync = new Date().toISOString();
      setJSON('sync.last', sync.lastSync);
      await syncSettings(repo, ref, files);
      setStatus('ok');
    } catch (e) {
      // 409 / 422: someone else wrote first — merge again on the next round.
      setStatus('error', e.message || String(e));
    } finally {
      running = null;
      if (again) { again = false; scheduleSync(); }
    }
  })();
  return running;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

// MARK: Settings that follow the reader (newest copy wins), in settings-<device>.json.

export const SYNCED_SETTINGS = ['ownerName', 'languageMode', 'articleLanguageMode', 'textScale', 'briefTextScale',
  'citationStyle', 'library.institutions', 'cloud.repo', 'cloud.branch', 'reading.width'];

export function settingChanged() {
  localStorage.setItem('sync.settingsChangedAt', iso());
  scheduleSync();
}

async function syncSettings(repo, ref, files) {
  const mineName = `settings-${device}.json`;
  let newest = null;
  for (const f of files) {
    if (f.type !== 'file' || !/^settings-.+\.json$/.test(f.name) || f.name === mineName) continue;
    let cached = await idb.get('sync:' + f.name);
    if (cached?.sha !== f.sha) {
      try { cached = { sha: f.sha, json: JSON.parse(await gh.raw(repo, f.path, ref)) }; } catch { continue; }
      await idb.set('sync:' + f.name, cached);
    }
    const j = cached.json;
    if (j?.changedAt && j.values && (!newest || j.changedAt > newest.changedAt)) newest = j;
  }
  const mineAt = localStorage.getItem('sync.settingsChangedAt') || '1970-01-01T00:00:00Z';
  let applied = false;
  if (newest && newest.changedAt > mineAt) {
    for (const k of SYNCED_SETTINGS) {
      if (!(k in newest.values)) continue;
      const v = newest.values[k];
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      if (localStorage.getItem(k) !== s) { localStorage.setItem(k, s); applied = true; }
    }
    localStorage.setItem('sync.settingsChangedAt', newest.changedAt);
  }
  const values = {};
  for (const k of SYNCED_SETTINGS) {
    const v = localStorage.getItem(k);
    if (v == null) continue;
    values[k] = ['textScale', 'briefTextScale', 'reading.width'].includes(k) ? Number(v) : v;
  }
  // A device that never changed a setting doesn't count as newer than the others.
  const body = JSON.stringify({ changedAt: localStorage.getItem('sync.settingsChangedAt') || '1970-01-01T00:00:00Z', device: 'Web · ' + deviceName(), values }, null, 2);
  const mine = files.find(f => f.name === mineName);
  if (localStorage.getItem('sync.mineSettings') !== body || !mine) {
    await gh.put(repo, mineName, body, { sha: mine?.sha, message: `Settings from ${device}` });
    localStorage.setItem('sync.mineSettings', body);
  }
  if (applied) window.dispatchEvent(new Event('settings-synced'));
}

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Browser';
}
