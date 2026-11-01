// 生词本, 批注与问答, search, settings and first-time setup.

import { h, bt, arr, L, lang, primary, fmtDay, fmtTime, link, toast, idb, fill } from './util.js';
import { store, config, item, syncBriefs, rebuild } from './data.js';
import { state, mutate, sync, syncState, settingChanged, deviceName } from './state.js';
import * as gh from './gh.js';
import { card, empty, txt, titleBlock, openSheet, closeSheet } from './ui.js';
import { openAddVocab, exportCSV } from './vocab.js';
import { color, tagLabel } from './annotate.js';
import { plain } from './rich.js';

// MARK: 生词本

export function vocabView(params) {
  const page = h('div.page');
  const filter = params.get('show') || 'learning';
  const q = (params.get('q') || '').toLowerCase();
  let list = Object.values(state.current.vocab).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const counts = { all: list.length, learning: list.filter(v => !v.mastered).length, mastered: list.filter(v => v.mastered).length };
  if (filter === 'learning') list = list.filter(v => !v.mastered);
  if (filter === 'mastered') list = list.filter(v => v.mastered);
  if (q) list = list.filter(v => [v.term, v.translation, v.note, bt(v.context)?.en, bt(v.context)?.zh].some(x => (x || '').toLowerCase().includes(q)));
  const search = h('input.search', { type: 'search', placeholder: L('Search vocabulary', '搜索生词'), value: params.get('q') || '' });
  search.addEventListener('change', () => { location.hash = `#/vocab?show=${filter}&q=${encodeURIComponent(search.value)}`; });
  page.append(
    h('h1.page-title', '📒 ' + L('Vocabulary', '生词本', '  ')),
    h('div.toolbar-row',
      h('div.seg', [['learning', 'Learning', '学习中'], ['mastered', 'Mastered', '已掌握'], ['all', 'All', '全部']].map(([k, en, zh]) =>
        h('a' + (filter === k ? '.on' : ''), { href: `#/vocab?show=${k}` }, `${L(en, zh)} ${counts[k]}`))),
      search,
      h('button.btn.primary', { type: 'button', onclick: () => openAddVocab() }, '＋ ' + L('Add word', '添加生词')),
      counts.learning ? h('button.btn', { type: 'button', onclick: () => review() }, '🃏 ' + L('Review', '复习')) : null,
      counts.all ? h('button.btn', { type: 'button', onclick: exportCSV }, '⇩ CSV') : null),
  );
  if (!list.length) {
    page.append(empty('📒', 'Select a word in any article and choose “＋生词”, or add one yourself.', '在文章里选中词语，点「＋生词」；也可以自己添加。'));
    return page;
  }
  page.append(h('div.vocab-list', list.map(v => {
    const c = bt(v.context);
    return h('div.vocab-card' + (v.mastered ? '.mastered' : ''),
      h('div.vocab-head', h('span.term', v.term), h('span.trans', v.translation || '—')),
      c ? h('div.example', h('div', c.en), c.zh && c.zh !== c.en ? h('div.sec', c.zh) : null) : null,
      v.note ? h('div.small', '✎ ' + v.note) : null,
      h('div.vocab-foot',
        v.itemID && item(v.itemID) ? h('a.small', { href: '#/item/' + encodeURIComponent(v.itemID) }, '↩ ' + (v.itemTitle || L('Source', '出处'))) : v.itemTitle ? h('span.small', v.itemTitle) : h('span'),
        h('span.vocab-btns',
          h('button.btn.sm', { type: 'button', onclick: () => mutate(s => { const x = s.vocab[v.id]; x.mastered = !x.mastered; x.updatedAt = isoNow(); }) }, v.mastered ? L('Learn again', '重新学习') : '✓ ' + L('Mastered', '已掌握')),
          h('button.btn.sm', { type: 'button', onclick: () => openAddVocab({ entry: v }) }, L('Edit', '编辑')),
          h('button.btn.sm.danger', { type: 'button', onclick: () => { if (confirm(L(`Delete “${v.term}”?`, `删除「${v.term}」？`))) mutate(s => { delete s.vocab[v.id]; }); } }, L('Delete', '删除')))));
  })));
  return page;
}

