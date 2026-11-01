// 生词本: words saved from the brief (or typed in), in the Mac app's VocabEntry format.

import { h, L, iso, uuid, toast, bt } from './util.js';
import { state, mutate } from './state.js';
import { store, glossaryID, normaliseTerm } from './data.js';
import { plain } from './rich.js';
import { openSheet, closeSheet } from './ui.js';

export function language(text) { return /[㐀-䶿一-鿿]/.test(text) ? 'zh' : 'en'; }

/** The other language's word, from the glossary when it knows the term. */
function glossaryTranslation(term) {
  const id = glossaryID(term);
  if (!id) return '';
  const t = bt(store.glossary.get(id).term);
  return language(term) === 'zh' ? (t.en || '') : (t.zh || '');
}

function sentences(text) {
  // Split after . ! ? 。！？ (keeping the mark), not after "e.g." style abbreviations too eagerly.
  return text.match(/[^.!?。！？]+[.!?。！？]*["”’)）]*\s*/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
}

function contextFor(el, location) {
  if (!el) return null;
  const text = el.textContent.replace(/[💬✨]/g, '');
  const parts = sentences(text);
  let pos = 0, index = 0;
  for (let i = 0; i < parts.length; i++) {
    const at = text.indexOf(parts[i], pos);
    if (at >= 0) { if (location >= at) index = i; pos = at + parts[i].length; }
  }
  const own = parts[index] || text;
  const pair = el._pair ? plain(el._pair) : '';
  const pairParts = pair ? sentences(pair) : [];
  const other = pairParts.length === parts.length ? pairParts[index] : pair.length <= 220 ? pair : '';
  const isZH = language(own) === 'zh';
  const en = isZH ? other : own, zh = isZH ? own : other;
  if (!en && !zh) return null;
  return zh && en ? { en, zh } : { en: en || zh, zh: null };
}

export function openAddVocab({ term = '', el, itemID, itemTitle, location = 0, entry } = {}) {
  const editing = !!entry;
  const ctx = entry?.context ?? contextFor(el, location);
  const f = {
    term: h('input', { value: entry?.term ?? term.trim(), placeholder: L('Word or phrase', '单词或短语') }),
    translation: h('input', { value: entry?.translation ?? glossaryTranslation(term), placeholder: L('Meaning', '释义') }),
    en: h('textarea', { rows: 2, placeholder: L('Example (English)', '例句（英文）') }),
    zh: h('textarea', { rows: 2, placeholder: L('Example (Chinese)', '例句（中文）') }),
    note: h('textarea', { rows: 2, placeholder: L('Note', '备注') }),
  };
  f.en.value = ctx ? (ctx.en || '') : '';
  f.zh.value = ctx ? (ctx.zh || '') : '';
  f.note.value = entry?.note || '';
  const lookup = h('a.small', { href: '#', target: '_blank', rel: 'noopener noreferrer' }, L('Look it up in Google Translate ↗', '在 Google 翻译中查 ↗'));
  const refreshLookup = () => {
    const t = f.term.value.trim();
    const zh = language(t) === 'zh';
    lookup.href = `https://translate.google.com/?sl=${zh ? 'zh-CN' : 'en'}&tl=${zh ? 'en' : 'zh-CN'}&text=${encodeURIComponent(t)}&op=translate`;
    if (!f.translation.value) f.translation.value = glossaryTranslation(t);
  };
  f.term.addEventListener('input', refreshLookup);
  refreshLookup();
  const save = () => {
    const t = f.term.value.trim();
    if (!t) { f.term.focus(); return; }
    const dup = Object.values(state.current.vocab).find(v => v.id !== entry?.id && normaliseTerm(v.term) === normaliseTerm(t));
    if (dup && !editing) { toast(L('Already in your vocabulary', '生词本里已经有这个词了')); closeSheet(); return; }
    const en = f.en.value.trim(), zh = f.zh.value.trim();
    const now = iso();
    mutate(s => {
      const v = entry ? { ...s.vocab[entry.id] } : { id: uuid(), createdAt: now, mastered: false, reviews: 0 };
      v.term = t;
      v.translation = f.translation.value.trim();
      v.termLanguage = language(t);
      if (en || zh) v.context = zh && en ? { en, zh } : (en || zh); else delete v.context;
      const note = f.note.value.trim();
      if (note) v.note = note; else delete v.note;
      if (!entry) { if (itemID) v.itemID = itemID; if (itemTitle) v.itemTitle = itemTitle; }
      v.updatedAt = now;
      s.vocab[v.id] = v;
    });
    closeSheet();
    toast(editing ? L('Saved', '已保存') : L('Added to vocabulary', '已加入生词本'));
  };
  openSheet(editing ? L('Edit word', '编辑生词') : L('Add to vocabulary', '加入生词本'), h('div.form',
    h('label', L('Word', '生词'), f.term),
    h('label', L('Meaning', '释义'), f.translation),
    lookup,
    h('label', L('Example sentence', '例句'), f.en, f.zh),
    h('label', L('Note', '备注'), f.note),
  ), [
    h('button.btn', { type: 'button', onclick: closeSheet }, L('Cancel', '取消')),
    h('button.btn.primary', { type: 'button', onclick: save }, editing ? L('Save', '保存') : L('Add', '添加')),
  ]);
  setTimeout(() => (f.term.value ? f.translation : f.term).focus(), 50);
}

export function exportCSV() {
  const rows = [['term', 'translation', 'example_en', 'example_zh', 'note', 'source', 'mastered', 'added']];
  for (const v of Object.values(state.current.vocab).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const c = bt(v.context);
    rows.push([v.term, v.translation, c?.en || '', c?.zh || '', v.note || '', v.itemTitle || '', v.mastered ? 'yes' : '', v.createdAt.slice(0, 10)]);
  }
  const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `生词本-${iso().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
}
