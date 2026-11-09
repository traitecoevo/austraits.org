"""Step 1b: lookup tables and contract files (schema.json, filter_spec.json, portal.json)."""
import duckdb, json, hashlib, os, shutil, sys
if len(sys.argv) != 6:
    sys.exit("Usage: python3 build_contracts.py <folder with austraits-data.parquet> <data folder> <work folder> <data version, e.g. 7.1.0> <austraits.json from austraits.portal inst/extdata/austraits>")
SRC, OUT, W, VERSION, ZENODO = sys.argv[1:6]
c = duckdb.connect()
opt = "(FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 20000)"
# --- lookup tables made from the portal's own .rds tables (exported by export_from_rds.R) ---
c.sql(f"copy (select * from read_csv('{W}/trait_features.csv', all_varchar=true) order by trait) to '{OUT}/trait_features.parquet' {opt}")
c.sql(f"copy (select * from read_csv('{W}/sources.csv', all_varchar=true) order by source_primary_key) to '{OUT}/sources.parquet' {opt}")
# dataset_citations: one citation per dataset_id (source_primary_key is NOT unique: e.g. Bryant_2021 has three citations)
c.sql(f"copy (select distinct dataset_id, source_primary_key, source_primary_citation from '{SRC}/austraits-data.parquet' order by dataset_id) to '{OUT}/dataset_citations.parquet' {opt}")
# taxon_lookup: every accepted name (kind 'accepted') plus synonyms/misapplied names -> canonical taxon_name
c.sql(f"""copy (
  select taxon_name as name, taxon_name, family, genus, 'accepted' as kind from '{OUT}/taxa.parquet'
  union all
  select s.name, s.taxon_name, t.family, t.genus, s.kind from read_csv('{W}/synonyms.csv', all_varchar=true) s
    join '{OUT}/taxa.parquet' t using (taxon_name)
  order by name) to '{OUT}/taxon_lookup.parquet' {opt}""")
# name-search index (accepted names only; synonyms are searched through taxon_lookup)
names = [r[0] for r in c.sql(f"select taxon_name from '{OUT}/taxa.parquet' order by taxon_name").fetchall()]
json.dump(names, open(f"{OUT}/name_index.json","w"), ensure_ascii=False, separators=(",",":"))
shutil.copy(f"{W}/dropdowns.json", f"{OUT}/dropdowns.json")

# --- schema.json: what each table holds ---
def describe(p): return [{"name": r[0], "type": r[1]} for r in c.sql(f"describe select * from '{p}'").fetchall()]
tables = {
 "raw_by_trait":   {"file": "raw_by_trait.parquet",   "sorted_by": ["trait_name","taxon_name","dataset_id","observation_id"], "page_key": "seq"},
 "raw_by_taxon":   {"file": "raw_by_taxon.parquet",   "sorted_by": ["family","genus","taxon_name","trait_name","dataset_id","observation_id"], "page_key": "seq"},
 "species":        {"file": "species_averages.parquet","sorted_by": ["trait_name","taxon_name"]},
 "taxa":           {"file": "taxa.parquet",           "key": "taxon_name"},
 "taxon_lookup":   {"file": "taxon_lookup.parquet",   "key": "name"},
 "trait_features": {"file": "trait_features.parquet", "key": "trait"},
 "sources":        {"file": "sources.parquet",        "key": "source_primary_key"},
 "dataset_citations": {"file": "dataset_citations.parquet", "key": "dataset_id"},
}
for t in tables.values():
    t["columns"] = describe(f"{OUT}/{t['file']}")
    t["rows"] = c.sql(f"select count(*) from '{OUT}/{t['file']}'").fetchall()[0][0]
tables["raw_by_trait"]["join"] = "taxa on taxon_name"
tables["species"]["join"] = "taxa on taxon_name (genus and family are kept in the species file)"
schema = {"schema_version": 1, "data_version": VERSION, "tables": tables,
  "note": "Every name, column and table the browser uses comes from this file. No column name is hard-coded in the bundle."}
json.dump(schema, open(f"{OUT}/schema.json","w"), indent=1)