function isoNow() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function review() {
  const deck = Object.values(state.current.vocab).filter(v => !v.mastered).sort(() => Math.random() - 0.5).slice(0, 20);
  let i = 0, shown = false;
  const body = h('div.flash');
  const draw = () => {
    if (i >= deck.length) { fill(body, h('p.center', '🎉 ' + L('Done for now!', '这一轮复习完了！'))); return; }
    const v = deck[i], c = bt(v.context);
    fill(body, 
      h('div.small.center', `${i + 1} / ${deck.length}`),
      h('div.flash-term', v.term),
      shown ? h('div', h('div.flash-trans', v.translation || '—'), c ? h('div.example', h('div', c.en), c.zh ? h('div.sec', c.zh) : null) : null)
            : h('button.btn.primary.wide', { type: 'button', onclick: () => { shown = true; draw(); } }, L('Show meaning', '显示释义')),
      shown ? h('div.sheet-actions',
        h('button.btn', { type: 'button', onclick: () => grade(false) }, '✗ ' + L('Not yet', '还不会')),
        h('button.btn.primary', { type: 'button', onclick: () => grade(true) }, '✓ ' + L('Got it', '记住了'))) : null);
  };
  const grade = ok => {
    const v = deck[i];
    mutate(s => {
      const x = s.vocab[v.id];
      if (!x) return;
      x.reviews = ok ? (x.reviews || 0) + 1 : 0;
      if (x.reviews >= 3) x.mastered = true;
      x.lastReviewed = isoNow();
      x.updatedAt = isoNow();
    });
    i++; shown = false; draw();
  };
  draw();
  openSheet(L('Review', '复习'), body, [h('button.btn', { type: 'button', onclick: closeSheet }, L('Close', '关闭'))]);
}

// MARK: 批注与问答

export function annotationsView(params) {
  const page = h('div.page', h('h1.page-title', '🖍 ' + L('Notes & Q&A', '批注与问答', '  ')));
  const show = params.get('show') || 'all', tag = params.get('tag');
  let list = Object.values(state.current.annotations).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const tags = [...new Set(list.flatMap(a => a.tags || []))];
  if (show === 'comments') list = list.filter(a => a.comment);
  if (show === 'chats') list = list.filter(a => a.chat?.length);
  if (show === 'marks') list = list.filter(a => !a.comment && !a.chat?.length);
  if (tag) list = list.filter(a => (a.tags || []).includes(tag));
  page.append(h('div.seg', [['all', 'All', '全部'], ['marks', 'Marks', '标记'], ['comments', 'Comments', '评论'], ['chats', 'AI chats', 'AI 问答']].map(([k, en, zh]) =>
    h('a' + (show === k ? '.on' : ''), { href: `#/notes?show=${k}${tag ? '&tag=' + encodeURIComponent(tag) : ''}` }, L(en, zh)))));
  if (tags.length) page.append(h('div.chips', h('a.chip' + (!tag ? '.on' : ''), { href: `#/notes?show=${show}` }, L('All categories', '全部分类')),
    tags.map(t => h('a.chip' + (tag === t ? '.on' : ''), { href: `#/notes?show=${show}&tag=${encodeURIComponent(t)}` }, '🏷 ' + tagLabel(t)))));
  if (!list.length) { page.append(empty('🖍', 'Select text in an article to highlight, underline or comment.', '在文章中选中文字，就可以高亮、划线或写评论。')); return page; }
  const groups = new Map();
  for (const a of list) {
    const key = a.itemID || a.block.split('#')[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  for (const [id, marks] of groups) {
    const e = item(id);
    const title = e ? titleBlock(bt(e.item.title ?? e.item.headline), 'h3') : h('h3', marks[0].itemTitle || id);
    page.append(h('section.ann-group',
      e ? h('a.ann-title', { href: '#/item/' + encodeURIComponent(id) }, title) : title,
      marks.map(a => h('div.ann-row',
        h('blockquote', { style: markStyle(a) }, a.quote),
        a.comment ? h('div.ann-comment', '💬 ' + a.comment) : null,
        a.chat?.length ? h('details.ann-chat', h('summary', `✨ ${L('AI conversation', 'AI 对话')} · ${a.chat.length}`),
          a.chat.map(m => h('div.msg.' + (m.role === 'user' ? 'me' : 'ai'), m.text))) : null,
        (a.tags || []).length ? h('div.tags', a.tags.map(t => h('span.chip.static', '🏷 ' + tagLabel(t)))) : null,
        h('div.small', fmtDay(a.updatedAt) + ' ' + fmtTime(a.updatedAt))))));
  }
  return page;
}

function markStyle(a) {
  const s = {};
  if (a.highlight) s.background = color(a.highlight) + '55';
  if (a.underline) { s.textDecoration = `underline ${a.underline.pattern === 'wavy' ? 'wavy' : a.underline.pattern} ${color(a.underline.color)}`; }
  if (a.box) s.border = `1.5px ${a.box.pattern === 'dashed' ? 'dashed' : 'solid'} ${color(a.box.color)}`;
  if (a.textColor) s.color = color(a.textColor);
  if (a.bold) s.fontWeight = 700;
  if (a.italic) s.fontStyle = 'italic';
  return s;
}

// MARK: Search

export function searchView(params) {
  const q = (params.get('q') || '').trim();
  const input = h('input.search.big', { type: 'search', placeholder: L('Search every brief', '搜索所有晨报'), value: q, autofocus: true });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = '#/search?q=' + encodeURIComponent(input.value); });
  const page = h('div.page', h('h1.page-title', '🔎 ' + L('Search', '搜索', '  ')), input);
  if (!q) return page;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = o => JSON.stringify(o).toLowerCase();
  const hits = [];
  for (const e of store.items.values()) {
    const text = plain(hay([e.item.title, e.item.headline, e.item.summary, e.item.key_points, e.item.subtitle, e.item.categories, e.item.authors, e.item.region, e.item.new_development]));
    if (terms.every(t => text.includes(t))) hits.push(e);
  }
  hits.sort((a, b) => ((b.brief?.id || b.item.date || '') > (a.brief?.id || a.item.date || '') ? 1 : -1));
  page.append(h('p.small', L(`${hits.length} results`, `${hits.length} 条结果`)),
    hits.length ? h('div.cards', hits.slice(0, 200).map(e => card(e, { compact: true, showKind: true, image: false, date: e.brief?.id || e.item.date }))) : empty('🔎', 'Nothing matches.', '没有找到。'));
  return page;
}

