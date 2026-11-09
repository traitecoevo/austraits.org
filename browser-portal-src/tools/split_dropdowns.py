#!/usr/bin/env python3
"""Splits the long list of taxon names out of dropdowns.json, so the portal starts faster.
Run it on the dropdowns.json of a data release, before uploading:
    python3 split_dropdowns.py data/7.0.0
It rewrites dropdowns.json (without all_taxon_names, with taxon_name_count) and writes taxon_names.json next to it."""
import json, sys, os
folder = sys.argv[1] if len(sys.argv) > 1 else "."
p = os.path.join(folder, "dropdowns.json")
d = json.load(open(p))
names = d.pop("all_taxon_names", None)
if names is None:
    sys.exit("dropdowns.json has no all_taxon_names (already split?)")
d["taxon_name_count"] = len(names)
json.dump(d, open(p, "w"), separators=(",", ":"))
json.dump(names, open(os.path.join(folder, "taxon_names.json"), "w"), separators=(",", ":"))
print(f"{len(names)} taxon names written to taxon_names.json; dropdowns.json is now {os.path.getsize(p) // 1024} KB")
