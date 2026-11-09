# NOTE: reference implementation of the ORIGINAL (Shiny) filter logic, kept so the golden cases can be regenerated.
# The file paths near the top point to the original author's machine and the full 7.0.0 download; change them to your own folders before running.
"""Runs every golden case: compares the independent pandas oracle with SQL (built from filter_spec) on the new data files."""
import duckdb, json, hashlib, re, sys, random, pandas as pd
sys.path.insert(0, "/home/claude/portal-build/golden")
from sql_builder import build_where, VOCAB
SRC = "/mnt/user-data/uploads/austraits-7.0.0-full"; NEW = "/home/claude/portal-build/data/7.0.0"
con = duckdb.connect()
con.sql("set memory_limit='2GB'")
G = "regexp_replace(genus, '^[(]', '') AS genus"
LL = '''TRY_CAST("latitude (deg)" AS DOUBLE) AS "latitude (deg)", TRY_CAST("longitude (deg)" AS DOUBLE) AS "longitude (deg)"'''
ID_RAW = ["trait_name","taxon_name","dataset_id","observation_id","value"]
ID_SP = ["trait_name","taxon_name","dataset_id","value_type","value_mean"]
FILT_RAW = ["family","genus","taxon_name","trait_name","basis_of_record","life_stage","taxon_distribution"] + VOCAB + \
  ["collection_date","measurement_remarks","location_name","location_properties","treatment_context_properties","plot_context_properties",
   "entity_context_properties","temporal_context_properties","method_context_properties","source_primary_citation","data_contributors"]
need = sorted(set(ID_RAW + FILT_RAW) - {"source_primary_citation"} | {"latitude (deg)","longitude (deg)","observation_id","row_id"})
# ORACLE data: original server files, loaded into pandas (not DuckDB SQL logic)
HEAVY = {"measurement_remarks","location_properties","treatment_context_properties","plot_context_properties","entity_context_properties",
         "temporal_context_properties","method_context_properties","data_contributors","collection_date","location_name","original_name","source_primary_citation"}
class Frame:
    """Columns load on demand from the ORIGINAL server file; heavy text columns are not kept."""
    def __init__(self, path, repl):
        self.path, self.repl, self.cache = path, repl, {}
        self.columns = [r[0] for r in con.sql(f"describe select * from '{path}'").fetchall()]
        self.n = con.sql(f"select count(*) from '{path}'").fetchall()[0][0]
        self.index = pd.RangeIndex(self.n)
    def __getitem__(self, col):
        if col in self.cache: return self.cache[col]
        ser = con.sql(f'select "{col}" from (select * replace ({self.repl}) from \'{self.path}\')').df()[col]
        if col not in HEAVY: self.cache[col] = ser
        return ser
    def rows(self, m, ids):
        return pd.DataFrame({c: self[c][m].reset_index(drop=True).fillna('').astype(str) for c in ids})
raw = Frame(f"{SRC}/austraits-data.parquet", f"{G}, {LL}")
sp  = Frame(f"{SRC}/austraits-species-averages.parquet", G)
tf = pd.read_csv("/home/claude/portal-build/work/trait_features.csv", dtype=str, keep_default_na=False)
tfeat = tf.rename(columns={"trait_group":"trait_group"}).to_dict("records")
for t in tfeat:
    for k in ("structure_measured","keywords"): t[k] = t[k] or ""

def keyset(df, ids):
    s = df[ids].astype(str).agg("\x1f".join, axis=1) if len(df) else pd.Series([], dtype=str)
    return len(df), hashlib.md5("\x1e".join(sorted(s)).encode()).hexdigest()

