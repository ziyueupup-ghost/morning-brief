#!/usr/bin/env python3
"""Validate 晨报 files before committing (focus files are checked against profile.json's columns).

Usage:
  python3 tools/validate.py brief    briefs/2026-10-11.json
  python3 tools/validate.py research research/phd-watch-2026-10-11.json
  python3 tools/validate.py data     data/data-2026-10-11.json
  python3 tools/validate.py glossary glossary/glossary-2026-10-11.json

Mirrors the app's decoder: missing required fields or bad types make the app reject the file.
Exits 1 on any error.
"""
import glob, json, os, re, sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORTANCE = {"critical", "important", "watching", "background"}
errors, warnings = [], []

def err(path, msg): errors.append(f"✗ {path}: {msg}")
def warn(path, msg): warnings.append(f"⚠︎ {path}: {msg}")

def is_btext(v):
    if isinstance(v, str): return bool(v.strip())
    return isinstance(v, dict) and isinstance(v.get("en", v.get("zh")), str) and bool((v.get("en") or v.get("zh") or "").strip())

def bilingual(v): return isinstance(v, dict) and v.get("en") and v.get("zh")

def date_ok(v):
    if not isinstance(v, str): return False
    try:
        if len(v) == 10: datetime.strptime(v, "%Y-%m-%d")
        else: datetime.fromisoformat(v.replace("Z", "+00:00"))
        return True
    except ValueError: return False

def url_ok(v): return isinstance(v, str) and re.match(r"^https?://[^\s]+\.[^\s]+", v) is not None

def need(obj, path, fields):
    for f, kind in fields:
        v = obj.get(f)
        if v is None: err(path, f"missing '{f}'"); continue
        checks = {"str": lambda: isinstance(v, str) and v.strip() != "", "text": lambda: is_btext(v), "date": lambda: date_ok(v),
                  "imp": lambda: isinstance(v, str) and v in IMPORTANCE, "list": lambda: isinstance(v, list),
                  "num": lambda: isinstance(v, (int, float)) and not isinstance(v, bool)}
        ok = checks[kind]()
        if not ok: err(path, f"'{f}' has the wrong type/value: {str(v)[:60]}")

def texts_bilingual(obj, path, fields):
    for f in fields:
        v = obj.get(f)
        if v is not None and isinstance(v, (str, dict)) and not bilingual(v):
            warn(path, f"'{f}' should be bilingual {{en, zh}}")

def check_sources(obj, path, required=True):
    srcs = obj.get("sources") or []
    if required and not srcs: err(path, "no sources")
    for i, s in enumerate(srcs):
        p = f"{path}.sources[{i}]"
        need(s, p, [("id", "str"), ("title", "str"), ("publisher", "str"), ("type", "str")])
        if s.get("url") and not url_ok(s["url"]): err(p, f"bad url {s['url']}")

def check_image(obj, path):
    if obj.get("image_url"):
        if not url_ok(obj["image_url"]): err(path, "bad image_url")
        if not obj.get("image_credit"): err(path, "image_url without image_credit (credit every image)")
        if not obj.get("image_source_url"): warn(path, "image without image_source_url")

def existing_ids(kind):
    ids = set()
    pats = {"brief": ["briefs/*.json", "examples/brief-example.json"], "research": ["research/*.json", "examples/focus-example.json"],
            "data": ["data/*.json", "examples/data-watch.json"], "glossary": ["glossary/*.json", "examples/glossary.json"]}[kind]
    for pat in pats:
        for f in glob.glob(os.path.join(ROOT, pat)):
            try: d = json.load(open(f))
            except Exception: continue
            if kind == "brief":
                for k in ("top_stories", "followups", "academic_watch", "quick_scan"):
                    ids |= {x.get("id") for x in d.get(k, [])}
            else:
                ids |= {x.get("id") for x in d.get("items" if kind != "glossary" else "entries", [])}
            ids.add(("file", os.path.abspath(f)))
    # Items already in the app (examples/existing.json): ids, plus DOIs / URLs / titles for feeds.
    try:
        ex = json.load(open(os.path.join(ROOT, "examples", "existing.json")))
        if kind == "brief": ids |= set(ex.get("brief_item_ids", []))
        if kind == "research": ids |= {x["id"] for x in ex.get("phd_watch", [])}
        if kind == "data": ids |= {x["id"] for x in ex.get("data_watch", [])}
        if kind == "glossary": ids |= set(ex.get("glossary_ids", []))
        global KNOWN_KEYS
        rows = ex.get("phd_watch", []) if kind == "research" else ex.get("data_watch", []) if kind == "data" else []
        KNOWN_KEYS = {norm(x.get(k)) for x in rows for k in ("doi", "url", "title") if x.get(k)}
    except FileNotFoundError:
        pass
    return ids

