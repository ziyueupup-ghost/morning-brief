// Marks on brief text — highlight, underline, box, bold, italic, colour, comment, categories —
// stored in the shared UserState.annotations exactly as the Mac app stores them: per text block
// (item id + FNV-1a of the markup), with a UTF-16 range and the quoted text.

import { h, fnv36, uuid, iso, getJSON, setJSON, toast, L, bt, fill } from './util.js';
import { state, mutate } from './state.js';
import { render } from './rich.js';
import { openAddVocab } from './vocab.js';

export const COLORS = {
  yellow: '#ffcc00', green: '#34c759', blue: '#007aff', pink: '#ff2d55', purple: '#af52de', orange: '#ff9500',
  red: '#ff3b30', teal: '#30b0c7', gray: '#8e8e93', brown: '#a2845e', mint: '#00c7be', indigo: '#5856d6',
};
const DARK = {
  yellow: '#ffd60a', green: '#30d158', blue: '#0a84ff', pink: '#ff375f', purple: '#bf5af2', orange: '#ff9f0a',
  red: '#ff453a', teal: '#40c8e0', gray: '#98989d', brown: '#ac8e68', mint: '#63e6e2', indigo: '#5e5ce6',
};
export const PALETTE = [['yellow', '黄'], ['green', '绿'], ['blue', '蓝'], ['pink', '粉'], ['purple', '紫'], ['orange', '橙'], ['red', '红'], ['teal', '青'], ['gray', '灰']];
export const TEXT_PALETTE = [['red', '红'], ['orange', '橙'], ['green', '绿'], ['blue', '蓝'], ['purple', '紫'], ['pink', '粉'], ['brown', '棕'], ['gray', '灰']];

export function color(name) {
  if (!name) return null;
  if (name.startsWith('#')) return name;
  const dark = document.documentElement.dataset.dark === '1';
  return (dark ? DARK : COLORS)[name.toLowerCase()] ?? COLORS.yellow;
}

function rgba(hex, a) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/./g, c => c + c) : m.slice(0, 6), 16);
  return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
}

export function blockKey(itemID, markup) { return itemID + '#' + fnv36(markup); }

export function annotationsIn(block) {
  return Object.values(state.current.annotations).filter(a => a.block === block);
}

/** Where a mark is now: its stored range if the quote is still there, else the nearest copy of the quote. */
export function resolve(a, text) {
  if (a.location + a.length <= text.length && text.substr(a.location, a.length) === a.quote) return [a.location, a.length];
  let best = null, i = text.indexOf(a.quote);
  while (i >= 0 && a.quote) {
    if (best == null || Math.abs(i - a.location) < Math.abs(best - a.location)) best = i;
    i = text.indexOf(a.quote, i + a.quote.length);
  }
  return best == null ? null : [best, a.quote.length];
}

// MARK: Rendering

/** One annotatable block of brief text. */
export function annotatedLine(markup, { item, tag = 'span', cls } = {}) {
  const el = h(tag + (cls ? '.' + cls.split(' ').join('.') : ''));
  el.append(render(markup));
  if (item?.id) {
    const block = blockKey(item.id, markup);
    el.dataset.block = block;
    el.dataset.item = item.id;
    el.dataset.itemTitle = item.title || '';
    el.classList.add('ann-block');
    paint(el, annotationsIn(block));
  }
  return el;
}

/** Text nodes of a block in order, skipping our own icons. */
function textNodes(root) {
  const out = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement?.closest('.ann-icon') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walk.nextNode()) out.push(walk.currentNode);
  return out;
}

export function blockText(root) { return textNodes(root).map(n => n.data).join(''); }

function paint(el, list) {
  if (!list.length) return;
  const text = blockText(el);
  // Older first, so a newer mark's styling lands on top.
  for (const a of [...list].sort((x, y) => (x.createdAt || '').localeCompare(y.createdAt || ''))) {
    const r = resolve(a, text);
    if (!r || r[1] <= 0) continue;
    const spans = wrap(el, r[0], r[0] + r[1], a.id);
    for (const s of spans) style(s, a);
    const last = spans[spans.length - 1];
    if (last && (a.comment || a.chat?.length)) {
      const icons = h('span.ann-icon', { 'data-ann': a.id, title: L('Open note', '打开批注') });
      if (a.comment) icons.append(h('span', '💬'));
      if (a.chat?.length) icons.append(h('span', '✨'));
      last.after(icons);
    }
  }
}

