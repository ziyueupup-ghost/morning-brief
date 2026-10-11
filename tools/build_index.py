#!/usr/bin/env python3
"""Rebuild index.json (the list the app downloads). Run after adding files."""
import hashlib, json, os, glob
from datetime import datetime, timezone
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = []
for folder in ("briefs", "research", "data", "glossary"):
    for f in sorted(glob.glob(os.path.join(ROOT, folder, "*.json"))):
        files.append({"path": os.path.relpath(f, ROOT), "sha256": hashlib.sha256(open(f, "rb").read()).hexdigest()})
json.dump({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "files": files},
          open(os.path.join(ROOT, "index.json"), "w"), indent=2)
print(f"index.json: {len(files)} files")
