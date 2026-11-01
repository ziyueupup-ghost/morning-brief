import { h, bt, L, lang, primary, link, webURL, fmtDay, fill } from './util.js';
import { store, config, onData, rebuild, syncBriefs, focusColumns, todaysBrief } from './data.js';
import { state, onState, syncState } from './state.js';
import { dayView, itemView, archiveView, historyView, savedView, focusView, dataView } from './views.js';
import { vocabView, annotationsView, searchView, settingsView, setupView } from './pages.js';
import { initSelection, hideToolbar, placePopover } from './annotate.js';
import { biText } from './ui.js';

const view = document.getElementById('view');

// MARK: Appearance

function applyTheme() {
  const pref = localStorage.getItem('theme') || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = pref === 'auto' ? '' : pref;
  document.documentElement.dataset.dark = dark ? '1' : '0';
}
function applyScale() {
  const s = document.documentElement.style;
  s.setProperty('--brief-scale', localStorage.getItem('briefTextScale') || 1);
  s.setProperty('--article-scale', localStorage.getItem('textScale') || 1);
}
applyTheme();
applyScale();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); render(); });
addEventListener('theme', applyTheme);
addEventListener('scale', applyScale);

// MARK: Navigation

function sidebar(route) {
  const b = todaysBrief();
  const unread = b ? [...b.top_stories, ...b.followups, ...b.academic_watch, ...b.quick_scan].filter(x => !state.current.read.includes(x.id)).length : 0;
  const nav = (href, icon, en, zh, badge) => h('a.nav' + (route === href ? '.on' : ''), { href },
    h('span.nav-icon', icon), h('span.nav-label', L(en, zh, ' ')), badge ? h('span.nav-badge', String(badge)) : null);
  const owner = (localStorage.getItem('ownerName') || '').trim();
  const cols = focusColumns();
  const side = document.getElementById('sidebar');
  fill(side, ...[
    h('div.brand', h('span.brand-mark', '晨'), h('div', h('div.brand-name', owner ? `${owner}的晨报` : '晨报'), h('div.small', 'Morning Brief'))),
    nav('#/', '🗞', 'Today', '今日晨报', unread),
    cols.map(c => nav('#/focus/' + c.id, '🎯', primary(c.title, 'english'), primary(c.title, 'chinese'))),
    store.dataItems.length ? nav('#/data', '📊', 'Data Watch', '数据观察') : null,
    nav('#/archive', '🗂', 'Archive', '归档'),
    nav('#/saved', '★', 'Saved', '收藏', state.current.saved.length || null),
    h('div.nav-group', L('Study', '学习')),
    nav('#/vocab', '📒', 'Vocabulary', '生词本', Object.values(state.current.vocab).filter(v => !v.mastered).length || null),
    nav('#/notes', '🖍', 'Notes & Q&A', '批注与问答', Object.keys(state.current.annotations).length || null),
    nav('#/search', '🔎', 'Search', '搜索'),
    h('div.nav-spacer'),
    nav('#/settings', '⚙️', 'Settings', '设置'),
  ].flat().filter(Boolean));
}

function topbar(title) {
  document.getElementById('topbar-title').textContent = title;
  const actions = document.getElementById('topbar-actions');
  fill(actions, 
    h('a.icon-btn', { href: '#/search', 'aria-label': L('Search', '搜索') }, '🔎'),
    h('button.icon-btn' + (store.syncing ? '.spin' : ''), { type: 'button', 'aria-label': L('Sync', '同步'), title: L('Sync now', '立即同步'), onclick: refresh }, '⟳'));
}

async function refresh() {
  const btn = document.querySelector('#topbar-actions button');
  btn?.classList.add('spin');
  await Promise.all([syncBriefs(), syncState()]);
  btn?.classList.remove('spin');
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query), parts: path.split('/').filter(Boolean).map(decodeURIComponent) };
}