function style(s, a) {
  if (a.highlight) s.style.backgroundColor = rgba(color(a.highlight), document.documentElement.dataset.dark === '1' ? 0.32 : 0.35);
  if (a.textColor) s.style.color = color(a.textColor);
  if (a.bold) s.style.fontWeight = '700';
  if (a.italic) s.style.fontStyle = 'italic';
  if (a.underline) {
    s.style.textDecorationLine = 'underline';
    s.style.textDecorationStyle = { dashed: 'dashed', dotted: 'dotted', wavy: 'wavy' }[a.underline.pattern] || 'solid';
    s.style.textDecorationColor = color(a.underline.color);
    s.style.textDecorationThickness = (a.underline.width || 1.5) + 'px';
    s.style.textUnderlineOffset = '3px';
  }
  if (a.box) {
    s.style.outline = 'none';
    s.style.border = `${a.box.width || 1.5}px ${a.box.pattern === 'dashed' ? 'dashed' : a.box.pattern === 'dotted' ? 'dotted' : 'solid'} ${color(a.box.color)}`;
    s.style.borderRadius = '3px';
    s.style.padding = '0 1px';
    s.classList.add('ann-box');
  }
}

/** Wraps [start, end) of a block's text in spans (one per text node it covers). */
function wrap(root, start, end, id) {
  const spans = [];
  let pos = 0;
  for (const node of textNodes(root)) {
    const len = node.data.length;
    const a = Math.max(start, pos), b = Math.min(end, pos + len);
    if (a < b) {
      let target = node;
      if (a > pos) target = target.splitText(a - pos);
      if (b < pos + len) target.splitText(b - a);
      const span = h('span.ann', { 'data-ann': id });
      target.replaceWith(span);
      span.append(target);
      spans.push(span);
    }
    pos += len;
    if (pos >= end) break;
  }
  return spans;
}

// MARK: Selection

function offsetIn(root, container, offset) {
  // Length of the block's text before a DOM position (our icons don't count).
  const r = document.createRange();
  r.selectNodeContents(root);
  try { r.setEnd(container, offset); } catch { return 0; }
  const frag = r.cloneContents();
  frag.querySelectorAll('.ann-icon').forEach(n => n.remove());
  return frag.textContent.length;
}

/** The current selection, if it lies inside one annotatable block. */
export function currentSelection() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const startBlock = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest('.ann-block');
  const endBlock = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement)?.closest('.ann-block');
  const quote = sel.toString();
  if (!quote.trim()) return null;
  if (!startBlock || startBlock !== endBlock) return { quote, range, block: null };
  let s = offsetIn(startBlock, range.startContainer, range.startOffset);
  let e = offsetIn(startBlock, range.endContainer, range.endOffset);
  const text = blockText(startBlock);
  if (e < s) [s, e] = [e, s];
  // Trim spaces at the edges, like a double-click selection.
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (e <= s) return null;
  return { quote: text.slice(s, e), location: s, length: e - s, block: startBlock.dataset.block, el: startBlock,
           itemID: startBlock.dataset.item, itemTitle: startBlock.dataset.itemTitle, range };
}

// MARK: Toolbar

const last = () => getJSON('ann.last', { highlight: 'yellow', underline: { pattern: 'solid', color: 'red', width: 1.5 },
  box: { pattern: 'solid', color: 'red', width: 1.5 }, textColor: 'red' });
const remember = patch => setJSON('ann.last', { ...last(), ...patch });

let pending = null;

