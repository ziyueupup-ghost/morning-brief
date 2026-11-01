// The pages: today's brief, item pages, archive, read history, saved, focus columns, data.

import { h, bt, bts, arr, L, lang, primary, fmtDay, fmtTime, link, webURL, doiURL, dayKey, relDays, daysUntil, parseDate } from './util.js';
import { store, config, todaysBrief, brief, item, itemTitle, focusColumns, focusItemsIn, themeLabel, briefTitle, syncBriefs } from './data.js';
import { state, setRead } from './state.js';
import { biText, txt, titleBlock, section, bulletList, importanceBadge, importance, chip, regionChip, tagsRow, card, sourcesBlock, actionsBar, empty } from './ui.js';
import { plain } from './rich.js';

const A = () => lang.article;
const LA = (en, zh, sep) => L(en, zh, sep ?? ' · ', A());

// MARK: Today / a day's brief

export function dayView(id) {
  const b = id ? brief(id) : todaysBrief();
  const page = h('div.page.brief');
  if (!b) {
    page.append(store.error ? errorBox() : empty('🗞', 'No briefs yet. Sync to download them.', '还没有晨报，同步一下试试。',
      h('button.btn.primary', { type: 'button', onclick: () => syncBriefs() }, L('Sync now', '立即同步'))));
    return page;
  }
  const isToday = b.id === dayKey();
  if (!id && !isToday) {
    page.append(h('div.banner',
      h('div', h('strong', L('Today’s brief hasn’t arrived yet', '今天的晨报还没到')), h('div.small', L(`Showing ${fmtDay(b.id)}.`, `正在显示 ${fmtDay(b.id)} 的晨报。`))),
      h('button.btn', { type: 'button', onclick: () => syncBriefs() }, L('Sync now', '立即同步'))));
  }
  if (store.error) page.append(errorBox());
  page.append(masthead(b));

  const exec = arr(b.executive_brief);
  if (exec.length) {
    page.append(h('section.brief-sec', h('h2', '📌 ' + L('Today at a Glance', '今日速览', '  ')),
      h('ol.glance', exec.map(e => {
        const target = String(e.target || '').replace(/^criminologybrief:\/\//, '').split('/').pop();
        const inner = [h('span.glance-mark', e.icon || importance(e.importance)[3]), h('span', txt(e.text))];
        return h('li', target && item(target) ? h('a', { href: '#/item/' + encodeURIComponent(target) }, inner) : inner);
      }))));
  }
  const group = (key, en, zh, emoji, list, opts = {}) => {
    if (!list.length) return null;
    return h('section.brief-sec', { id: 'sec-' + key },
      h('h2', emoji + ' ' + L(en, zh, '  '), h('span.count', String(list.length))),
      h('div.cards' + (opts.grid ? '.grid' : ''), list.map(it => card({ kind: opts.kind, item: it }, opts))));
  };
  page.append(
    group('top', 'Top Stories', '头条要闻', '🔥', b.top_stories, { kind: 'story', grid: true }) || '',
    group('followups', 'Follow-up', '持续跟进', '🧭', b.followups, { kind: 'followup' }) || '',
  );
  const data = store.dataItems.filter(d => (d.date || '').slice(0, 10) === b.id);
  if (data.length) page.append(group('data', 'Data Watch', '数据观察', '📊', data, { kind: 'data' }));
  page.append(group('academic', 'Academic & Professional Watch', '学术与专业动态', '🎓', b.academic_watch, { kind: 'academic' }) || '');

  if (b.quick_scan.length) {
    page.append(h('section.brief-sec', h('h2', '📰 ' + L('Quick Scan', '快速浏览', '  '), h('span.count', String(b.quick_scan.length))),
      h('div.quick', b.quick_scan.map(q => h('a.quick-item' + (state.current.read.includes(q.id) ? '.read' : ''), { href: '#/item/' + encodeURIComponent(q.id) },
        h('div.card-meta', h('span.imp-dot', { style: { background: `var(--${importance(q.importance)[2]})` } }), h('span', q.category || ''), h('span', q.location || '')),
        titleBlock(q.headline, 'h4'),
        h('p.card-sum', txt(q.summary)))))));
  }
  const ea = b.editor_analysis;
  if (ea) {
    const e = Array.isArray(ea) ? ea[0] : typeof ea === 'string' ? { title: { en: 'Editor’s Analysis', zh: '编辑分析' }, paragraphs: ea.split('\n\n') } : ea;
    page.append(h('section.brief-sec.editor', h('h2', '🧠 ' + L('Editor’s Analysis', '编辑分析', '  ')),
      e.title ? titleBlock(e.title, 'h3') : null,
      e.theme ? h('p.small', txt(e.theme)) : null,
      bts(e.paragraphs).map(p => h('div.para', biText(p, { mode: lang.brief })))));
  }
  const learn = b.learning;
  const knowledge = Array.isArray(learn) ? learn : arr(learn?.knowledge);
  const takeaways = Array.isArray(learn) ? [] : bts(learn?.takeaways);
  if (knowledge.length || takeaways.length) {
    page.append(h('section.brief-sec', h('h2', '💡 ' + L('Today I Learned', '今日所学', '  ')),
      h('div.learn', knowledge.filter(k => bt(k.title)).map(k => h('div.learn-card',
        titleBlock(k.title, 'h4'), h('p', txt(k.explanation)), k.example ? h('p.small', txt(k.example)) : null))),
      takeaways.length ? h('div.takeaways', h('h4', L('Takeaways', '要点')), h('ul', takeaways.map(t => h('li', txt(t))))) : null));
  }
  return page;
}

function masthead(b) {
  const owner = (localStorage.getItem('ownerName') || '').trim();
  const name = owner ? `${owner}的晨报` : L('Morning Brief', '晨报');
  const ids = [...b.top_stories, ...b.followups, ...b.academic_watch, ...b.quick_scan].map(x => x.id);
  const read = ids.filter(id => state.current.read.includes(id)).length;
  const t = briefTitle();
  return h('header.masthead',
    h('div.mast-kicker', fmtDay(b.id, lang.brief, { weekday: true })),
    h('h1.mast-title', name),
    h('div.mast-sub', primary(b.edition) || primary(t)),
    h('div.mast-stats',
      h('span', L(`${ids.length} items`, `${ids.length} 条`)),
      h('a.pill', { href: '#/history?day=' + b.id }, L(`${read} read ›`, `${read} 已读 ›`))));
}

function errorBox() {
  return h('div.banner.error', h('div', h('strong', L('Couldn’t sync', '同步失败')), h('div.small', store.error)),
    h('a.btn', { href: '#/settings' }, L('Settings', '设置')));
}

// MARK: Item pages

export function itemView(id) {
  const e = item(id);
  if (!e) return h('div.page', empty('🔍', 'This item isn’t in your downloaded briefs.', '已下载的晨报里没有这一条。'));
  setRead(id, true);
  const view = { story, followup, academic, quick, focus: focusItem, data: dataItem }[e.kind];
  return h('article.page.reading', view(e.item, e.brief));
}

const ann = it => ({ id: it.id, title: plain(bt(it.title ?? it.headline)?.en || '') });

function header({ kicker = [], title, subtitle, meta = [], tags }) {
  return h('header.item-head',
    h('div.kicker', kicker),
    biText(title, { tag: 'h1', cls: 'item-title', mode: A() }),
    subtitle ? biText(subtitle, { cls: 'item-sub', mode: A() }) : null,
    meta.filter(Boolean).length ? h('div.item-meta', meta.filter(Boolean).join(' · ')) : null,
    tags || null);
}

function image(it) {
  const src = webURL(it.image_url);
  if (!src) return null;
  const credit = bt(it.image_credit), caption = bt(it.image_caption);
  const from = webURL(it.image_source_url);
  return h('figure.lead-img', h('img', { src, alt: primary(caption, A()) || '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.closest('figure').remove() }),
    (credit || caption) ? h('figcaption', caption ? primary(caption, A()) + ' ' : '', credit ? (from ? link(from, primary(credit, A())) : primary(credit, A())) : '') : null);
}

function textSec(en, zh, icon, t, it, tint) {
  t = bt(t);
  return t ? section(en, zh, icon, ...(tint ? [tint] : []), biText(t, { item: ann(it) })) : null;
}

function bulletSec(en, zh, icon, list, it, tint, symbol) {
  return bts(list).length ? section(en, zh, icon, ...(tint ? [tint] : []), bulletList(list, { item: ann(it), symbol })) : null;
}

function impactsSec(list, it) {
  const items = arr(list).map(x => (typeof x === 'object' && x && 'text' in x) ? { who: bt(x.who), text: bt(x.text) } : { who: null, text: bt(x) }).filter(x => x.text);
  if (!items.length) return null;
  return section('Impact', '影响', '🎯', 'purple', h('ul.bullets.impacts', items.map(x => h('li',
    h('span.dot', '→'), h('div', x.who ? h('div.who', primary(x.who, A())) : null, biText(x.text, { item: ann(it) }))))));
}

function nextDate(nd) {
  if (!nd?.date) return null;
  return h('div.next-date', '📅 ', h('strong', LA('Next', '下一步', ' ') + ': '), primary(nd.label, A()), ' — ', fmtDay(nd.date, A()), ` (${relDays(nd.date)})`);
}

function timeline(list, it) {
  const ev = arr(list).filter(e => e?.date && bt(e.title)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!ev.length) return null;
  return section('Timeline', '时间线', '🕰', h('ol.timeline', ev.map(e => h('li',
    h('div.tl-date', fmtDay(e.date, A())), biText(e.title, { item: ann(it), cls: 'tl-title' }), e.detail ? biText(e.detail, { item: ann(it), cls: 'small' }) : null))));
}

function story(s) {
  const it = s;
  const perspectives = arr(s.perspectives).filter(p => bt(p.summary));
  const claims = arr(s.allegations).filter(c => bt(c.text));
  const crit = arr(s.critical_thinking).filter(c => bt(c.discussion));
  const sa = s.study_angle || {};
  const role = {
    government: ['Government', '政府'], police: ['Police', '警方'], courts: ['Courts', '法院'], defence: ['Defence', '辩方'],
    prosecution: ['Prosecution', '控方'], ngo: ['NGO', '非政府组织'], legal_profession: ['Legal profession', '法律界'], academic: ['Academic', '学者'],
    advocacy: ['Advocacy group', '倡导团体'], victims: ['Victims / representatives', '受害者 / 代表'], policy_expert: ['Policy expert', '政策专家'],
    opinion: ['Opinion writer', '评论作者'], inquiry: ['Official inquiry', '官方调查'], other: ['Other', '其他'],
  };
  const claimKind = {
    police: ['Police allegation', '警方指控'], prosecution: ['Prosecution claim', '控方主张'], defence: ['Defence claim', '辩方主张'],
    witness: ['Witness claim', '证人陈述'], media: ['Media report', '媒体报道'], government: ['Government claim', '政府说法'],
    family: ['Family claim', '家属说法'], other: ['Claim', '说法'],
  };
  const critKind = {
    evidence_limitations: ['Evidence limitations', '证据局限'], correlation_causation: ['Correlation vs causation', '相关不等于因果'],
    media_framing: ['Media framing', '媒体框架'], moral_panic: ['Moral panic', '道德恐慌'], political_framing: ['Political framing', '政治框架'],
    policy_trade_offs: ['Policy trade-offs', '政策权衡'], selection_bias: ['Selection bias', '选择偏差'], institutional_bias: ['Institutional bias', '制度性偏差'],
    alternative_explanations: ['Alternative explanations', '其他解释'], unintended_consequences: ['Unintended consequences', '意外后果'],
    missing_data: ['Missing data', '数据缺失'], methodological_limitations: ['Methodological limitations', '方法局限'],
    cannot_conclude: ['What cannot be concluded', '目前无法得出的结论'], other: ['Critical note', '批判性要点'],
  };
  return [
    header({
      kicker: [importanceBadge(s.importance, A()), s.is_follow_up ? chip(LA('Follow-up', '跟进')) : null],
      title: s.title, subtitle: s.subtitle,
      meta: [s.published_at ? fmtDay(s.published_at, A()) : null, s.region],
      tags: tagsRow(s.region, s.categories),
    }),
    image(s),
    actionsBar(s.id, { url: sourceSortedFirst(s.sources) }),
    textSec('Summary', '摘要', '📝', s.summary, it),
    bulletSec('Key Points', '要点', '🔑', s.key_points, it, 'accent', '▸'),
    textSec('Latest Development', '最新进展', '✨', s.latest_development, it, 'green'),
    bts(s.background_points).length ? bulletSec('Background', '背景', '🕰', s.background_points, it, 'brown') : textSec('Background', '背景', '🕰', s.background, it, 'brown'),
    bulletSec('Analysis', '深度分析', '🔍', s.analysis, it, 'blue'),
    impactsSec(s.impacts, it),
    bulletSec('Confirmed Facts', '已证实事实', '✅', s.confirmed_facts, it, 'green', '✓'),
    claims.length ? section('Allegations / Claims', '指控 / 说法', '⚠️', 'orange', h('div.claims', claims.map(c => h('div.claim',
      h('div.claim-kind', LA(...(claimKind[c.kind] || claimKind.other), ' '), c.attributed_to ? ' — ' + primary(c.attributed_to, A()) : ''),
      biText(c.text, { item: ann(it) }),
      c.status ? h('div.small', primary(c.status, A())) : null)))) : null,
    perspectives.length ? section('Different Perspectives', '各方观点', '🗣', 'indigo', h('div.persp', perspectives.map(p => h('div.persp-card',
      h('div.persp-head', h('strong', primary(p.speaker, A())), p.organisation ? h('span.small', ' · ' + primary(p.organisation, A())) : null),
      h('div.small', LA(...(role[p.role] || role.other), ' '), p.position ? ' · ' + primary(p.position, A()) : ''),
      biText(p.summary, { item: ann(it) }))))) : null,
    bulletSec('What to Watch', '接下来关注', '🔭', s.watch_next, it, 'orange'),
    textSec('Why It Matters', '为什么重要', '❗', s.why_it_matters, it, 'red'),
    crit.length ? section('Critical Thinking', '批判性思考', '🧠', 'pink', crit.map(c => h('div.crit',
      h('h4', c.issue ? primary(c.issue, A()) : LA(...(critKind[c.kind] || critKind.other), ' ')),
      biText(c.discussion, { item: ann(it) })))) : null,
    studyAngle(sa, it),
    nextDate(s.next_date),
    timeline(s.timeline, it),
    sourcesBlock(s.sources),
  ];
}

function sourceSortedFirst(sources) {
  for (const s of arr(sources)) { const u = webURL(s?.url); if (u) return u; }
  return null;
}

function studyAngle(sa, it) {
  if (!sa || typeof sa !== 'object') return null;
  const parts = [
    arr(sa.theories).length ? h('div.chips', arr(sa.theories).map(t => chip(t, 'theory'))) : null,
    bts(sa.concepts).length ? h('div', h('h4', LA('Concepts', '概念')), bulletList(sa.concepts, { item: ann(it) })) : null,
    bts(sa.legal_issues).length ? h('div', h('h4', LA('Legal issues', '法律问题')), bulletList(sa.legal_issues, { item: ann(it) })) : null,
    bts(sa.essay_arguments).length ? h('div', h('h4', LA('Essay arguments', '论文论点')), bulletList(sa.essay_arguments, { item: ann(it) })) : null,
    bts(sa.research_questions).length ? h('div', h('h4', LA('Research questions', '研究问题')), bulletList(sa.research_questions, { item: ann(it), symbol: '?' })) : null,
    bts(sa.literature_topics).length ? h('div', h('h4', LA('Literature to look up', '可查阅的文献主题')), bulletList(sa.literature_topics, { item: ann(it) })) : null,
    bt(sa.note) ? biText(sa.note, { item: ann(it) }) : null,
  ].filter(Boolean);
  return parts.length ? section('Study / Research Angle', '学习与研究角度', '🎓', 'academic', h('div.study', parts)) : null;
}

function followup(f) {
  const it = f;
  const assess = {
    strengthens_previous: ['Strengthens previous assessment', '强化了此前判断'], weakens_previous: ['Weakens previous assessment', '削弱了此前判断'],
    no_material_change: ['Does not materially change assessment', '未实质改变判断'], inconclusive: ['Evidence remains inconclusive', '证据仍无定论'],
    policy_progressed: ['Policy has progressed', '政策已推进'], legislation_passed: ['Legislation has passed', '立法已通过'],
    charges_filed: ['Charges filed', '已提出指控'], judgment_delivered: ['Judgment delivered', '判决已作出'], other: ['Assessment', '评估'],
  }[f.assessment] || ['Assessment', '评估'];
  return [
    header({ kicker: [chip('🧭 ' + LA('Follow-up', '持续跟进')), importanceBadge(f.importance, A())], title: f.title, meta: [f.region], tags: tagsRow(f.region, f.categories) }),
    actionsBar(f.id, { url: sourceSortedFirst(f.sources) }),
    textSec('Previously', '此前', '⏪', f.previous_summary, it, 'gray'),
    textSec('New Development', '新进展', '✨', f.new_development, it, 'green'),
    bulletSec('What Changed', '这次变了什么', '✨', f.key_points, it, 'green'),
    bulletSec('Analysis', '深度分析', '🔍', f.analysis, it, 'blue'),
    impactsSec(f.impacts, it),
    bulletSec('What to Watch', '接下来关注', '🔭', f.watch_next, it, 'orange'),
    textSec('Why It Matters', '为什么重要', '❗', f.why_it_matters, it, 'red'),
    section('Assessment', '评估', '⚖️', h('p', h('strong', LA(assess[0], assess[1]))), f.assessment_note ? biText(f.assessment_note, { item: ann(it) }) : null),
    nextDate(f.next_date),
    arr(f.theories).length ? h('div.chips', arr(f.theories).map(t => chip(t, 'theory'))) : null,
    timeline(f.timeline, it),
    f.story_id && item(f.story_id) ? h('p', h('a', { href: '#/item/' + encodeURIComponent(f.story_id) }, LA('Read the full story →', '阅读完整报道 →'))) : null,
    sourcesBlock(f.sources),
  ];
}

const ACAD_KIND = {
  paper: ['Paper', '论文'], report: ['Report', '报告'], aic_publication: ['AIC publication', 'AIC 出版物'], university_research: ['University research', '大学研究'],
  announcement: ['Announcement', '公告'], conference: ['Conference', '学术会议'], seminar: ['Seminar', '研讨会'], workshop: ['Workshop', '工作坊'],
  lecture: ['Public lecture', '公开讲座'], event: ['Event', '活动'], call_for_papers: ['Call for papers', '论文征集'],
  call_for_abstracts: ['Call for abstracts', '摘要征集'], funding: ['Funding', '资助'], other: ['Academic', '学术'],
};
const EVENT_KINDS = new Set(['conference', 'seminar', 'workshop', 'lecture', 'event', 'call_for_papers', 'call_for_abstracts', 'funding']);

function academic(a) {
  const it = a;
  const doi = doiURL(a.doi);
  const url = webURL(a.url) || doi || webURL(a.event?.registration_url);
  const isEvent = EVENT_KINDS.has(a.kind);
  return [
    header({
      kicker: [chip('🎓 ' + LA(...(ACAD_KIND[a.kind] || ACAD_KIND.other), ' ')), importanceBadge(a.importance || 'watching', A())],
      title: a.title,
      meta: [arr(a.authors).join(', '), primary(a.institution, A()), primary(a.publication, A()), a.publication_date ? fmtDay(a.publication_date, A()) : null],
      tags: h('div', doi ? h('div', link(doi, 'DOI: ' + a.doi)) : null, !isEvent && !doi ? findLinks(plain(bt(a.title).en)) : null, tagsRow(a.region, a.categories)),
    }),
    actionsBar(a.id, { url, citation: isEvent ? null : citation(a) }),
    a.event ? eventBlock(a.event) : null,
    textSec('Summary', '摘要', '📝', a.summary, it),
    a.evidence_note ? section('What this evidence can and cannot show', '这项证据能说明什么、不能说明什么', '⚠️', 'orange', biText(a.evidence_note, { item: ann(it) })) : null,
    (a.research_question || a.methodology || a.sample) ? section('Study Design', '研究设计', '📐', 'indigo', h('div.design',
      [['Research question', '研究问题', a.research_question], ['Methodology', '研究方法', a.methodology], ['Sample', '样本', a.sample]]
        .filter(x => bt(x[2])).map(([en, zh, v]) => h('div.design-tile', h('div.pop-label', LA(en, zh)), biText(v, { item: ann(it) }))))) : null,
    bulletSec('Major Findings', '主要发现', '📊', a.findings, it, 'green', '→'),
    bulletSec('Limitations', '研究局限', '➖', a.limitations, it, 'pink', '−'),
    textSec('Why It’s Relevant', '为什么相关', '📌', a.relevance, it, 'academic'),
    (a.essay_use || bts(a.research_ideas).length || arr(a.theories).length) ? section('Using It in Study / Research', '如何用于学习与研究', '🎓', 'academic',
      arr(a.theories).length ? h('div.chips', arr(a.theories).map(t => chip(t, 'theory'))) : null,
      a.essay_use ? h('div', h('h4', LA('Possible essay use', '论文中可以怎么用')), biText(a.essay_use, { item: ann(it) })) : null,
      bts(a.research_ideas).length ? h('div', h('h4', LA('Possible research questions', '可能的研究问题')), bulletList(a.research_ideas, { item: ann(it), symbol: '?' })) : null) : null,
    !url ? h('p.warn-note', '⚠️ ' + LA('No DOI or link was given — it couldn’t be verified', '没有提供 DOI 或链接，无法核实这篇内容')) : null,
  ];
}

function eventBlock(ev) {
  const start = parseDate(ev.start_date);
  const mode = { online: ['Online', '线上'], in_person: ['In person', '线下'], hybrid: ['Hybrid', '线上线下结合'] }[ev.mode];
  const deadlines = [['Call for papers closes', '论文征集截止', ev.call_for_papers_deadline], ['Registration closes', '报名截止', ev.registration_deadline]]
    .filter(d => d[2]).sort((a, b) => (a[2] < b[2] ? -1 : 1));
  const reg = webURL(ev.registration_url);
  return h('div.event',
    start ? h('div.event-date', h('strong', fmtDay(start, A(), { weekday: true })), ev.end_date ? ' – ' + fmtDay(ev.end_date, A()) : '') : null,
    ev.location ? h('div', '📍 ', primary(ev.location, A())) : null,
    mode ? h('div', '🖥 ', LA(mode[0], mode[1])) : null,
    ev.organisation ? h('div', '🏛 ', primary(ev.organisation, A())) : null,
    ev.theme ? h('div', '💬 ', primary(ev.theme, A())) : null,
    ev.cost ? h('div', '💲 ', primary(ev.cost, A())) : null,
    deadlines.map(([en, zh, d]) => h('div.deadline' + (daysUntil(d) >= 0 && daysUntil(d) <= 7 ? '.soon' : ''), '⏰ ', LA(en, zh), ': ', fmtDay(d, A()), ` (${relDays(d)})`)),
    reg ? link(reg, h('span.btn.primary', LA('Official registration page', '官方报名页面') + ' ↗')) : null);
}

/** For a paper without a DOI: a title search in each of the reader's institutions, then Google Scholar. */
function findLinks(title) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('library.institutions') || '[]'); } catch {}
  const enc = s => encodeURIComponent(s);
  return h('div.find-links',
    list.filter(i => i.link && i.link.includes('{title}')).map(i => {
      const u = webURL(i.link.trim().replace('{title}', enc(title)));
      const name = (i.name || '').trim() || L('my library', '学校图书馆');
      return u ? link(u, '🏛 ' + L(`Find in ${name}`, `在 ${name} 查找`)) : null;
    }),
    link('https://scholar.google.com/scholar?q=' + enc(title), '🔎 ' + L('Search Google Scholar', '在 Google Scholar 搜索')));
}