KNOWN_KEYS = set()
LIST_FIELDS = ("themes", "key_points", "authors", "findings", "limitations", "thesis_use", "research_ideas", "sources", "charts", "meaning", "caveats")

def norm(v): return re.sub(r"[^a-z0-9]", "", str(v).lower())

def profile_columns():
    """Column ids from profile.json → focus (one object or a list). None when there's no profile."""
    try: prof = json.load(open(os.path.join(ROOT, "profile.json")))
    except Exception: return None
    f = prof.get("focus")
    if f is None: return []
    cols = f if isinstance(f, list) else [f]
    return [c.get("id") or "focus" for c in cols if isinstance(c, dict)]

def profile_sections():
    try: return json.load(open(os.path.join(ROOT, "profile.json"))).get("sections") or {}
    except Exception: return {}

def tnorm(v):
    """Term key for glossary matching: lower-case, no spaces / hyphens / dots (keeps Chinese)."""
    return re.sub(r"[\s\-_·•.．'’]+", "", str(v).lower())

def glossary_keys():
    """Every id, term and alias already defined (repo glossary files, the example, and existing.json)."""
    keys = set()
    for f in glob.glob(os.path.join(ROOT, "glossary", "*.json")) + [os.path.join(ROOT, "examples", "glossary.json")]:
        try: entries = json.load(open(f)).get("entries", [])
        except Exception: continue
        for e in entries:
            keys.add(tnorm(e.get("id", "")))
            t = e.get("term")
            for v in ([t.get("en"), t.get("zh")] if isinstance(t, dict) else [t]) + list(e.get("aliases") or []):
                if v: keys.add(tnorm(v))
    try: keys |= {tnorm(i) for i in json.load(open(os.path.join(ROOT, "examples", "existing.json"))).get("glossary_ids", [])}
    except Exception: pass
    keys.discard("")
    return keys

def concept_terms(obj, lang="en"):
    """All ^^term^^ markers in the English (or Chinese) text of a brief."""
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == lang and isinstance(v, str): out += re.findall(r"\^\^(.+?)\^\^", v)
            else: out += concept_terms(v, lang)
    elif isinstance(obj, list):
        for v in obj: out += concept_terms(v, lang)
    return out

def column_of(path, d):
    """research/focus-<id>-YYYY-MM-DD.json, or a root "focus" field."""
    if d.get("focus"): return d["focus"]
    m = re.match(r"^(?:cloud-)?focus-(.+)-\d{4}-\d{2}-\d{2}\.json$", os.path.basename(path))
    return m.group(1) if m else None

