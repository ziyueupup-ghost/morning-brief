// Inline emphasis inside brief text — the same markers as the Mac app's RichText:
//   **bold**  ==highlight==  !!warning!!  ++positive++  ^^concept^^
// The displayed text (markers removed, "ⓘ" after a concept that has a glossary entry) must match
// the Mac's exactly, because annotations store positions in it.

import { glossaryID } from './data.js';

const MARKERS = [['**', 'bold'], ['==', 'highlight'], ['!!', 'warning'], ['++', 'positive'], ['^^', 'concept']];

export function runs(s) {
  const out = [];
  let plain = '', i = 0;
  outer: while (i < s.length) {
    for (const [m, style] of MARKERS) {
      if (s.startsWith(m, i)) {
        const open = i + m.length;
        const close = s.indexOf(m, open);
        if (close > open) {
          if (plain) { out.push({ text: plain }); plain = ''; }
          out.push({ text: s.slice(open, close), style });
          i = close + m.length;
          continue outer;
        }
      }
    }
    // Step by code point, as Swift steps by character.
    const cp = s.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    plain += ch;
    i += ch.length;
  }
  if (plain) out.push({ text: plain });
  return out;
}

export function plain(s) {
  if (!s) return '';
  if (!MARKERS.some(([m]) => s.includes(m))) return s;
  return runs(s).map(r => r.style ? plain(r.text) : r.text).join('');
}

/** Styled inline nodes for one markup string. */
export function render(s, { glossary = true } = {}) {
  const frag = document.createDocumentFragment();
  for (const r of runs(s || '')) {
    if (!r.style) { frag.append(document.createTextNode(r.text)); continue; }
    const inner = render(r.text, { glossary });
    let el;
    switch (r.style) {
      case 'bold': el = document.createElement('strong'); break;
      case 'highlight': el = document.createElement('mark'); el.className = 'm-hl'; break;
      case 'warning': el = document.createElement('strong'); el.className = 'm-warn'; break;
      case 'positive': el = document.createElement('strong'); el.className = 'm-pos'; break;
      case 'concept': {
        const id = glossary ? glossaryID(r.text) : null;
        if (id) {
          el = document.createElement('a');
          el.className = 'm-concept gloss';
          el.dataset.gloss = id;
          el.href = '#';
          el.append(inner);
          const mark = document.createElement('sup');
          mark.className = 'gloss-mark';
          mark.textContent = 'ⓘ';
          el.append(mark);
          frag.append(el);
          continue;
        }
        el = document.createElement('strong'); el.className = 'm-concept';
        break;
      }
    }
    el.append(inner);
    frag.append(el);
  }
  return frag;
}

/** Marker-free text for places that can't show styling. */
export function plainBT(t, mode) {
  if (!t) return '';
  if (mode === 'chinese') return plain(t.zh || t.en);
  if (mode === 'bilingual') return plain(t.zh ? `${t.en}\n${t.zh}` : t.en);
  return plain(t.en);
}