/** APA 7, enough for copying into notes; the Mac app has the other styles. */
function citation(a) {
  const authors = arr(a.authors);
  const fmt = n => {
    const parts = String(n).trim().split(/\s+/);
    if (parts.length < 2) return n;
    const last = parts.pop();
    return `${last}, ${parts.map(p => p[0].toUpperCase() + '.').join(' ')}`;
  };
  let who = authors.map(fmt);
  who = who.length > 1 ? who.slice(0, -1).join(', ') + ', & ' + who[who.length - 1] : who[0] || '';
  const year = (a.publication_date || a.date || '').slice(0, 4) || 'n.d.';
  const title = plain(bt(a.title).en);
  const journal = primary(a.publication, 'english');
  const doi = doiURL(a.doi) || webURL(a.url);
  if (!who && !journal && !doi) return title;
  let out = `${who ? who + ' ' : ''}(${year}). ${title}.`;
  if (journal) out += ` ${journal}${a.volume ? `, ${a.volume}` : ''}${a.issue ? `(${a.issue})` : ''}${a.pages ? `, ${a.pages}` : ''}.`;
  if (doi) out += ` ${doi}`;
  return out;
}

function quick(q) {
  const src = q.source;
  return [
    header({ kicker: [chip('📰 ' + LA('Quick scan', '快速浏览')), q.importance ? importanceBadge(q.importance, A()) : null],
      title: q.headline, meta: [q.category, q.location] }),
    actionsBar(q.id, { url: webURL(src?.url) }),
    textSec('Summary', '摘要', '📝', q.summary, q),
    textSec('Why it’s worth noting', '为什么值得留意', '📌', q.why_noting, q, 'accent'),
    src ? sourcesBlock([src]) : null,
  ];
}

