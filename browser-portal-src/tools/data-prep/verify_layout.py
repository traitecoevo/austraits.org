import duckdb, sys
if len(sys.argv) != 3:
    sys.exit("Usage: python3 verify_layout.py <folder with austraits-data.parquet> <data folder, e.g. data/7.1.0>")
SRC, OUT = sys.argv[1], sys.argv[2]
c=duckdb.connect()
G = "regexp_replace(genus, '^[(]', '') AS genus"
LL = '''TRY_CAST("latitude (deg)" AS DOUBLE) AS "latitude (deg)", TRY_CAST("longitude (deg)" AS DOUBLE) AS "longitude (deg)"'''
c.sql(f"create view d as select * replace ({G}, {LL}) from '{SRC}/austraits-data.parquet'")
c.sql(f"create view t as select * from '{OUT}/taxa.parquet'")
c.sql(f"create view r as select * from '{OUT}/raw_by_trait.parquet'")
c.sql(f"create view r2 as select * from '{OUT}/raw_by_taxon.parquet'")
rcols=[x[0] for x in c.sql("describe r").fetchall()]
tcols=[x[0] for x in c.sql("describe t").fetchall() if x[0] not in ('taxon_name','family','genus')]
q=lambda x:'"%s"'%x
orig_cols=[x[0] for x in c.sql("describe d").fetchall() if x[0] not in ('row_id','source_primary_citation','repeat_measurements_id')]
sel=", ".join(f"r.{q(x)}" for x in rcols if x!="seq")+", "+", ".join(f"t.{q(x)}" for x in tcols)
c.sql(f"create view rebuilt as select {sel} from r join t using (taxon_name)")
cols=", ".join(q(x) for x in orig_cols)
n_orig=c.sql("select count(*) from d").fetchall()[0][0]
n_reb=c.sql("select count(*) from rebuilt").fetchall()[0][0]
print("rows original / rebuilt:",n_orig,n_reb)
a=c.sql(f"select count(*) from (select {cols} from d except all select {cols} from rebuilt)").fetchall()[0][0]
b=c.sql(f"select count(*) from (select {cols} from rebuilt except all select {cols} from d)").fetchall()[0][0]
print("rows in original not in rebuilt:",a," in rebuilt not in original:",b)
# taxon-sorted copy holds the same rows as the trait-sorted copy
rc=[x for x in rcols if x!='seq']
print("taxon-sorted copy vs trait-sorted copy differences:",
  c.sql(f"select count(*) from (select {', '.join(q(x) for x in rc)} from r except all select {', '.join(q(x) for x in rc)} from r2)").fetchall()[0][0])
# taxa join does not multiply rows and every raw taxon is present
print("raw taxa missing from taxa table:",c.sql("select count(*) from (select distinct taxon_name from r) where taxon_name not in (select taxon_name from t)").fetchall()[0][0])
print("duplicate taxon_name in taxa:",c.sql("select count(*)-count(distinct taxon_name) from t").fetchall()[0][0])
# stable sort key unique?
print("duplicate seq in trait file:",c.sql("select count(*)-count(distinct seq) from r").fetchall()[0][0], " in taxon file:",c.sql("select count(*)-count(distinct seq) from r2").fetchall()[0][0])
print("seq is 1..N:",c.sql("select min(seq),max(seq) from r").fetchall())