def oracle(state):
    df = raw if state["dataset"] == "raw" else sp
    m = pd.Series(True, index=df.index)
    keys = ("trait_name","trait_grouping","structure_measured","keywords")
    if any(state.get(k) for k in keys):
        ok = set(tf["trait"])
        if state.get("trait_grouping"): ok = {t["trait"] for t in tfeat if t["trait_group"] in state["trait_grouping"]}
        if state.get("structure_measured"): ok &= {t["trait"] for t in tfeat if any(x in t["structure_measured"] for x in state["structure_measured"])}
        if state.get("keywords"): ok &= {t["trait"] for t in tfeat if any(x in t["keywords"] for x in state["keywords"])}
        if state.get("trait_name"): ok &= set(state["trait_name"])
        m &= df["trait_name"].isin(ok)
    tt = state.get("taxon_type")
    if tt in ("family","genus","taxon_name") and state.get(tt): m &= df[tt].isin(state[tt])
    for k in ("basis_of_record","life_stage"):
        if state.get(k) and state["dataset"] == "raw": m &= df[k].isin(state[k])
    if state.get("location") == "georeferenced" and state["dataset"] == "raw":
        la, lo = df["latitude (deg)"], df["longitude (deg)"]
        m &= la.notna() & lo.notna()
        if state.get("min_latitude") is not None: m &= la >= state["min_latitude"]
        if state.get("max_latitude") is not None: m &= la <= state["max_latitude"]
        if state.get("min_longitude") is not None: m &= lo >= state["min_longitude"]
        if state.get("max_longitude") is not None: m &= lo <= state["max_longitude"]
    if state.get("location") == "apc" and state.get("apc_taxon_distribution"):
        vals = state["apc_taxon_distribution"]
        m &= df["taxon_distribution"].fillna("").map(lambda s: any(v in s for v in vals))   # literal substring, no regex
    for cf in state.get("custom", []):
        col, vals = cf["column"], cf["value"]
        if col in VOCAB:
            if col == "dataset_id" and state["dataset"] == "species":
                m &= df[col].fillna("").map(lambda s: any(v in [x for x in s.split("; ")] for v in vals))
            else: m &= df[col].isin(vals)
        else:
            parts = [p.strip() for p in "|".join(vals).lower().split("|") if p.strip()]
            if parts: m &= df[col].fillna("").str.lower().map(lambda s: any(p in s for p in parts))   # literal substring
    return keyset(df.rows(m, ID_RAW if state["dataset"] == "raw" else ID_SP), ID_RAW if state["dataset"] == "raw" else ID_SP)

# NEW data views: raw = trait-sorted file joined to taxa; species = species file
con.sql(f"""create view tx as select * from '{NEW}/taxa.parquet'""")
con.sql(f"""create view raw_new as select r.*, t.* exclude (taxon_name, family, genus), sc.source_primary_citation from '{NEW}/raw_by_trait.parquet' r join tx t using (taxon_name) left join '{NEW}/dataset_citations.parquet' sc using (dataset_id)""")
con.sql(f"""create view raw_new2 as select r.* exclude (family, genus), t.* exclude (taxon_name) from '{NEW}/raw_by_taxon.parquet' r join tx t using (taxon_name)""") if False else None
con.sql(f"create view sp_new as select s.*, t.* exclude (taxon_name, family, genus) from '{NEW}/species_averages.parquet' s join tx t using (taxon_name)")

def new_keyset(state):
    view = "raw_new" if state["dataset"] == "raw" else "sp_new"
    w = build_where(state, tfeat); where = (" WHERE " + " AND ".join(f"({x})" for x in w)) if w else ""
    ids = ID_RAW if state["dataset"] == "raw" else ID_SP
    sel = ", ".join('coalesce("%s", \'\')' % c for c in ids)
    rows = ["\x1f".join(r) for r in con.sql(f"select {sel} from {view}{where}").fetchall()]
    return len(rows), hashlib.md5("\x1e".join(sorted(rows)).encode()).hexdigest()