# --- filter_spec.json: how filter state becomes SQL (copied from the Shiny code, R/fct_filter_application.R) ---
spec = {
 "spec_version": 1,
 "source": "austraits.portal R/fct_filter_application.R and R/fct_filter_parsing.R (master, Nov 2026)",
 "datasets": {"raw": "raw_by_trait", "species": "species"},
 "empty_means_no_filter": True,
 "filters": [
  {"id":"trait_features","applies_to":["raw","species"],"inputs":["trait_grouping","structure_measured","keywords","trait_name"],
   "rule":"Resolve to a list of trait names from trait_features, then trait_name IN (list). trait_grouping matches trait_group exactly; structure_measured and keywords match by substring (case-sensitive) against the field; all selected parts are intersected. No matching trait means zero rows, not no filter."},
  {"id":"taxon","applies_to":["raw","species"],"inputs":["taxon_type","family","genus","taxon_name"],
   "rule":"Only the field named by taxon_type is used: family IN (...), genus IN (...) or taxon_name IN (...). Browser expands the choice to the full family, genus, taxon_name conjunction from taxa so row-group statistics prune on raw_by_taxon.","exact_match":True},
  {"id":"basis_of_record","applies_to":["raw"],"column":"basis_of_record","rule":"IN (...); the species table has no such column, so the input is ignored (and cleared in the interface) for species averages"},
  {"id":"life_stage","applies_to":["raw"],"column":"life_stage","rule":"IN (...); ignored for species averages, as above"},
  {"id":"location_georeferenced","applies_to":["raw"],"rule":"latitude IS NOT NULL AND longitude IS NOT NULL, then optional >= and <= bounds on latitude (deg) and longitude (deg); columns are numeric in the data files"},
  {"id":"location_apc","applies_to":["raw","species"],"column":"taxon_distribution","rule":"regexp_matches(taxon_distribution, pattern) where pattern is the escaped selected values joined with |"},
  {"id":"custom","max":3,"applies_to":["raw","species"],
   "controlled_vocabulary_columns":["dataset_id","entity_type","value_type","basis_of_value","basis_of_record","life_stage","original_name","taxon_rank","establishment_means"],
   "free_text_columns":["collection_date","measurement_remarks","location_name","location_properties","treatment_context_properties","plot_context_properties","entity_context_properties","temporal_context_properties","method_context_properties","source_primary_citation","data_contributors"],
   "species_columns":["dataset_id","value_type","value_count","taxon_rank","establishment_means"],
   "rule_controlled":"column IN (...) except dataset_id on species, which is a whole-element match inside a '; '-joined list: regexp_matches(dataset_id, '(^|; )(a|b)(;|$)')",
   "rule_free_text":"regexp_matches(lower(column), pattern); text is split on |, trimmed, lower-cased, escaped, and joined with |"},
 ],
 "regex_escape_characters": "][{}()+*^$|\\\\?.",
 "url_parameters": ["taxon_type","family","genus","taxon_name","trait_name","location","apc_taxon_distribution","basis_of_record","life_stage","tab"],
 "default_sort": {"raw":"seq","species":"trait_name, taxon_name"},
 "page_sizes": [10,25,50,100]
}
json.dump(spec, open(f"{OUT}/filter_spec.json","w"), indent=1)

# --- portal.json: everything database-specific that is not in schema or filter_spec ---
portal = {
 "portal_version": 1,
 "name": "AusTraits Data Portal", "short_name": "AusTraits",
 "data_version": VERSION, "citation_default": "Data used in this study were obtained from the AusTraits Database (https://www.austraits.org).",
 "tables_present": {"species_averages": True},
 "labels": {"raw":"Raw data","species":"Species averages","taxonomy":"Taxonomy","traits":"Traits","location":"Location",
            "preview":"Data Preview","trait_view":"Trait View","taxon_view":"Taxon View","citations":"Citations"},
 "links": {"site":"https://www.austraits.org","code":"https://github.com/traitecoevo/austraits.portal","zenodo":"https://doi.org/10.5281/zenodo.3568417", "plant_dictionary":"https://github.com/traitecoevo/APD"},
 "theme": {"--at-ink":"#2b332f","--at-muted":"#64726b","--at-green":"#2f7d55","--at-green-dark":"#235c43","--at-blue":"#2a7f9e","--at-gold":"#d9a441",
           "--at-cream":"#f7f7f4","--at-mint":"#f2f6f3","--at-sky":"#f3f7f8","--at-line":"#e5e8e5","--at-white":"#ffffff","--at-shadow":"0 10px 26px rgba(30, 45, 38, 0.08)","--at-radius":"8px"},
 "caps": {"desktop_download_rows": None, "phone_download_rows": None, "note": "to be set after measurement in the spike"},
 "defaults": {"dataset":"species","taxon_type":"all","family":[]},
}
_m = json.load(open(ZENODO))["hits"]["hits"][0]
portal["zenodo_meta"] = {"version": _m["metadata"]["version"].lstrip("v"), "doi": _m["metadata"]["doi"], "concept_doi": _m["conceptdoi"], "date": _m["metadata"]["publication_date"]}
portal["download_cap_rows"] = 300000
portal["download_warn_rows"] = 100000
json.dump(portal, open(f"{OUT}/portal.json","w"), indent=1)

# --- manifest: sizes, rows, sha256 for every file ---
man = {"data_version":VERSION,"engine_note":"fill in with SELECT version() from the pinned DuckDB-WASM at release","files":{}}
for f in sorted(os.listdir(OUT)):
    if f == "manifest.json": continue
    p = f"{OUT}/{f}"
    e = {"bytes": os.path.getsize(p), "sha256": hashlib.sha256(open(p,'rb').read()).hexdigest()}
    if f.endswith(".parquet"):
        e["rows"] = c.sql(f"select count(*) from '{p}'").fetchall()[0][0]
        e["row_groups"] = c.sql(f"select count(distinct row_group_id) from parquet_metadata('{p}')").fetchall()[0][0]
    man["files"][f] = e
json.dump(man, open(f"{OUT}/manifest.json","w"), indent=1)
for f,e in man["files"].items(): print(f"{f:26s} {e['bytes']/1e6:8.2f} MB", e.get("rows",""))