export function initSelection() {
  const bar = document.getElementById('toolbar');
  const show = () => {
    const sel = currentSelection();
    if (!sel) { if (!bar.contains(document.activeElement)) hideToolbar(); return; }
    pending = sel;
    buildToolbar(bar, sel);
    position(bar, sel.range.getBoundingClientRect());
  };
  document.addEventListener('mouseup', e => { if (!bar.contains(e.target)) setTimeout(show, 10); });
  document.addEventListener('keyup', e => { if (e.shiftKey) show(); });
  // Touch: the selection settles after the handles are released.
  let t;
  document.addEventListener('selectionchange', () => {
    if (!matchMedia('(pointer: coarse)').matches) return;
    clearTimeout(t);
    t = setTimeout(show, 450);
  });
  document.addEventListener('mousedown', e => { if (!bar.contains(e.target) && !document.getElementById('popover').contains(e.target)) hideToolbar(); });
  window.addEventListener('scroll', () => hideToolbar(), { passive: true, capture: true });
  // Clicking a mark (or its 💬 icon) opens it.
  document.addEventListener('click', e => {
    const icon = e.target.closest('.ann-icon');
    const mark = icon || (getSelection().isCollapsed ? e.target.closest('.ann') : null);
    if (!mark || e.target.closest('a')) return;
    const a = state.current.annotations[mark.dataset.ann];
    if (a) { e.preventDefault(); openMark(a, mark.getBoundingClientRect()); }
  });
}

export function hideToolbar() {
  const bar = document.getElementById('toolbar');
  bar.hidden = true;
  bar.replaceChildren();
}

function position(el, rect) {
  el.hidden = false;
  const w = el.offsetWidth, hgt = el.offsetHeight, m = 8;
  const touch = matchMedia('(pointer: coarse)').matches;
  // On phones the system menu sits above the selection: go below it.
  let top = touch ? rect.bottom + 14 : rect.top - hgt - 10;
  if (top < m + 50) top = rect.bottom + 10;
  if (top + hgt > innerHeight - m) top = Math.max(m, rect.top - hgt - 10);
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(m, Math.min(left, innerWidth - w - m));
  el.style.top = top + 'px';
  el.style.left = left + 'px';
}

function tool(label, title, onclick, cls = '') {
  return h('button.tool' + (cls ? '.' + cls : ''), { type: 'button', title, 'aria-label': title, onmousedown: e => e.preventDefault(), onclick }, label);
}

function buildToolbar(bar, sel) {
  bar.replaceChildren();
  const l = last();
  if (!sel.block) {
    bar.append(tool('＋ 生词', L('Add to vocabulary', '加入生词本'), () => { hideToolbar(); openAddVocab({ term: sel.quote }); }),
      tool('⧉', L('Copy', '复制'), () => { navigator.clipboard?.writeText(sel.quote); hideToolbar(); toast(L('Copied', '已复制')); }));
    return;
  }
  const swatch = c => h('span.swatch', { style: { background: color(c) } });
  bar.append(
    tool([swatch(l.highlight), ' ', L('Highlight', '高亮')], L('Highlight (last colour)', '高亮（上次的颜色）'), () => apply({ highlight: l.highlight })),
    tool('▾', L('Highlight colours', '高亮颜色'), e => menu(e, PALETTE.map(([c, zh]) => [swatch(c), L(c, zh), () => { remember({ highlight: c }); apply({ highlight: c }); }])), 'more'),
    tool(h('u', { style: { textDecorationStyle: l.underline.pattern, textDecorationColor: color(l.underline.color) } }, 'U'), L('Underline', '下划线'), () => apply({ underline: l.underline })),
    tool('▾', L('Underline style', '下划线样式'), e => lineMenu(e, 'underline'), 'more'),
    tool(h('span.boxicon', { style: { borderColor: color(l.box.color), borderStyle: l.box.pattern } }, '框'), L('Box', '框'), () => apply({ box: l.box })),
    tool('▾', L('Box style', '框样式'), e => lineMenu(e, 'box'), 'more'),
    tool(h('b', 'B'), L('Bold', '加粗'), () => apply({ bold: true })),
    tool(h('i', 'I'), L('Italic', '斜体'), () => apply({ italic: true })),
    tool(h('span', { style: { color: color(l.textColor), fontWeight: 700 } }, 'A'), L('Text colour', '文字颜色'), () => apply({ textColor: l.textColor })),
    tool('▾', L('Text colours', '文字颜色'), e => menu(e, TEXT_PALETTE.map(([c, zh]) => [h('span', { style: { color: color(c), fontWeight: 700 } }, 'A'), L(c, zh), () => { remember({ textColor: c }); apply({ textColor: c }); }])), 'more'),
    tool('💬', L('Comment', '评论'), () => { const a = apply({}); if (a) openMark(a, sel.range.getBoundingClientRect(), { focusComment: true }); }),
    tool('🏷', L('Categories', '分类'), () => { const a = apply({}); if (a) openMark(a, sel.range.getBoundingClientRect(), { tags: true }); }),
    tool('＋生词', L('Add to vocabulary', '加入生词本'), () => {
      hideToolbar();
      openAddVocab({ term: sel.quote, el: sel.el, itemID: sel.itemID, itemTitle: sel.itemTitle, location: sel.location });
    }),
  );
}

