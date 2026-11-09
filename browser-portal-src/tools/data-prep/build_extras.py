"""Step 1c: the three small files that build_static_pages.py and the Taxon View read:
flora_links.parquet, taxon_synonyms.parquet and taxon_extras.json.
Run it after export_from_rds.R and before build_contracts.py, so the manifest lists these files too."""
import duckdb, json, sys
if len(sys.argv) != 4:
    sys.exit("Usage: python3 build_extras.py <data folder> <work folder> <APC version date, e.g. 2026-07-30>")
OUT, W, APC = sys.argv[1:4]
c = duckdb.connect()
opt = "(FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 20000)"
c.sql(f"copy (select source, taxon_name, url from read_csv('{W}/flora_links.csv', all_varchar=true) where taxon_name is not null and taxon_name <> '' order by source, taxon_name) to '{OUT}/flora_links.parquet' {opt}")
c.sql(f"copy (select * from read_csv('{W}/synonyms.csv', all_varchar=true) order by kind, scientific_name, taxon_name, name) to '{OUT}/taxon_synonyms.parquet' {opt}")
rows = c.sql(f"select trait, entity, trait_group, core_trait from read_csv('{W}/trait_features.csv', all_varchar=true)").fetchall()
groups = [{"trait": t, "entity": e, "group": g, "core": core == "TRUE"} for t, e, g, core in rows]
json.dump({"apc_version": APC, "trait_groups": groups}, open(f"{OUT}/taxon_extras.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("flora_links, taxon_synonyms and taxon_extras.json written; trait groups:", len(groups))