def validate_brief(d, path):
    need(d, path, [("date", "date")])
    if d.get("is_sample") is True: err(path, "is_sample must be false for real briefs")
    for f in ("topics", "executive_brief", "top_stories", "followups", "academic_watch", "quick_scan"):
        if f in d and not isinstance(d[f], list): err(path, f"'{f}' must be a list")
    ea = d.get("editor_analysis")
    if ea is not None and not isinstance(ea, dict):
        err(path, "'editor_analysis' must be ONE object {title, theme, paragraphs, related_ids} — not a list; merge several analyses into one")
    elif isinstance(ea, dict) and not isinstance(ea.get("paragraphs", []), list):
        err(path, "'editor_analysis.paragraphs' must be a list")
    lr = d.get("learning")
    if lr is None:
        if profile_sections().get("learning", True) is not False: warn(path, "no 'learning' section (Today I Learned & Takeaways) — add 2–3 knowledge items and 2–4 takeaways")
    elif not isinstance(lr, dict) or not isinstance(lr.get("knowledge", []), list) or not isinstance(lr.get("takeaways", []), list):
        err(path, "'learning' must be ONE object {knowledge: [...], takeaways: [...]}")
    else:
        for j, k in enumerate(lr.get("knowledge", [])):
            need(k, f"learning.knowledge[{j}]", [("id", "str"), ("title", "text"), ("explanation", "text")])
            check_sources(k, f"learning.knowledge[{j}]", required=False)
        if not 1 <= len(lr.get("knowledge", [])) <= 4: warn(path, "learning.knowledge should have 2–3 items")
        if not 1 <= len(lr.get("takeaways", [])) <= 5: warn(path, "learning.takeaways should have 2–4 items")
        for j, t in enumerate(lr.get("takeaways", [])):
            if not is_btext(t): err(path, f"learning.takeaways[{j}] must be {{en, zh}} text")
    known_terms = glossary_keys()
    missing = sorted({t for t in concept_terms(d) if tnorm(t) not in known_terms})
    if missing:
        err(path, f"^^terms^^ without a glossary entry: {', '.join(missing[:10])} — add them (with their Chinese form in aliases) to glossary/glossary-YYYY-MM-DD.json, validate it, then re-run this")
    ids = []
    for i, s in enumerate(d.get("top_stories", [])):
        p = f"top_stories[{i}]"
        need(s, p, [("id", "str"), ("title", "text"), ("published_at", "date"), ("region", "str"), ("importance", "imp"), ("summary", "text")])
        texts_bilingual(s, p, ["title", "summary", "subtitle", "why_it_matters", "background", "latest_development"])
        if len(s.get("key_points", [])) < 3: warn(p, "fewer than 3 key_points")
        for f in ("key_points", "categories", "confirmed_facts", "allegations", "perspectives", "critical_thinking", "timeline", "sources"):
            if f in s and not isinstance(s[f], list): err(p, f"'{f}' must be a list")
        check_sources(s, p); check_image(s, p)
        for j, c in enumerate(s.get("allegations", [])): need(c, f"{p}.allegations[{j}]", [("id", "str"), ("kind", "str"), ("text", "text")])
        for j, c in enumerate(s.get("perspectives", [])): need(c, f"{p}.perspectives[{j}]", [("id", "str"), ("speaker", "text"), ("role", "str"), ("summary", "text")])
        for j, c in enumerate(s.get("critical_thinking", [])): need(c, f"{p}.critical_thinking[{j}]", [("id", "str"), ("kind", "str"), ("discussion", "text")])
        for j, t in enumerate(s.get("timeline", [])): need(t, f"{p}.timeline[{j}]", [("id", "str"), ("date", "date"), ("title", "text")])
        ids.append(s.get("id"))
    for i, f in enumerate(d.get("followups", [])):
        p = f"followups[{i}]"
        need(f, p, [("id", "str"), ("topic_id", "str"), ("title", "text"), ("region", "str"), ("importance", "imp"),
                    ("previous_summary", "text"), ("new_development", "text"), ("assessment", "str")])
        for j, t in enumerate(f.get("timeline", [])): need(t, f"{p}.timeline[{j}]", [("id", "str"), ("date", "date"), ("title", "text")])
        check_sources(f, p); ids.append(f.get("id"))
    for i, a in enumerate(d.get("academic_watch", [])):
        p = f"academic_watch[{i}]"
        need(a, p, [("id", "str"), ("title", "text"), ("kind", "str"), ("region", "str"), ("summary", "text")])
        ids.append(a.get("id"))
    for i, q in enumerate(d.get("quick_scan", [])):
        p = f"quick_scan[{i}]"
        need(q, p, [("id", "str"), ("headline", "text"), ("summary", "text"), ("category", "str"), ("location", "str")])
        if q.get("source"): check_sources({"sources": [q["source"]]}, p)
        else: err(p, "no source")
        ids.append(q.get("id"))
    for i, e in enumerate(d.get("executive_brief", [])):
        p = f"executive_brief[{i}]"
        need(e, p, [("id", "str"), ("importance", "imp"), ("text", "text")])
        t = (e.get("target") or "").split("/", 1)
        if len(t) == 2 and t[1] not in ids: err(p, f"target {e.get('target')} not found in this brief")
        en = e.get("text", {}).get("en", "") if isinstance(e.get("text"), dict) else e.get("text", "")
        if len(re.sub(r"[*=!+^]", "", en).split()) > 12: warn(p, "executive_brief should be one short sentence (≤ 10 words)")
    if isinstance(lr, dict):
        for j, k in enumerate(lr.get("knowledge", []) if isinstance(lr.get("knowledge"), list) else []):
            for rid in k.get("related_ids", []) or []:
                if rid not in ids: err(f"learning.knowledge[{j}]", f"related id {rid} not found in this brief")
    return ids