function menu(e, entries) {
  e.stopPropagation();
  const bar = document.getElementById('toolbar');
  const m = h('div.tool-menu', entries.map(([icon, label, fn]) => h('button', { type: 'button', onmousedown: ev => ev.preventDefault(), onclick: fn }, icon, ' ', label)));
  bar.querySelector('.tool-menu')?.remove();
  bar.append(m);
}

function lineMenu(e, kind) {
  const l = last()[kind];
  const patterns = kind === 'underline' ? [['solid', '实线'], ['dashed', '虚线'], ['dotted', '点线'], ['wavy', '波浪线']] : [['solid', '实线'], ['dashed', '虚线'], ['dotted', '点线']];
  const set = patch => { const v = { ...l, ...patch }; remember({ [kind]: v }); apply({ [kind]: v }); };
  menu(e, [
    ...patterns.map(([p, zh]) => [h('span', p === l.pattern ? '●' : '○'), L(p, zh), () => set({ pattern: p })]),
    ...TEXT_PALETTE.slice(0, 6).map(([c, zh]) => [h('span.swatch', { style: { background: color(c) } }), L(c, zh), () => set({ color: c })]),
    ...[1, 1.5, 2.5].map(w => [h('span', w === l.width ? '●' : '○'), L(`${w} pt`, `${w} 磅`), () => set({ width: w })]),
  ]);
}

/** Adds the style to the selection: merges into a mark with the same range, or makes a new one. */
function apply(patch) {
  const sel = pending;
  if (!sel?.block) return null;
  let result;
  mutate(s => {
    const existing = Object.values(s.annotations).find(a => a.block === sel.block && a.location === sel.location && a.length === sel.length);
    const now = iso();
    const a = existing ? { ...existing } : {
      id: uuid(), block: sel.block, itemID: sel.itemID || null, itemTitle: sel.itemTitle || null,
      location: sel.location, length: sel.length, quote: sel.quote, createdAt: now,
    };
    for (const [k, v] of Object.entries(patch)) a[k] = v;
    a.updatedAt = now;
    if (a.itemID == null) delete a.itemID;
    if (a.itemTitle == null) delete a.itemTitle;
    s.annotations[a.id] = a;
    result = a;
  });
  hideToolbar();
  getSelection().removeAllRanges();
  return result;
}

// MARK: Editing a mark

function update(id, patch) {
  mutate(s => {
    const a = s.annotations[id];
    if (!a) return;
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === false) delete a[k]; else a[k] = v; }
    a.updatedAt = iso();
    if (isEmpty(a)) delete s.annotations[id];
  });
}

export function isEmpty(a) {
  return !a.highlight && !a.underline && !a.box && a.bold !== true && a.italic !== true && !a.textColor
    && !(a.comment || '').length && !(a.chat || []).length && !(a.tags || []).length;
}