# ---------------- cases ----------------
random.seed(136)
dd = json.load(open("/home/claude/portal-build/data/7.0.0/dropdowns.json"))
fams, gens, taxa_names, traits = dd["all_family"], dd["all_genus"], dd["all_taxon_names"], dd["all_traits"]
special = [t for t in taxa_names if re.search(r"[()\[\]\u00d7|*+?.$^\\]", t)]
big_traits = raw["trait_name"].value_counts().index[:6].tolist()
cases = []
def add(name, **st): st.setdefault("dataset", "raw"); cases.append({"name": name, "state": st})
for ds in ("raw", "species"):
    add(f"{ds}: no filters", dataset=ds)
    for f in random.sample(fams, 12) + ["Fabaceae", "Myrtaceae"]: add(f"{ds}: family {f}", dataset=ds, taxon_type="family", family=[f])
    add(f"{ds}: two families", dataset=ds, taxon_type="family", family=["Fabaceae", "Poaceae"])
    for g in random.sample(gens, 12): add(f"{ds}: genus {g}", dataset=ds, taxon_type="genus", genus=[g])
    add(f"{ds}: genus with bracket fix", dataset=ds, taxon_type="genus", genus=["Dockrillia"])
    for t in random.sample(taxa_names, 15): add(f"{ds}: taxon {t}", dataset=ds, taxon_type="taxon_name", taxon_name=[t])
    for t in random.sample(special, min(25, len(special))): add(f"{ds}: special-character taxon {t}", dataset=ds, taxon_type="taxon_name", taxon_name=[t])
    add(f"{ds}: three special taxa", dataset=ds, taxon_type="taxon_name", taxon_name=special[:3])
    for t in big_traits + random.sample(traits, 14): add(f"{ds}: trait {t}", dataset=ds, trait_name=[t])
    add(f"{ds}: two traits", dataset=ds, trait_name=["leaf_area", "plant_height"])
    for g in dd["all_trait_groupings"]: add(f"{ds}: trait group {g}", dataset=ds, trait_grouping=[g])
    for sm in dd["all_structure_measured"][:6]: add(f"{ds}: structure {sm}", dataset=ds, structure_measured=[sm])
    for k in random.sample(dd["all_keywords"], 8): add(f"{ds}: keyword {k}", dataset=ds, keywords=[k])
    add(f"{ds}: group + structure", dataset=ds, trait_grouping=[dd["all_trait_groupings"][0]], structure_measured=[dd["all_structure_measured"][0]])
    add(f"{ds}: group + trait name outside group", dataset=ds, trait_grouping=[dd["all_trait_groupings"][0]], trait_name=["leaf_area"])
    add(f"{ds}: family + trait", dataset=ds, taxon_type="family", family=["Myrtaceae"], trait_name=["leaf_area"])
    add(f"{ds}: genus + group", dataset=ds, taxon_type="genus", genus=["Acacia"], trait_grouping=[dd["all_trait_groupings"][1]])
    for b in dd["all_bor"][:5]: add(f"{ds}: basis_of_record {b}", dataset=ds, basis_of_record=[b])
    for a in dd["all_age"][:5]: add(f"{ds}: life_stage {a}", dataset=ds, life_stage=[a])
    for st in dd["all_states_territories"][:19:3]: add(f"{ds}: apc {st}", dataset=ds, location="apc", apc_taxon_distribution=[st])
    add(f"{ds}: apc two states", dataset=ds, location="apc", apc_taxon_distribution=dd["all_states_territories"][:2])
    add(f"{ds}: apc + family", dataset=ds, location="apc", apc_taxon_distribution=[dd["all_states_territories"][0]], taxon_type="family", family=["Fabaceae"])
for ds_id in dd["all_dataset_ids_species"][:6] + ["Bryant_2021"]:
    add(f"raw: custom dataset_id {ds_id}", custom=[{"column": "dataset_id", "value": [ds_id]}])
    add(f"species: custom dataset_id {ds_id}", dataset="species", custom=[{"column": "dataset_id", "value": [ds_id]}])
