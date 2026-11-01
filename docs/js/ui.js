// Shared building blocks for the views.

import { h, bt, bts, arr, L, lang, primary, fmtDay, link, webURL, doiURL, toast, fill } from './util.js';
import { annotatedLine, color } from './annotate.js';
import { render } from './rich.js';
import { state, is, setRead, toggleSaved, setNote, mutate } from './state.js';
import { sourceSorted, homeRegions } from './data.js';

/** Bilingual text. With `item`, each line can be selected and marked up. */
export function biText(t, { mode = lang.article, item, tag = 'div', cls = '', inline = false } = {}) {
  t = bt(t);
  const wrap = h(tag + '.bi' + (cls ? '.' + cls.split(' ').join('.') : ''));
  if (!t) return wrap;
  const lineTag = inline ? 'span' : 'span';
  const one = (markup, extra, pair) => {
    const el = annotatedLine(markup, { item, tag: lineTag, cls: 'line ' + extra });
    el._pair = pair;
    return el;
  };
  if (mode === 'chinese') wrap.append(one(t.zh || t.en, t.zh ? 'zh' : 'en', t.zh ? t.en : null));
  else if (mode === 'english') wrap.append(one(t.en, 'en', t.zh));
  else {
    wrap.append(one(t.en, 'en', t.zh));
    if (t.zh && t.zh !== t.en) wrap.append(one(t.zh, 'zh sec', t.en));
  }
  return wrap;
}

/** One line of plain UI text in the brief language (no marks). */
export function txt(t, mode = lang.brief) {
  t = bt(t);
  if (!t) return document.createTextNode('');
  const frag = document.createDocumentFragment();
  if (mode === 'chinese') frag.append(render(t.zh || t.en, { glossary: false }));
  else frag.append(render(t.en, { glossary: false }));
  return frag;
}

/** Brief-mode title with the translation underneath in bilingual mode. */
export function titleBlock(t, tag = 'h3', mode = lang.brief) {
  t = bt(t);
  const el = h(tag);
  if (!t) return el;
  el.append(txt(t, mode));
  if (mode === 'bilingual' && t.zh && t.zh !== t.en) el.append(h('span.sub-zh', render(t.zh, { glossary: false })));
  return el;
}

export function section(en, zh, icon, ...content) {
  const tint = typeof content[0] === 'string' ? content.shift() : null;
  return h('section.detail-sec', tint ? { style: { '--tint': `var(--${tint})` } } : null,
    h('h2', h('span.sec-icon', icon), L(en, zh, '  ', lang.article)),
    ...content);
}

export function bulletList(items, { item, symbol = '•', cls = '' } = {}) {
  return h('ul.bullets' + (cls ? '.' + cls : ''), bts(items).map(t => h('li', h('span.dot', symbol), biText(t, { item }))));
}

const IMP = {
  critical: ['Critical', '重大', 'red', '🔴'], important: ['Important', '重要', 'orange', '🟠'],
  watching: ['Worth Watching', '值得关注', 'yellow', '🟡'], background: ['Background', '背景', 'gray', '⚪'],
};
export function importance(level) { return IMP[level] || IMP.background; }

export function importanceBadge(level, mode = lang.brief) {
  const [en, zh, tint] = importance(level);
  return h('span.badge', { style: { '--tint': `var(--${tint})` } }, L(en, zh, ' ', mode));
}

export function chip(text, cls = '') { return h('span.chip.static' + (cls ? '.' + cls : ''), text); }

export function regionChip(region) {
  if (!region) return null;
  const home = homeRegions();
  const intl = home.size && !home.has(String(region).toLowerCase());
  return chip((intl ? '🌏 ' : '📍 ') + region, intl ? 'intl' : '');
}

export function tagsRow(region, categories = []) {
  return h('div.tags', regionChip(region), arr(categories).map(c => chip(c)));
}

/** A row of items for lists on the brief and archive pages. */
export function card(entry, opts = {}) {
  const { kind, item: it } = entry;
  const title = bt(it.title ?? it.headline);
  const summary = bt(it.summary ?? it.new_development);
  const level = it.importance ?? 'watching';
  const read = is.read(it.id);
  const href = '#/item/' + encodeURIComponent(it.id);
  const img = opts.image !== false ? webURL(it.image_url) : null;
  const kinds = {
    story: ['Story', '要闻'], followup: ['Follow-up', '跟进'], academic: ['Academic', '学术'],
    quick: ['Quick scan', '快讯'], focus: ['Focus', '专栏'], data: ['Data', '数据'],
  };
  return h('a.card' + (read ? '.read' : '') + (opts.compact ? '.compact' : ''), { href },
    img ? h('img.card-img', { src: img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() }) : null,
    h('div.card-body',
      h('div.card-meta',
        h('span.imp-dot', { style: { background: `var(--${importance(level)[2]})` } }),
        opts.showKind ? h('span', L(...kinds[kind], ' ')) : null,
        it.region ? h('span', it.region) : null,
        opts.date ? h('span', fmtDay(opts.date, lang.brief, { year: false })) : null,
        is.saved(it.id) ? h('span.saved-star', '★') : null,
        read ? h('span.read-mark', L('Read', '已读')) : null),
      titleBlock(title),
      summary && !opts.compact ? h('p.card-sum', txt(summary)) : null));
}