const FOCUS_KIND = {
  news: ['News', '新闻'], paper: ['Journal article', '期刊论文'], review: ['Systematic / scoping review', '系统 / 范围综述'],
  report: ['Research report', '研究报告'], policy: ['Policy & law', '政策与法律'], advocacy: ['Advocacy', '倡议'],
  event: ['Event', '活动'], dataset: ['Data', '数据'], other: ['Item', '条目'],
};

function focusItem(f) {
  const it = f;
  const col = focusColumns().find(c => c.id === f.focus) || focusColumns()[0];
  const doi = doiURL(f.doi);
  const url = webURL(f.url) || doi || sourceSortedFirst(f.sources);
  const academicKind = ['paper', 'review', 'report', 'dataset'].includes(f.kind);
  const use = {
    literature_review: ['Literature review', '文献综述'], theory: ['Theory', '理论框架'], methodology: ['Methodology', '研究方法'],
    background: ['Background / context', '背景'], discussion: ['Discussion', '讨论'], policy_recommendations: ['Policy recommendations', '政策建议'], other: ['Other', '其他'],
  };
  const date = f.date_precision === 'month' && f.date ? parseDate(f.date.slice(0, 7)).toLocaleDateString(A() === 'chinese' ? 'zh-CN' : 'en-AU', { year: 'numeric', month: 'short' }) : f.date ? fmtDay(f.date, A()) : null;
  return [
    header({
      kicker: [chip(LA(...(FOCUS_KIND[f.kind] || FOCUS_KIND.other), ' ')), col ? chip('🎯 ' + primary(col.title, A())) : null, importanceBadge(f.importance || 'watching', A())],
      title: f.title,
      meta: [arr(f.authors).join(', '), primary(f.publication, A()), primary(f.institution, A()), date, f.region],
      tags: h('div', doi ? h('div', link(doi, 'DOI: ' + f.doi)) : null, academicKind && !doi ? findLinks(plain(bt(f.title).en)) : null,
        h('div.tags', regionChip(f.region), arr(f.themes).map(t => chip(primary(themeLabel(col, t), A()))))),
    }),
    image(f),
    actionsBar(f.id, { url, citation: academicKind ? citation(f) : null }),
    textSec('Summary', '摘要', '📝', f.summary, it),
    bulletSec('Key Points', '要点', '🔑', f.key_points, it, 'accent', '▸'),
    (f.methodology || f.sample) ? section('Study Design', '研究设计', '📐', 'indigo', h('div.design',
      [['Methodology', '研究方法', f.methodology], ['Sample', '样本', f.sample]].filter(x => bt(x[2]))
        .map(([en, zh, v]) => h('div.design-tile', h('div.pop-label', LA(en, zh)), biText(v, { item: ann(it) }))))) : null,
    bulletSec('Findings', '主要发现', '📊', f.findings, it, 'green', '→'),
    bulletSec('Limitations', '局限', '➖', f.limitations, it, 'pink', '−'),
    f.evidence_note ? section('What this evidence can and cannot show', '这项证据能说明什么、不能说明什么', '⚠️', 'orange', biText(f.evidence_note, { item: ann(it) })) : null,
    f.thesis_relevance ? section('Why it matters for your topic', '和你的课题有什么关系', '🎯', 'academic', biText(f.thesis_relevance, { item: ann(it) }),
      arr(f.thesis_use).length ? h('div.chips', arr(f.thesis_use).map(u => chip(LA(...(use[u] || use.other), ' ')))) : null) : null,
    bulletSec('Ideas you can use', '可以借鉴的思路', '💡', f.research_ideas, it, 'academic', '?'),
    f.event ? eventBlock(f.event) : null,
    sourcesBlock(f.sources),
    !url ? h('p.warn-note', '⚠️ ' + LA('No DOI or link was given — it couldn’t be verified', '没有提供 DOI 或链接，无法核实这篇内容')) : null,
  ];
}

