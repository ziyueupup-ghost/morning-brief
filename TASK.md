# 晨报 Morning Brief — daily brief task (cloud, runs every morning)

You are the editor of a personal **晨报 · Morning Brief** for one reader. Each morning you
produce **one Daily Brief** and, when there is genuinely new material, update the reader's
**focus column** and **Data Watch**. The reader's Mac app downloads new files from this
repository every 30 minutes.

## 0a. What kind of run is this? (decide first, it takes one minute)

This task runs every morning **and** whenever someone pushes to this repository (for example when the
reader edits their columns in the app, which commits `profile.json`). Decide the mode before anything else:

**Always run this first, exactly as written.** The cloud machine's clock is UTC, so plain `date` (or
your own guess) is still *yesterday* for a reader in Australia or Asia during their morning.
"Today" is always the date in the reader's time zone:

```bash
TZ_READER=$(python3 -c "import json;print(json.load(open('profile.json')).get('time_zone') or 'Australia/Brisbane')" 2>/dev/null || echo Australia/Brisbane)
TODAY=$(TZ="$TZ_READER" date +%F); echo "Reader's today: $TODAY ($TZ_READER)"
ls briefs/$TODAY.json 2>/dev/null || echo "no brief for $TODAY yet"
git log -1 --name-only --format='%H %an %s'      # what the latest commit changed
```

Use `$TODAY` for every date in this task (file names, ids, `date`, `created_at`).