export function sourcesBlock(sources) {
  const list = sourceSorted(sources);
  if (!list.length) return null;
  const typeLabel = {
    official: ['Official document', '官方文件'], court: ['Court', '法院'], legislation: ['Legislation', '立法'],
    government: ['Government', '政府'], police: ['Police', '警方'], academic: ['Academic', '学术'], media: ['Media', '媒体'],
    specialist: ['Specialist commentary', '专业评论'], opinion: ['Opinion', '观点'], other: ['Other', '其他'],
  };
  return section('Sources', '来源', '🔗', h('ol.sources', list.map(s => {
    const url = webURL(s.url);
    const t = typeLabel[s.type] || typeLabel.other;
    return h('li', url ? link(url, s.title) : h('span', s.title),
      h('div.src-meta', [s.publisher, L(t[0], t[1], ' ', lang.article), s.publication_date ? fmtDay(s.publication_date, lang.article) : null].filter(Boolean).join(' · ')));
  })));
}

// MARK: Item actions — read, save, note, tags

export function actionsBar(id, { title, url, citation } = {}) {
  const bar = h('div.actions');
  const draw = () => {
    fill(bar, 
      h('button.btn' + (is.read(id) ? '.on' : ''), { type: 'button', onclick: () => { setRead(id, !is.read(id)); draw(); } }, is.read(id) ? '✓ ' + L('Read', '已读') : L('Mark read', '标为已读')),
      h('button.btn' + (is.saved(id) ? '.on' : ''), { type: 'button', onclick: () => { toggleSaved(id); draw(); } }, is.saved(id) ? '★ ' + L('Saved', '已收藏') : '☆ ' + L('Save', '收藏')),
      h('button.btn', { type: 'button', onclick: () => { noteBox.hidden = false; noteBox.querySelector('textarea').focus(); } }, '✎ ' + L('Note', '笔记')),
      h('button.btn', { type: 'button', onclick: () => openTags(id) }, '🏷 ' + L('Tags', '标签')),
      citation ? h('button.btn', { type: 'button', onclick: () => { navigator.clipboard?.writeText(citation); toast(L('Citation copied', '引用已复制')); } }, '❝ ' + L('Copy citation', '复制引用')) : null,
      url ? link(url, h('span.btn', '↗ ' + L('Original', '原文'))) : null,
    );
  };
  draw();
  const note = state.current.notes[id];
  const ta = h('textarea', { rows: 4, placeholder: L('Your note on this item…', '关于这条的笔记…') });
  ta.value = note?.text || '';
  ta.addEventListener('change', () => setNote(id, ta.value));
  ta.addEventListener('blur', () => setNote(id, ta.value));
  const noteBox = h('div.note-box', h('div.pop-label', L('My note', '我的笔记')), ta);
  noteBox.hidden = !note;
  const tags = (state.current.itemTags[id] || []);
  return h('div', bar, tags.length ? h('div.tags', tags.map(t => tagChip(t))) : null, noteBox);
}

export function tagChip(name) {
  const c = state.current.tagColors[name];
  return h('span.chip.static.user-tag', { style: c ? { '--tint': color(c) } : null }, '🏷 ' + name);
}

function openTags(id) {
  const body = h('div.form');
  const draw = () => {
    const on = new Set(state.current.itemTags[id] || []);
    const input = h('input', { placeholder: L('New tag…', '新标签…'), enterkeyhint: 'done' });
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const t = input.value.trim();
      mutate(s => { if (!s.tagNames.includes(t)) s.tagNames.push(t); s.itemTags[id] = [...new Set([...(s.itemTags[id] || []), t])]; });
      draw();
    });
    fill(body, 
      h('div.chips', state.current.tagNames.map(t => h('button.chip' + (on.has(t) ? '.on' : ''), {
        type: 'button', onclick: () => {
          mutate(s => {
            const cur = new Set(s.itemTags[id] || []);
            cur.has(t) ? cur.delete(t) : cur.add(t);
            if (cur.size) s.itemTags[id] = [...cur]; else delete s.itemTags[id];
          });
          draw();
        },
      }, t))),
      input);
  };
  draw();
  openSheet(L('Tags', '标签'), body, [h('button.btn.primary', { type: 'button', onclick: () => { closeSheet(); window.dispatchEvent(new Event('rerender')); } }, L('Done', '完成'))]);
}

// MARK: Sheets

export function openSheet(title, content, actions = []) {
  const wrap = document.getElementById('sheet-wrap'), sheet = document.getElementById('sheet');
  fill(sheet, h('h2.sheet-title', title), content, actions.length ? h('div.sheet-actions', actions) : null);
  wrap.hidden = false;
  wrap.onclick = e => { if (e.target === wrap) closeSheet(); };
  document.addEventListener('keydown', escClose);
}

function escClose(e) { if (e.key === 'Escape') closeSheet(); }

export function closeSheet() {
  document.getElementById('sheet-wrap').hidden = true;
  document.getElementById('sheet').replaceChildren();
  document.removeEventListener('keydown', escClose);
}

export function empty(icon, en, zh, extra) {
  return h('div.empty', h('div.empty-icon', icon), h('p', L(en, zh, '\n')), extra || null);
}

export function linkOrNull(url, label) { const u = webURL(url); return u ? link(u, label) : null; }
export { doiURL, primary };