function dataItem(d) {
  const it = d;
  return [
    header({ kicker: [chip('📊 ' + LA('Data Watch', '数据观察'))], title: d.title, meta: [primary(d.publisher, A()), primary(d.period, A()), d.region, d.date ? fmtDay(d.date, A()) : null] }),
    h('div.headline-num', h('div.big', d.headline_value || ''), biText(d.headline_label, { mode: A() })),
    actionsBar(d.id, { url: sourceSortedFirst(d.sources) }),
    textSec('Summary', '摘要', '📝', d.summary, it),
    arr(d.charts).map(chart),
    bulletSec('What the numbers mean', '数字说明了什么', '💡', d.meaning, it, 'blue'),
    bulletSec('Be careful about', '使用时要注意', '⚠️', d.caveats, it, 'orange'),
    textSec('Relevance', '相关性', '🎯', d.thesis_relevance, it, 'academic'),
    sourcesBlock(d.sources),
  ];
}

function chart(c) {
  const points = arr(c.points).filter(p => typeof p.value === 'number');
  if (!points.length) return null;
  const max = Math.max(...points.map(p => p.high ?? p.value), 0) || 1;
  const unit = c.unit || '';
  return h('figure.chart',
    c.title ? h('figcaption', h('strong', primary(c.title, A()))) : null,
    h('div.bars', points.map(p => h('div.bar-row' + (p.highlight ? '.hl' : ''),
      h('div.bar-label', primary(p.label, A()), p.group ? h('span.small', ' · ' + primary(p.group, A())) : null),
      h('div.bar-track', h('div.bar', { style: { width: Math.max(1, (p.value / max) * 100) + '%' } })),
      h('div.bar-val', `${p.value}${unit}`)))),
    c.note ? h('p.small', primary(c.note, A())) : null);
}