add("raw: georeferenced, no bounds", location="georeferenced")
add("raw: georeferenced NSW box", location="georeferenced", min_latitude=-37.5, max_latitude=-28.0, min_longitude=141.0, max_longitude=154.0)
add("raw: georeferenced tiny box", location="georeferenced", min_latitude=-33.9, max_latitude=-33.8, min_longitude=151.0, max_longitude=151.3)
add("raw: georeferenced empty box", location="georeferenced", min_latitude=10.0, max_latitude=11.0, min_longitude=10.0, max_longitude=11.0)
add("raw: georeferenced + family", location="georeferenced", taxon_type="family", family=["Myrtaceae"], min_latitude=-40.0, max_longitude=150.0)
add("species: georeferenced is ignored", dataset="species", location="georeferenced", min_latitude=-40.0)
for col in ("entity_type", "value_type", "basis_of_value", "taxon_rank", "establishment_means"):
    for ds, view in (("raw", raw), ("species", sp)):
        if col in view.columns:
            vals = view[col].dropna().value_counts().index[:2].tolist()
            for v in vals: add(f"{ds}: custom {col}={v}", dataset=ds, custom=[{"column": col, "value": [v]}])
for v in raw["original_name"].dropna().sample(8, random_state=1).tolist():
    add(f"raw: custom original_name={v}", custom=[{"column": "original_name", "value": [v]}])
for v in [x for x in raw["original_name"].dropna().unique() if re.search(r"[()\[\]|*+?.$^]", x)][:8]:
    add(f"raw: custom original_name (special) {v}", custom=[{"column": "original_name", "value": [v]}])
for txt in ["Sydney", "sydney|melbourne", "%", "_", "(", "[abc]", "a.b", "50% shade", "x|", "|", "  ", "plot*", "$5", "^leaf", "\\", "O'Brien", "unlikelystring12345"]:
    add(f"raw: free text measurement_remarks '{txt}'", custom=[{"column": "measurement_remarks", "value": [txt]}])
    add(f"raw: free text location_name '{txt}'", custom=[{"column": "location_name", "value": [txt]}])
for txt in ["Falster", "ecology", "2012|2015", "(", "[abc]", "unlikelystring12345"]:
    add(f"raw: free text source_primary_citation '{txt}'", custom=[{"column": "source_primary_citation", "value": [txt]}])
add("raw: citation text with trait filter", trait_name=["leaf_area"], custom=[{"column": "source_primary_citation", "value": ["Falster"]}])
add("raw: three custom filters", taxon_type="family", family=["Fabaceae"],
    custom=[{"column": "value_type", "value": ["raw_value"]}, {"column": "life_stage", "value": ["adult"]}, {"column": "location_name", "value": ["NSW"]}])
add("raw: no matching trait group + name -> zero rows", trait_grouping=[dd["all_trait_groupings"][0]], trait_name=["no_such_trait"])
add("raw: unknown family -> zero rows", taxon_type="family", family=["NotAFamily"])

# ---------------- run ----------------
import os
ONLY = os.environ.get("ONLY")
ALL_CASES = cases
if ONLY: cases = [c for c in cases if c["state"]["dataset"] == ONLY]
if os.environ.get("PAT"): cases = [c for c in cases if os.environ["PAT"] in c["name"]]
def norm(ks): return ks
results, bad = [], []
for i, cs in enumerate(cases):
    try:
        exp = oracle(cs["state"]); got = new_keyset(cs["state"])
        ok = exp == got
    except Exception as e:
        exp, got, ok = None, str(e)[:200], False
    cs["expected"] = {"rows": exp[0], "md5": exp[1]} if exp else None
    cs["ok"] = ok
    if not ok: bad.append((cs["name"], exp and exp[0], got if isinstance(got, str) else got[0]))
    if (i + 1) % 25 == 0: print(f"  {i+1}/{len(cases)} cases, {len(bad)} mismatches", flush=True)
out = [{"name": c["name"], "state": c["state"], "expected": c["expected"]} for c in cases]
if ONLY:
    prev = {x["name"]: x for x in json.load(open("/home/claude/portal-build/data/7.0.0/golden_cases.json"))}
    for x in out: prev[x["name"]] = x
    out = [prev[c["name"]] for c in ALL_CASES]
json.dump(out, open("/home/claude/portal-build/data/7.0.0/golden_cases.json", "w"), indent=0)
print(f"CASES {len(cases)} | PASSED {len(cases)-len(bad)} | FAILED {len(bad)}")
for b in bad[:30]: print("FAIL", b)