def main():
    if len(sys.argv) < 3 or sys.argv[1] not in {"brief", "research", "data", "glossary"}:
        print(__doc__); sys.exit(2)
    kind, files = sys.argv[1], sys.argv[2:]
    known = existing_ids(kind)
    for path in files:
        try: d = json.load(open(path))
        except Exception as e: err(path, f"not valid JSON: {e}"); continue
        if kind == "brief":
            ids = validate_brief(d, path)
        elif kind in ("research", "data"):
            items = d.get("items")
            if not isinstance(items, list) or not items: err(path, "needs a non-empty 'items' list"); continue
            if kind == "research":
                cols = profile_columns()
                col = column_of(path, d)
                if cols is not None:
                    if not cols: err(path, "profile.json has no focus column — don't write focus files")
                    elif col is None and len(cols) > 1:
                        err(path, f"several focus columns {cols}: name the file research/focus-<id>-YYYY-MM-DD.json or add a root \"focus\"")
                    elif col is not None and col not in cols:
                        err(path, f"column '{col}' is not in profile.json focus ids {cols}")
                    for i, it in enumerate(items):
                        if it.get("focus") and it["focus"] not in cols: err(f"items[{i}]", f"focus '{it['focus']}' is not a column in profile.json")
            ids = []
            for i, it in enumerate(items):
                p = f"items[{i}]"
                if kind == "research":
                    need(it, p, [("id", "str"), ("kind", "str"), ("title", "text"), ("date", "date"), ("region", "str"), ("summary", "text")])
                else:
                    need(it, p, [("id", "str"), ("title", "text"), ("date", "date"), ("region", "str"), ("publisher", "text"),
                                 ("headline_value", "str"), ("headline_label", "text"), ("summary", "text")])
                    if not it.get("charts"): err(p, "no charts")
                    for j, c in enumerate(it.get("charts", [])):
                        for k, pt in enumerate(c.get("points", [])): need(pt, f"{p}.charts[{j}].points[{k}]", [("label", "text"), ("value", "num")])
                for f in LIST_FIELDS:
                    if f in it and not isinstance(it[f], list): err(p, f"'{f}' must be a list (use [ {{\"en\": …, \"zh\": …}} ])")
                if it.get("verified") is not True: err(p, "verified must be true")
                keys = {norm(it.get("doi")), norm((it.get("title") or {}).get("en") if isinstance(it.get("title"), dict) else it.get("title"))}
                keys |= {norm(s.get("url")) for s in it.get("sources", []) if s.get("url")}
                if KNOWN_KEYS & (keys - {norm(None), ""}): err(p, "already in the app (same DOI, URL or title) — see examples/existing.json")
                check_sources(it, p); check_image(it, p); ids.append(it.get("id"))
        else:
            ids = []
            for i, e in enumerate(d.get("entries", [])):
                p = f"entries[{i}]"
                need(e, p, [("id", "str"), ("term", "text"), ("definition", "text")])
                if not isinstance(e.get("source"), dict): err(p, "missing source")
                ids.append(e.get("id"))
        same_file = ("file", os.path.abspath(path)) in known
        for i in ids:
            if ids.count(i) > 1: err(path, f"duplicate id {i}")
            if not same_file and i in known: err(path, f"id {i} already used in an earlier file")
    for w in warnings: print(w)
    for e in errors: print(e)
    print("OK" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