let lastPath = null;
function render() {
  hideToolbar();
  closePopover();
  const { path, params, parts } = parseRoute();
  if (!config.ready && parts[0] !== 'setup') { location.replace('#/setup'); return; }
  const routes = {
    '': () => [dayView(), L('Today', '今日晨报')],
    day: () => [dayView(parts[1]), fmtDay(parts[1])],
    item: () => [itemView(parts[1]), ''],
    archive: () => [archiveView(), L('Archive', '归档')],
    history: () => [historyView(params), L('Read history', '已读记录')],
    saved: () => [savedView(), L('Saved', '收藏')],
    focus: () => [focusView(parts[1], params), ''],
    data: () => [dataView(), L('Data Watch', '数据观察')],
    vocab: () => [vocabView(params), L('Vocabulary', '生词本')],
    notes: () => [annotationsView(params), L('Notes & Q&A', '批注与问答')],
    search: () => [searchView(params), L('Search', '搜索')],
    settings: () => [settingsView(), L('Settings', '设置')],
    setup: () => [setupView(), L('Set up', '设置')],
  };
  const [node, title] = (routes[parts[0] || ''] || routes[''])();
  const scroll = path === lastPath ? window.scrollY : 0;
  fill(view, node);
  view.dataset.route = parts[0] || 'today';
  document.body.classList.toggle('setup-mode', parts[0] === 'setup');
  sidebar('#/' + (parts[0] === 'focus' ? 'focus/' + parts[1] : parts[0] || ''));
  topbar(title);
  if (path !== lastPath) { window.scrollTo(0, 0); closeMenu(); }
  else window.scrollTo(0, scroll);
  lastPath = path;
}

/** Re-render after data or state changes — but never while the reader is selecting or typing. */
let pendingRender = false;
function softRender() {
  const sel = getSelection();
  const typing = document.activeElement?.matches?.('input, textarea');
  const busy = (sel && !sel.isCollapsed && view.contains(sel.anchorNode)) || typing || !document.getElementById('sheet-wrap').hidden || !document.getElementById('popover').hidden;
  if (busy) { pendingRender = true; return; }
  pendingRender = false;
  render();
}
document.addEventListener('selectionchange', () => { if (pendingRender && getSelection().isCollapsed) setTimeout(softRender, 300); });
document.addEventListener('focusout', () => { if (pendingRender) setTimeout(softRender, 300); });
const sheetObserver = new MutationObserver(() => { if (pendingRender) setTimeout(softRender, 100); });
sheetObserver.observe(document.getElementById('sheet-wrap'), { attributes: true });
sheetObserver.observe(document.getElementById('popover'), { attributes: true });

addEventListener('hashchange', render);
addEventListener('rerender', softRender);
addEventListener('settings-synced', () => { applyScale(); softRender(); });
onData(softRender);
onState(softRender);

// MARK: Menu (phones)

const scrim = document.getElementById('scrim');
function closeMenu() { document.body.classList.remove('menu-open'); scrim.hidden = true; }
document.getElementById('menu-btn').addEventListener('click', () => { document.body.classList.add('menu-open'); scrim.hidden = false; });
scrim.addEventListener('click', closeMenu);

// MARK: Glossary footnotes

function closePopover() {
  const pop = document.getElementById('popover');
  pop.hidden = true;
  pop.replaceChildren();
}

document.addEventListener('click', e => {
  const a = e.target.closest('a.gloss');
  if (!a) return;
  e.preventDefault();
  const entry = store.glossary.get(a.dataset.gloss);
  if (!entry) return;
  const pop = document.getElementById('popover');
  const src = entry.source || {};
  const url = webURL(src.url);
  fill(pop, h('div.pop-body.gloss-pop',
    biText(entry.term, { tag: 'h3', mode: lang.article }),
    biText(entry.definition, { mode: lang.article }),
    entry.note ? biText(entry.note, { cls: 'small', mode: lang.article }) : null,
    src.title ? h('div.small', L('Source: ', '来源：'), url ? link(url, src.title) : src.title, src.publisher ? ' · ' + src.publisher : '') : null,
    h('div.pop-actions', h('button.btn.primary', { type: 'button', onclick: closePopover }, L('Close', '关闭')))));
  pop.hidden = false;
  placePopover(pop, a.getBoundingClientRect());
  const outside = ev => { if (!pop.contains(ev.target) && !ev.target.closest('a.gloss')) { closePopover(); document.removeEventListener('mousedown', outside, true); } };
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
});

// MARK: Start

initSelection();
await rebuild();
render();
if (config.ready) {
  refresh();
  // Briefs every 30 minutes; reading state every minute while the page is open.
  setInterval(() => { if (!document.hidden) syncBriefs(); }, 30 * 60 * 1000);
  setInterval(() => { if (!document.hidden) syncState(); }, 60 * 1000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); syncState(); return; }
    syncState();
    if (Date.now() - hiddenAt > 10 * 60 * 1000) syncBriefs();
  });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

export { bt };
