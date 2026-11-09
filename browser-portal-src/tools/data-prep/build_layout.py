"""Step 1: build the normalised data folder from the AusTraits portal files.
Uses DuckDB SQL (the same SQL can be run from the R duckdb package later)."""
import duckdb, hashlib, json, os, sys
if len(sys.argv) != 3:
    sys.exit("Usage: python3 build_layout.py <folder with austraits-data.parquet and austraits-species-averages.parquet> <data folder, e.g. data/7.1.0>")
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
c = duckdb.connect()
# Same load-time fixes the Shiny loader applies (R/data_loading.R), done once here instead:
#  - strip the leading bracket from hybrid-formula genera (issue #113)
#  - coordinates are stored as text; cast to numbers so location filters are numeric
G = "regexp_replace(genus, '^[(]', '') AS genus"
LL = '''TRY_CAST("latitude (deg)" AS DOUBLE) AS "latitude (deg)", TRY_CAST("longitude (deg)" AS DOUBLE) AS "longitude (deg)"'''
c.sql(f"create view d as select * replace ({G}, {LL}) from '{SRC}/austraits-data.parquet'")
c.sql(f"create view s as select * replace ({G}) from '{SRC}/austraits-species-averages.parquet'")
cols = [r[0] for r in c.sql("describe d").fetchall()]
TAXON = ['taxon_rank','taxonomic_status','taxonomic_dataset','taxon_name_alternatives','genus','family',
         'binomial','trinomial','taxon_distribution','establishment_means','scientific_name','taxon_id',
         'taxon_id_genus','taxon_id_family','scientific_name_id']
DROP = ['row_id','source_primary_citation','repeat_measurements_id']
q = lambda x: '"%s"' % x
raw_cols = [x for x in cols if x not in TAXON and x not in DROP]
opt = "(FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 20000)"
# 1. taxa table: one row per taxon_name; verified constant per name
c.sql(f"copy (select distinct taxon_name, {', '.join(q(x) for x in TAXON)} from d order by taxon_name) to '{OUT}/taxa.parquet' {opt}")
# 2. raw, sorted by trait, taxon, dataset (+observation_id as stable tie-break)
sel = ', '.join(q(x) for x in raw_cols)
# seq = position in this file's sort order; row_id is used only to break ties, then dropped
c.sql(f"copy (select row_number() over (order by trait_name, taxon_name, dataset_id, observation_id, row_id)::INTEGER as seq, d.family, d.genus, {sel} from d order by seq) to '{OUT}/raw_by_trait.parquet' {opt}")
# 3. raw, sorted by family, genus, taxon (family and genus kept so row-group statistics can prune)
c.sql(f"copy (select row_number() over (order by family, genus, taxon_name, trait_name, dataset_id, observation_id, row_id)::INTEGER as seq, d.family, d.genus, {sel} from d order by seq) to '{OUT}/raw_by_taxon.parquet' {opt}")
# 4. species averages
scols = [r[0] for r in c.sql("describe s").fetchall()]
sdrop = DROP + [x for x in TAXON if x in scols and x not in ('genus','family')]
ssel = ', '.join(q(x) for x in scols if x not in sdrop)
skeep = [x for x in scols if x not in sdrop]
sorder = ', '.join(q(x) for x in ['trait_name','taxon_name','dataset_id','value_type'] + [x for x in skeep if x not in ('trait_name','taxon_name','dataset_id','value_type')])
c.sql(f"copy (select row_number() over (order by {sorder})::INTEGER as seq, {ssel} from s order by seq) to '{OUT}/species_averages.parquet' {opt}")
# manifest
man = {"source": os.path.basename(os.path.abspath(SRC)), "files": {}}
for f in sorted(x for x in os.listdir(OUT) if x.endswith('.parquet')):
    p = os.path.join(OUT, f)
    h = hashlib.sha256(open(p,'rb').read()).hexdigest()
    n = c.sql(f"select count(*) from '{p}'").fetchall()[0][0]
    ng = c.sql(f"select count(distinct row_group_id) from parquet_metadata('{p}')").fetchall()[0][0]
    man["files"][f] = {"bytes": os.path.getsize(p), "rows": n, "row_groups": ng, "sha256": h}
json.dump(man, open(f"{OUT}/manifest.json","w"), indent=1)
for f,v in man["files"].items(): print(f"{f:28s} {v['bytes']/1e6:7.1f} MB {v['rows']:>9} rows {v['row_groups']:>3} groups")