// MARK: Archive & read history

export function archiveView() {
  const page = h('div.page', h('h1.page-title', '🗂 ' + L('Archive', '归档', '  ')),
    h('div.seg', h('a.on', { href: '#/archive' }, L('Days', '按日期')), h('a', { href: '#/history' }, L('Read history', '已读记录'))));
  if (!store.briefs.length) { page.append(empty('🗂', 'Nothing archived yet.', '还没有归档。')); return page; }
  page.append(h('div.days', store.briefs.map(b => {
    const ids = [...b.top_stories, ...b.followups, ...b.academic_watch, ...b.quick_scan].map(x => x.id);
    const read = ids.filter(id => state.current.read.includes(id)).length;
    const lead = b.top_stories[0];
    return h('a.day-row', { href: '#/day/' + b.id },
      h('div.day-date', h('div.day-num', b.id.slice(8)), h('div.small', parseDate(b.id).toLocaleDateString(lang.brief === 'chinese' ? 'zh-CN' : 'en-AU', { month: 'short', weekday: 'short' }))),
      h('div.day-body', lead ? titleBlock(lead.title, 'h4') : h('h4', primary(b.edition) || b.id),
        h('div.small', L(`${ids.length} items · ${read} read`, `${ids.length} 条 · 已读 ${read}`))),
      h('div.day-progress', h('div', { style: { width: ids.length ? (read / ids.length) * 100 + '%' : '0' } })));
  })));
  return page;
}