// MARK: Settings

export function settingsView() {
  const page = h('div.page.settings', h('h1.page-title', '⚙️ ' + L('Settings', '设置', '  ')));
  const field = (key, label, attrs = {}, onSave) => {
    const input = h('input', { value: localStorage.getItem(key) || '', ...attrs });
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (v) localStorage.setItem(key, v); else localStorage.removeItem(key);
      onSave?.(v);
    });
    return h('label', label, input);
  };
  const choice = (key, label, options, fallback) => {
    const cur = localStorage.getItem(key) || fallback;
    return h('div.setting', h('div.pop-label', label), h('div.seg', options.map(([v, text]) =>
      h('button' + (cur === v ? '.on' : ''), { type: 'button', onclick: () => { localStorage.setItem(key, v); settingChanged(); window.dispatchEvent(new Event('rerender')); } }, text))));
  };
  const scale = (key, label) => {
    const r = h('input', { type: 'range', min: 0.8, max: 1.8, step: 0.05, value: localStorage.getItem(key) || 1 });
    r.addEventListener('input', () => { localStorage.setItem(key, r.value); window.dispatchEvent(new Event('scale')); });
    r.addEventListener('change', settingChanged);
    return h('label', label, r);
  };

  page.append(
    h('section.set-sec', h('h2', L('Reading', '阅读')),
      field('ownerName', L('Your name (masthead)', '你的名字（报头）'), { placeholder: 'ZI' }, settingChanged),
      choice('languageMode', L('Brief language', '晨报语言'), [['english', 'English'], ['chinese', '中文'], ['bilingual', '中英对照']], 'chinese'),
      choice('articleLanguageMode', L('Article language', '正文语言'), [['english', 'English'], ['chinese', '中文'], ['bilingual', '中英对照']], localStorage.getItem('languageMode') || 'chinese'),
      scale('briefTextScale', L('Brief text size', '晨报字号')),
      scale('textScale', L('Article text size', '正文字号')),
      h('div.setting', h('div.pop-label', L('Appearance', '外观')), h('div.seg', [['auto', L('Automatic', '跟随系统')], ['light', L('Light', '浅色')], ['dark', L('Dark', '深色')]].map(([v, t]) =>
        h('button' + ((localStorage.getItem('theme') || 'auto') === v ? '.on' : ''), { type: 'button', onclick: () => { localStorage.setItem('theme', v); window.dispatchEvent(new Event('theme')); window.dispatchEvent(new Event('rerender')); } }, t))))),
    institutions(),
    connection(),
    h('section.set-sec', h('h2', L('This device', '这台设备')),
      h('p.small', L('Everything is stored in this browser: your token, a copy of your briefs (for offline reading) and your reading state. Nothing is stored on any other server.',
        '所有内容都只存在这个浏览器里：令牌、晨报副本（离线也能看）和你的阅读记录。不会存到任何其他服务器。')),
      h('button.btn.danger', { type: 'button', onclick: signOut }, L('Sign out & erase this device', '退出并清除这台设备上的数据'))),
  );
  return page;
}

