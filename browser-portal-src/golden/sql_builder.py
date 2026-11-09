# NOTE: reference implementation of the ORIGINAL (Shiny) filter logic, kept so the golden cases can be regenerated.
# The file paths near the top point to the original author's machine and the full 7.0.0 download; change them to your own folders before running.
"""Reference filter-to-SQL builder, written from data/7.0.0/filter_spec.json.
The browser's toSql (TypeScript) must give the same answers for every golden case."""
import re, json
SPEC = json.load(open("/home/claude/portal-build/data/7.0.0/filter_spec.json"))
CUSTOM = next(f for f in SPEC["filters"] if f["id"] == "custom")
VOCAB = CUSTOM["controlled_vocabulary_columns"]

def esc_regex(x):  # characters listed in filter_spec.regex_escape_characters
    return re.sub(r'([\]\[{}()+*^$|\\?.])', r'\\\1', x)
def lit(x):  return "'" + str(x).replace("'", "''") + "'"
def inlist(vals): return "(" + ", ".join(lit(v) for v in vals) + ")"
def q(col): return '"' + col.replace('"', '""') + '"'

def build_where(state, trait_features):
    """state: dict with keys dataset ('raw'|'species') and optional filter inputs. Returns list of SQL conditions."""
    ds = state["dataset"]; w = []
    # trait features / trait names -> list of traits
    tr = None
    keys = ("trait_name", "trait_grouping", "structure_measured", "keywords")
    if any(state.get(k) for k in keys):
        tr = [t["trait"] for t in trait_features]
        if state.get("trait_grouping"): tr = [t["trait"] for t in trait_features if t["trait_group"] in state["trait_grouping"]]
        def has_any(field, terms): return lambda t: any(term in (t[field] or "") for term in terms)
        if state.get("structure_measured"):
            ok = {t["trait"] for t in trait_features if has_any("structure_measured", state["structure_measured"])(t)}
            tr = [t for t in tr if t in ok]
        if state.get("keywords"):
            ok = {t["trait"] for t in trait_features if has_any("keywords", state["keywords"])(t)}
            tr = [t for t in tr if t in ok]
        if state.get("trait_name"): tr = [t for t in tr if t in state["trait_name"]]
    if tr is not None:
        w.append("trait_name IN " + inlist(tr) if tr else "FALSE")
    tt = state.get("taxon_type")
    if tt in ("family", "genus", "taxon_name") and state.get(tt):
        w.append(f"{tt} IN " + inlist(state[tt]))
    for k in ("basis_of_record", "life_stage"):
        if state.get(k) and ds == "raw": w.append(f"{k} IN " + inlist(state[k]))
    loc = state.get("location")
    if loc == "georeferenced" and ds == "raw":
        w.append('"latitude (deg)" IS NOT NULL AND "longitude (deg)" IS NOT NULL')
        for k, col, op in (("min_latitude","latitude (deg)",">="),("max_latitude","latitude (deg)","<="),
                           ("min_longitude","longitude (deg)",">="),("max_longitude","longitude (deg)","<=")):
            if state.get(k) is not None: w.append(f"{q(col)} {op} {float(state[k])!r}")
    if loc == "apc" and state.get("apc_taxon_distribution"):
        w.append("regexp_matches(taxon_distribution, " + lit("|".join(esc_regex(v) for v in state["apc_taxon_distribution"])) + ")")
    for cf in state.get("custom", []):
        col, vals = cf["column"], cf["value"]
        if col in VOCAB:
            if col == "dataset_id" and ds == "species":
                w.append(f"regexp_matches({q(col)}, " + lit("(^|; )(" + "|".join(esc_regex(v) for v in vals) + ")(;|$)") + ")")
            else:
                w.append(f"{q(col)} IN " + inlist(vals))
        else:
            parts = [p.strip() for p in "|".join(vals).lower().split("|") if p.strip()]
            if parts:
                w.append(f"regexp_matches(lower({q(col)}), " + lit("|".join(esc_regex(p) for p in parts)) + ")")
    return w