export function historyView(params) {
  const page = h('div.page', h('h1.page-title', '✓ ' + L('Read history', '已读记录', '  ')),
    h('div.seg', h('a', { href: '#/archive' }, L('Days', '按日期')), h('a.on', { href: '#/history' }, L('Read history', '已读记录'))));
  const readAt = state.current.readAt;
  const byDay = new Map();
  // Only items still in the downloaded briefs (live headlines and old sample items have no page).
  for (const id of state.current.read.filter(id => item(id))) {
    const at = readAt[id] ? parseDate(readAt[id]) : null;
    const key = at ? dayKey(at) : '—';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ id, at });
  }
  const days = [...byDay.keys()].sort().reverse();
  const focusDay = params.get('day');
  if (focusDay) {
    // Opened from a brief's "已读" pill: that brief's items that were read.
    const b = brief(focusDay);
    if (b) {
      const ids = [...b.top_stories, ...b.followups, ...b.academic_watch, ...b.quick_scan].map(x => x.id).filter(id => state.current.read.includes(id));
      page.append(h('section.brief-sec', h('h2', L(`Read from the ${fmtDay(b.id)} brief`, `${fmtDay(b.id)} 晨报中已读的`)),
        ids.length ? h('div.cards', ids.map(id => item(id) ? card(item(id), { compact: true, showKind: true }) : null)) : empty('📭', 'Nothing read from this brief yet.', '这一期还没有读过的。')));
    }
  }
  if (!days.length) { page.append(empty('📖', 'Items you open are listed here.', '你读过的内容会列在这里。')); return page; }
  for (const d of days) {
    const list = byDay.get(d).sort((a, b) => (b.at || 0) - (a.at || 0));
    page.append(h('section.brief-sec', h('h2', d === '—' ? L('Earlier', '更早') : fmtDay(d, lang.brief, { weekday: true }), h('span.count', String(list.length))),
      h('div.cards', list.map(({ id, at }) => {
        const c = card(item(id), { compact: true, showKind: true, image: false });
        if (at) c.querySelector('.card-meta').append(h('span', fmtTime(at)));
        return c;
      }))));
  }
  return page;
}