function institutions() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('library.institutions') || '[]'); } catch {}
  const save = () => { localStorage.setItem('library.institutions', JSON.stringify(list)); settingChanged(); };
  const box = h('div');
  const draw = () => {
    fill(box, ...list.map((inst, i) => {
      const name = h('input', { value: inst.name || '', placeholder: L('Institution name, e.g. Bond University', '机构名称，例如 Bond University') });
      const url = h('input.mono', { value: inst.link || '', placeholder: 'https://…{title}…' });
      name.addEventListener('change', () => { inst.name = name.value.trim(); save(); });
      url.addEventListener('change', () => { inst.link = url.value.trim(); save(); });
      return h('div.inst', name, url, h('button.btn.sm.danger', { type: 'button', onclick: () => { list.splice(i, 1); save(); draw(); } }, L('Remove', '删除')));
    }), h('button.btn', { type: 'button', onclick: () => { list.push({ id: crypto.randomUUID().toUpperCase(), name: '', link: '' }); draw(); } }, '＋ ' + L('Add an institution', '添加机构')));
  };
  draw();
  return h('section.set-sec', h('h2', L('Institutions & libraries', '机构与图书馆')),
    h('p.small', L('Papers without a DOI get a title search in each of these, plus Google Scholar. Search anything on your library’s website, copy the results page address and replace your search words with {title}. Sign in in your browser yourself.',
      '没有 DOI 的论文会显示按标题搜索各机构的按钮，另外还有 Google Scholar。链接：在你的图书馆网站随便搜一个词，复制结果页地址，把那个词换成 {title}。需要登录就在浏览器里自己登录。')),
    box);
}

function connection() {
  const status = h('div.small');
  const drawStatus = () => {
    const parts = [];
    parts.push(store.lastSync ? L(`Briefs synced ${fmtDay(store.lastSync)} ${fmtTime(store.lastSync)}`, `晨报同步于 ${fmtDay(store.lastSync)} ${fmtTime(store.lastSync)}`) : L('Briefs not synced yet', '晨报还没有同步'));
    if (store.error) parts.push('⚠️ ' + store.error);
    parts.push(sync.lastSync ? L(`Reading state synced ${fmtTime(sync.lastSync)}`, `阅读记录同步于 ${fmtTime(sync.lastSync)}`) : L('Reading state not synced yet', '阅读记录还没有同步'));
    if (sync.error) parts.push('⚠️ ' + sync.error);
    if (sync.devices.length) parts.push(L(`Other devices: ${sync.devices.length}`, `其他设备：${sync.devices.length} 台`));
    fill(status, ...parts.map(p => h('div', p)));
  };
  drawStatus();
  return h('section.set-sec', h('h2', L('Connection', '连接')),
    h('div.kv', h('span', L('Brief repository', '晨报仓库')), h('code', config.repo || '—')),
    h('div.kv', h('span', L('Sync repository', '同步仓库')), h('code', config.syncRepo || '—')),
    h('div.kv', h('span', L('This device', '这台设备')), h('code', `${deviceName()} · ${sync.device}`)),
    status,
    h('div.row',
      h('button.btn', { type: 'button', onclick: async () => { await syncBriefs(); await syncState(); drawStatus(); toast(L('Synced', '已同步')); } }, '⟳ ' + L('Sync now', '立即同步')),
      h('button.btn', { type: 'button', onclick: () => { location.hash = '#/setup'; } }, L('Change repository or token', '更换仓库或令牌'))));
}