export function openMark(a, rect, opts = {}) {
  hideToolbar();
  const pop = document.getElementById('popover');
  const close = () => { pop.hidden = true; pop.replaceChildren(); document.removeEventListener('mousedown', outside, true); };
  const outside = e => { if (!pop.contains(e.target)) { saveComment(); close(); } };
  const current = () => state.current.annotations[a.id];
  const comment = h('textarea.comment', { rows: 3, placeholder: L('Write a comment…', '写下你的评论…') });
  comment.value = a.comment || '';
  const saveComment = () => {
    if (!current()) return;
    const v = comment.value.trim();
    if (v !== (current().comment || '')) update(a.id, { comment: v || null });
  };
  const chips = (list, on, fn) => h('div.chips', list.map(([key, label, sw]) => h('button.chip' + (on(key) ? '.on' : ''), { type: 'button', onclick: () => { fn(key); redraw(); } }, sw || '', label)));
  const body = h('div.pop-body');
  const redraw = () => {
    const x = current();
    if (!x) { close(); return; }
    fill(body, 
      h('blockquote.pop-quote', x.quote),
      h('div.pop-label', L('Highlight', '高亮')),
      chips([...PALETTE.map(([c, zh]) => [c, '', h('span.swatch', { style: { background: color(c) } })]), ['', L('None', '无')]], k => (x.highlight || '') === k, k => update(a.id, { highlight: k || null })),
      h('div.pop-row',
        h('button.chip' + (x.underline ? '.on' : ''), { type: 'button', onclick: () => { update(a.id, { underline: x.underline ? null : last().underline }); redraw(); } }, h('u', 'U'), ' ', L('Underline', '下划线')),
        h('button.chip' + (x.box ? '.on' : ''), { type: 'button', onclick: () => { update(a.id, { box: x.box ? null : last().box }); redraw(); } }, L('Box', '框')),
        h('button.chip' + (x.bold ? '.on' : ''), { type: 'button', onclick: () => { update(a.id, { bold: !x.bold || null }); redraw(); } }, h('b', 'B')),
        h('button.chip' + (x.italic ? '.on' : ''), { type: 'button', onclick: () => { update(a.id, { italic: !x.italic || null }); redraw(); } }, h('i', 'I')),
        h('button.chip' + (x.textColor ? '.on' : ''), { type: 'button', onclick: () => { update(a.id, { textColor: x.textColor ? null : last().textColor }); redraw(); } }, h('span', { style: { color: color(x.textColor || last().textColor), fontWeight: 700 } }, 'A')),
      ),
      h('div.pop-label', L('Comment', '评论')),
      comment,
      tagPicker(x, redraw),
      x.chat?.length ? h('div.pop-chat',
        h('div.pop-label', L('AI conversation (asked on the Mac)', 'AI 对话（在 Mac 上提问）')),
        x.chat.map(m => h('div.msg.' + (m.role === 'user' ? 'me' : 'ai'), m.text))) : null,
      h('div.pop-actions',
        h('button.btn.danger', { type: 'button', onclick: () => { mutate(s => { delete s.annotations[a.id]; }); close(); } }, L('Remove mark', '删除标记')),
        h('button.btn.primary', { type: 'button', onclick: () => { saveComment(); close(); } }, L('Done', '完成'))),
    );
  };
  redraw();
  fill(pop, body);
  pop.hidden = false;
  placePopover(pop, rect);
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  if (opts.focusComment) comment.focus();
  if (opts.tags) pop.querySelector('.tag-input')?.focus();
}

export function placePopover(pop, rect) {
  const narrow = innerWidth < 600;
  if (narrow) { pop.classList.add('sheetlike'); pop.style.left = pop.style.top = ''; return; }
  pop.classList.remove('sheetlike');
  const w = pop.offsetWidth, hgt = pop.offsetHeight, m = 10;
  let top = rect.bottom + 8;
  if (top + hgt > innerHeight - m) top = Math.max(m, rect.top - hgt - 8);
  pop.style.top = top + 'px';
  pop.style.left = Math.max(m, Math.min(rect.left, innerWidth - w - m)) + 'px';
}

function tagPicker(x, redraw) {
  const names = state.current.tagNames;
  const on = new Set(x.tags || []);
  const input = h('input.tag-input', { placeholder: L('New category…', '新分类…'), enterkeyhint: 'done' });
  const toggle = t => {
    const tags = on.has(t) ? [...on].filter(y => y !== t) : [...on, t];
    update(x.id, { tags: tags.length ? tags : null });
  };
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = input.value.trim();
    if (!t) return;
    mutate(s => { if (!s.tagNames.includes(t)) s.tagNames.push(t); });
    if (!on.has(t)) toggle(t);
    redraw();
  });
  return h('div',
    h('div.pop-label', L('Categories', '分类')),
    h('div.chips', names.map(t => h('button.chip' + (on.has(t) ? '.on' : ''), { type: 'button', onclick: () => { toggle(t); redraw(); } }, tagLabel(t)))),
    input);
}

export function tagLabel(name) { return name; }

export { bt };