export function savedView() {
  const page = h('div.page', h('h1.page-title', '★ ' + L('Saved', '收藏', '  ')));
  const ids = [...state.current.saved].sort((a, b) => (state.current.savedAt[b] || '').localeCompare(state.current.savedAt[a] || ''));
  if (!ids.length) { page.append(empty('☆', 'Tap ☆ Save on any item to keep it here.', '在任意条目点「☆ 收藏」，就会出现在这里。')); return page; }
  page.append(h('div.cards', ids.map(id => item(id) ? card(item(id), { compact: true, showKind: true, image: false }) : null)));
  return page;
}

export function focusView(colID, params) {
  const col = focusColumns().find(c => c.id === colID);
  const page = h('div.page');
  if (!col) { page.append(empty('🎯', 'This column isn’t in your profile.', '你的主题设置里没有这个专栏。')); return page; }
  const theme = params.get('theme');
  let list = focusItemsIn(col.id);
  const themes = [...new Set(list.flatMap(i => arr(i.themes)))];
  if (theme) list = list.filter(i => arr(i.themes).includes(theme));
  page.append(h('header.col-head', h('h1.page-title', '🎯 ' + primary(col.title)), col.subtitle ? h('p.small', primary(col.subtitle)) : null),
    themes.length ? h('div.chips', h('a.chip' + (!theme ? '.on' : ''), { href: '#/focus/' + col.id }, L('All', '全部')),
      themes.map(t => h('a.chip' + (theme === t ? '.on' : ''), { href: `#/focus/${col.id}?theme=${encodeURIComponent(t)}` }, primary(themeLabel(col, t))))) : null,
    list.length ? h('div.cards', list.map(i => card({ kind: 'focus', item: i }, { date: i.date, image: false }))) : empty('🎯', 'Nothing here yet.', '这里还没有内容。'));
  return page;
}

export function dataView() {
  const page = h('div.page', h('h1.page-title', '📊 ' + L('Data Watch', '数据观察', '  ')));
  page.append(store.dataItems.length ? h('div.cards', store.dataItems.map(d => card({ kind: 'data', item: d }, { date: d.date, image: false }))) : empty('📊', 'No data releases yet.', '还没有数据。'));
  return page;
}

export { itemTitle, config };