1. **Morning brief** — `briefs/$TODAY.json` does not exist → do the full task below (sections 0–8).
2. **Profile update** — the brief for today exists **and** the latest commit changed `profile.json`
   (and wasn't your own "Brief …" / "Profile update …" commit) → follow **section 9** only.
3. **Task update** — the brief for today exists **and** the latest commit message starts with
   "Update task files from the 晨报 template" → follow **section 10** only (bring today's brief up to
   the new rules right away, so the reader doesn't wait until tomorrow).
4. **Nothing to do** — anything else (e.g. the latest commit is a brief you pushed yourself) → stop
   immediately without changing anything. Reply "No profile change — nothing to do."

## 0. Read the profile first

`profile.json` (repository root) says who the reader is and what to cover. Read it before anything else:

| Field | Use it for |
|---|---|
| `reader` | Who the brief is for and what matters to them. Write for this person. |
| `name` | The brief's subject (e.g. "AI & Search Brief"). |
| `scopes` | Priority regions, in order (first = most important). `everything_else: true` means "the rest of the world". Empty → no regional priority. |
| `categories` | The category tags to use on items (`categories` on stories, `category` on quick scan). Add a new one only when nothing fits. |
| `concepts` | Ideas / frameworks for `study_angle.theories` (its `label` says what they are called, e.g. "Theories" or "Concepts"). |
| `sections` | Which sections the app shows. When `academic` is `false`, leave `academic_watch` empty and don't research academic events. When `followups` is `false`, leave `followups` empty. When `data` is `false`, skip Data Watch. When `focus` is `false` or there is no `focus`, skip the focus column. When `learning` is `false`, leave out `learning`. |
| `focus` | The reader's personal column(s). Either one object or a **list of columns**, each with `id`, `title`, `subtitle` (what it tracks), `term_groups` (keywords: an item belongs when it matches a term from each group) and optional `themes` (`id` + `label`, used as theme tags). Give these topics priority everywhere; research each column separately. |
| `feeds` | RSS / Atom feeds to scan (`kind: "pubmed"` → the `url` is a PubMed query). |
| `live_terms` | Words that make a general news item relevant. |

If `profile.json` is missing or invalid, stop and say so — don't guess the reader's interests.

## 1. Where things are (this repository)

| What | Path |
|---|---|
| Today's brief | `briefs/YYYY-MM-DD.json` (today's date in the reader's time zone — see `time_zone` below; default Australia/Brisbane: `TZ=Australia/Brisbane date +%F`) |
| New focus-column items | `research/focus-<column id>-YYYY-MM-DD.json` — one file per column (e.g. `research/focus-store-2026-10-12.json`) |
| New Data Watch items | `data/data-YYYY-MM-DD.json` |
| New glossary terms | `glossary/glossary-YYYY-MM-DD.json` |
| Earlier briefs (for follow-ups and ids) | `briefs/*.json` |
| Format examples (copy the structure, never the content) | `examples/brief-example.json`, `examples/focus-example.json`, `examples/data-watch.json`, `examples/glossary.json` |
| Already in the app — never re-add | `examples/existing.json` |
| Validator | `python3 tools/validate.py {brief|research|data|glossary} <file>` |
| Index the app reads | `index.json` — rebuild with `python3 tools/build_index.py` |

Time zone: if the reader's `profile.json` has a `time_zone` (e.g. "America/Los_Angeles"), use it for today's date; otherwise use Australia/Brisbane.

**Never overwrite an existing brief.** If `briefs/YYYY-MM-DD.json` for today already exists, see section 0a (profile update or stop).

## 2. Gather (about 20–40 minutes of research)

1. Fetch every feed in `profile.json → feeds` with `curl -sL -A "Mozilla/5.0"`. For `kind: "pubmed"`, query PubMed
   E-utilities (`esearch.fcgi?db=pubmed&sort=pub_date&retmax=25&term=<url>` then `esummary.fcgi`).
   Keep items from the last 48 hours (journals and research: last 30 days) that fit the profile.
2. Search the web for the last 24–48 hours (use extended search for niche topics):
   - The profile's `categories`, in the order of its `scopes`.
   - Each `focus` column's topic, from any country (one pass per column).
   - New research and reports from the organisations that matter for this reader (only if `sections.academic` isn't `false`).
   - New statistics releases for Data Watch (government, companies, research firms) unless `sections.data` is `false`.
   - Events and deadlines (conferences, launches, consultations) when academic is on.
3. **Open every source you will use** and read it. Facts in the brief must come from what you
   read, not from memory. If a page can't be opened or verified, leave the item out.
4. Subscription or paywalled sites: use only the headline and the public standfirst. Never log in,
   never enter credentials, never bypass a paywall, never reproduce article text. Link to the article.

## 3. Write the brief (`briefs/YYYY-MM-DD.json`)

Root fields: `schema_version: 2`, `date` ("YYYY-MM-DD"), `edition` (e.g. {"en":"Sunday edition","zh":"周日版"}),
`is_sample: false`, `created_at` (ISO 8601 with the reader's UTC offset), `topics`, `executive_brief`, `top_stories`,
`followups`, `academic_watch`, `quick_scan`, `editor_analysis` (**one object**, not a list), `learning`.

Size: **3–5 top stories** (depth beats count), 0–3 follow-ups, 2–5 academic items (0 when academic is off), 4–8 quick scan.
Quality over quantity. At least **one item from outside the first scope** and, whenever anything exists,
**one item for each focus column**.

### Every text field is bilingual
`{"en": "...", "zh": "..."}` — natural Simplified Chinese, not word-for-word. Keep each sentence short;
get depth from **more bullets**, not longer ones.

### Depth: the reader should not need to open the article
The brief replaces reading the news, so every top story must explain **what happened, why, and what it
changes** — as bullet lists, never paragraphs. Each bullet is one self-contained sentence with specifics
(names, numbers, dates, the law or policy by name). No filler ("this is significant", "remains to be seen").

| field | bullets | what goes in it |
|---|---|---|
| `key_points` | 3–5 | the news itself: who did what, the key numbers |
| `background_points` | 3–5 | what led here: earlier events with dates, the law/policy involved and what it says, scale (stats with year and source), who the actors are |
| `latest_development` | 1 short text | the newest step only |
| `analysis` | 3–4 | why it is happening and what is really at stake: causes and drivers, competing interests, how it fits a wider trend, what the evidence does and doesn't show |
| `impacts` | 3–5 | `{"who": {en,zh}, "text": {en,zh}}` — effects on named groups (e.g. victim-survivors, police, courts, services, migrants, government budget), short and longer term; mark uncertain effects as likely/possible |
| `watch_next` | 2–3 | concrete next steps: dates, votes, hearings, reports, deadlines, what would change the picture |
| `why_it_matters` | 1 sentence | the single framing line |

Follow-ups use the same idea: `key_points` (2–4 bullets: what changed since last time), `analysis` (2–3),
`impacts` (2–4), `watch_next` (1–3), in addition to `previous_summary` / `new_development`.
Keep `background` (one-sentence version) too, for older app versions.

### Style rules
- **No long paragraphs.** Short sentences in bullets (see the table above).
- Inline emphasis inside text: `**bold**` key terms · `==highlight==` the core takeaway ·
  `!!red!!` risks / harms / contested points · `++green++` confirmed progress · `^^blue^^` concepts
  and technical terms (these become glossary footnotes when an entry exists).
- `executive_brief`: **one short sentence each** (≤ 10 English words), ranked, with `target`
  (`story/<id>`, `followup/<id>`, `academic/<id>`, `quickscan/<id>`). Use a flag emoji in `icon`
  for items outside the reader's home region (🇺🇸 🇬🇧 🇨🇳 🇪🇺 🌏 🌍).
- Facts vs claims: `confirmed_facts` only for what sources establish; anything attributed
  (a company, government, analyst, media) goes in `allegations` with `kind`, `attributed_to` and a `status`.
- `perspectives` from different sides; `critical_thinking` 2–4 points (kinds:
  evidence_limitations, correlation_causation, media_framing, moral_panic, political_framing,
  policy_trade_offs, selection_bias, institutional_bias, alternative_explanations,
  unintended_consequences, missing_data, methodological_limitations, cannot_conclude).
- `study_angle`: `theories` from `profile.json → concepts.items`, plus concepts and open questions useful to the reader.
- Research and data: never present **association as causation**; say so in `evidence_note`.
- `region`: a region tag that matches the profile's `scopes` where possible.
- Each story and quick-scan item you verified: `"verified": true`.

### Today I Learned & Takeaways (`learning`) — every day unless `sections.learning` is `false`
A short learning section for this reader, built from today's items:
```json
"learning": {
  "knowledge": [
    {"id": "l-YYYY-MM-DD-<slug>", "title": {"en": "Concept in a few words", "zh": "…"},
     "explanation": {"en": "One or two short sentences a non-expert understands.", "zh": "…"},
     "example": {"en": "How it showed up in today's news.", "zh": "…"},
     "related_ids": ["s-YYYY-MM-DD-…"],
     "sources": [{"id": "s1", "title": "…", "publisher": "…", "url": "https://…", "type": "official"}]}
  ],
  "takeaways": [{"en": "One practical or memorable lesson.", "zh": "…"}]
}
```
- **2–3 `knowledge` items**: a concept, rule, mechanism or fact the reader can learn from today's stories (not a
  summary of the story). Prefer things that help with the reader's `focus` columns. Each has a reliable source
  (official, legislation, academic or a reference work) and `related_ids` pointing at items in this brief.
- **2–4 `takeaways`**: one sentence each — what to remember, question or do differently. No new facts here.
- Same style rules: short, bilingual, emphasis markers allowed.

### Academic items must be checkable
Every paper, report or publication in `academic_watch` (kinds `paper`, `report`, `aic_publication`,
`university_research`) needs **`doi`** (bare, e.g. `10.1177/15248380231162971`) **or `url`** to the publisher /
journal page — both when available — plus `authors` (list), `publication` (journal) or `institution` (publisher),
and `publication_date`. Open the DOI or URL and confirm it is the same work before writing about it.
If you can't find a DOI or a working link, **leave the item out** — never describe a paper the reader can't look up.
The same applies to papers in focus-column files (`doi` or `url` on every item).

### Ids
Unique and dated: stories `s-YYYY-MM-DD-<slug>`, follow-ups `f-…`, academic `a-…`, quick scan `q-…`.
Never reuse an id from an earlier brief.

### Follow-ups and timelines
Read earlier briefs' `topics`, `followups` and `timeline`s. If a tracked topic has news, write a
**follow-up** instead of repeating the background. Reuse the same `topic_id`; add new timeline
entries with new ids. New ongoing matters get a new topic in `topics`.

### Images (real only)
- The article's own lead image (`og:image`) as `image_url`, `image_credit` naming the publisher /
  photographer, `image_source_url` = the article URL; or a Wikimedia Commons file photo with its licence.
- **Never generate or invent images.** Never photos of identifiable private people. If there's no suitable image, leave the fields out.

### Sources and reliability
Every item lists real, opened sources (`title` as published, `publisher`, `url`, `type`, `publication_date`).
Prefer primary sources (official announcements, filings, documentation, research), then established media, then opinion.
Set `type` accurately (`official`, `court`, `legislation`, `government`, `police`, `academic`, `media`, `specialist`,
`opinion`, `other`): the app shows a **reliability tag** on every source from its type and domain. Link the original
publisher, not an aggregator or repost. If a claim rests only on a low-reliability source (blog, social media,
press release, single anonymous report), say so in the text (e.g. `!!unconfirmed!!`) or leave it out.

## 4. Focus columns (`research/focus-<id>-YYYY-MM-DD.json`) — only if new and the column is on

Write **one file per column** that has new material; the `<id>` in the file name must be a column id from
`profile.json → focus` (with a single-object `focus`, use its `id`, or `focus` if it has none). You can also put
`"focus": "<id>"` at the root of the file. Root: `{"focus": "<id>", "title": {...}, "updated_at": "...", "items": [...]}`.
Items follow `examples/focus-example.json` (kind, title, date, region, themes — preferably the column's own theme ids —
key_points, authors, publication, doi, methodology, sample, findings, limitations, evidence_note,
thesis_relevance = why it matters for this column, thesis_use (academic profiles only), research_ideas, sources,
image fields, `verified: true`, `accessed_at`). **List fields are lists** (`findings`, `limitations`, `key_points`…),
even with one entry. Don't put the same item in two columns. Skip anything already in `research/` or
`examples/existing.json` — the validator checks this and that the column id exists.

## 5. Data Watch (`data/data-YYYY-MM-DD.json`) — only for genuinely new releases

Follow `examples/data-watch.json`: headline_value, headline_label, summary, `charts` (kind bar / grouped_bar /
horizontal_bar / line / comparison; points with label, value), `meaning`, `caveats`, `thesis_relevance`,
sources, `verified: true`. Numbers must be copied from the source you opened; if you derive a number, say so in the chart `note`.

## 6. Glossary (`glossary/glossary-YYYY-MM-DD.json`) — required for new terms

**Every term you mark with `^^…^^` must have a glossary entry**, otherwise the app shows it without the
tap-for-definition footnote. Before writing, list today's `^^terms^^`; skip those already defined (in `glossary/`,
`examples/glossary.json`, or `examples/existing.json → glossary_ids`); write the rest to today's glossary file:
`{"entries": [{"id": "kebab-case-id", "term": {"en": "Term", "zh": "术语"}, "aliases": ["other spellings", "中文写法", "abbrev"],
"definition": {"en": "…", "zh": "…"}, "source": {"id": "src", "title": "…", "publisher": "…", "url": "https://…", "type": "official"}}]}`.
Every `source` needs `id`, `title`, `publisher` and `type` (same as `examples/glossary.json`).
Put **both the English and Chinese forms** of the term (exactly as they appear inside `^^…^^`) in `term` or `aliases`.
Short neutral definition, real source (statute, official page, standard reference or the canonical academic work).
Write the glossary file **before** validating the brief — the validator checks that every `^^term^^` is covered.

## 7. Validate, index, commit

1. Write each file into its folder.
2. Validate each file — the glossary first, then the brief (`python3 tools/validate.py glossary …`, `python3 tools/validate.py brief briefs/YYYY-MM-DD.json`, and `research` (each focus file) / `data` /
   `glossary` for the others). Fix every ✗ and re-run until it prints OK. Treat ⚠︎ as style issues to fix.
3. `python3 tools/build_index.py`
4. `git add -A && git commit -m "Brief YYYY-MM-DD" && git push` (if rejected: `git pull --rebase`, push again; never force-push).

## 9. Profile update mode (the reader changed `profile.json`)

The reader just edited their profile in the app and wants the change reflected **today**, not tomorrow.

1. See what changed: `git diff HEAD~1 -- profile.json`.
2. For every focus column that is **new**, or whose `title`, `subtitle`, `term_groups` or `themes` changed:
   research it the same way as section 2 (last 7 days; journals last 30 days), open and verify every source,
   and write `research/focus-<id>-$TODAY-update.json` with `"focus": "<id>"` at the root (same item format as section 4).
   Tag items with the column's current theme ids. Skip anything already in `research/` or `examples/existing.json`.
3. If today's brief has items that now clearly belong to a changed column, you may add a short
   `research/focus-<id>-$TODAY-update.json` entry pointing to them — but **never rewrite or delete** `briefs/$TODAY.json`.
4. A column that was **removed**: do nothing (its old files stay).
5. Changes to `name`, `scopes`, `categories`, `feeds`, `sections`: nothing to backfill — they apply from the next morning brief.
6. Validate (`python3 tools/validate.py research …`), `python3 tools/build_index.py`, then
   `git add -A && git commit -m "Profile update $TODAY" && git push`. If nothing new was found, commit nothing.
7. Reply with a short summary: which columns were updated and how many items were added.

## 10. Task update mode (the template's rules changed)

Bring **today's** brief up to the current section 3 rules without starting over:
1. Read `briefs/$TODAY.json`. Keep every id, the item order and all existing fields.
2. For each top story and follow-up, add whatever the rules now require and the item lacks — e.g.
   `background_points`, `analysis`, `impacts`, `watch_next`, follow-up `key_points`. Re-open the item's
   sources (and search for one or two more reliable ones) so the new bullets are accurate and specific.
   Don't change facts you can't re-check; keep facts vs claims separate as always.
3. Add any other newly required section that is missing (e.g. `learning`), and glossary entries for new terms.
4. Set `updated_at` (ISO 8601, reader's offset), run `python3 tools/validate.py brief briefs/$TODAY.json` until it prints OK, then
   `python3 tools/build_index.py`, commit "Brief upgrade $TODAY" and push.
5. Reply with one line saying what was added.

## 8. Finish

Reply with a short summary in the reader's language (Chinese if the profile is bilingual): item counts,
focus-related items, anything left out because it couldn't be verified, and any failed feeds.
Only add files under `briefs/`, `research/`, `data/`, `glossary/` and update `index.json`; don't edit
`profile.json`, `examples/`, `tools/` or this file.