async function signOut() {
  if (!confirm(L('Erase the token, the downloaded briefs and the local copy of your reading state on this device? Your other devices keep everything.',
    '清除这台设备上的令牌、已下载的晨报和阅读记录副本？其他设备上的数据不受影响。'))) return;
  await idb.clear();
  localStorage.clear();
  location.hash = '#/setup';
  location.reload();
}

// MARK: Setup

export function setupView() {
  const repo = h('input.mono', { value: localStorage.getItem('cloud.repo') || '', placeholder: 'owner/my-morning-brief', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const syncRepo = h('input.mono', { value: localStorage.getItem('sync.repo') || '', placeholder: L('owner/my-morning-brief-sync (optional)', 'owner/my-morning-brief-sync（可不填）'), autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const token = h('input.mono', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const out = h('div.small');
  const connect = async () => {
    const r = repo.value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
    if (r.split('/').length !== 2) { out.textContent = L('Enter the repository as owner/name.', '请按「用户名/仓库名」填写仓库。'); return; }
    const t = token.value.trim() || gh.token();
    if (!t) { out.textContent = L('Paste your token.', '请粘贴令牌。'); return; }
    localStorage.setItem('gh.token', t);
    localStorage.setItem('cloud.repo', r);
    const s = syncRepo.value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
    if (s) localStorage.setItem('sync.repo', s); else localStorage.removeItem('sync.repo');
    out.textContent = L('Checking…', '正在检查…');
    try {
      await gh.headCommit(r);
    } catch (e) { out.textContent = '⚠️ ' + L('Brief repository: ', '晨报仓库：') + e.message; return; }
    let syncNote = '';
    try { await gh.headCommit(config.syncRepo); }
    catch (e) { syncNote = '\n⚠️ ' + L('Sync repository: ', '同步仓库：') + e.message + ' ' + L('Reading is fine; your marks just stay on this device until it works.', '可以照常阅读，只是批注和已读暂时只保存在这台设备上。'); }
    out.textContent = L('Downloading your briefs…', '正在下载晨报…') + syncNote;
    await syncBriefs();
    if (store.error) { out.textContent = '⚠️ ' + store.error; return; }
    await syncState();
    location.hash = '#/';
  };
  return h('div.page.setup',
    h('h1.page-title', '🗞 ' + L('Set up the web version', '设置网页版', '  ')),
    h('p', L('This page reads your briefs straight from your GitHub repository. Your token is kept only in this browser and is only ever sent to GitHub.',
      '这个网页直接从你的 GitHub 仓库读取晨报。令牌只保存在这个浏览器里，只会发给 GitHub。')),
    h('div.form',
      h('label', L('Brief repository', '晨报仓库'), repo),
      h('label', L('Sync repository — your reading state, vocabulary and marks (default: brief repository + “-sync”)', '同步仓库：保存已读、生词本和批注（默认是晨报仓库名加「-sync」）'), syncRepo),
      h('label', L('GitHub token', 'GitHub 令牌'), token),
      h('details.help', h('summary', L('How do I get a token?', '怎么获取令牌？')),
        h('ol',
          h('li', L('On a computer, open ', '在电脑上打开 '), link('https://github.com/settings/personal-access-tokens/new', 'github.com → Settings → Fine-grained tokens'), '.'),
          h('li', L('Repository access: “Only select repositories” → your brief repository and your sync repository.', 'Repository access 选「Only select repositories」，勾选晨报仓库和同步仓库。')),
          h('li', L('Permissions → Contents: “Read and write”.', 'Permissions → Contents 选「Read and write」。')),
          h('li', L('Generate, copy, and paste it here. On a Mac with 晨报, Settings ▸ 网页版 can copy your existing token.', '生成后复制粘贴到这里。也可以在 Mac 的晨报 设置 ▸ 网页版 里复制现有令牌。')))),
      h('button.btn.primary.wide', { type: 'button', onclick: connect }, L('Connect', '连接')),
      out));
}

export { rebuild };
