// src/toSql.ts
var q = (col) => '"' + col.replace(/"/g, '""') + '"';
var lit = (x) => "'" + String(x).replace(/'/g, "''") + "'";
var inList = (vals) => "(" + vals.map(lit).join(", ") + ")";
var escRegex = (x) => x.replace(/[\]\[{}()+*^$|\\?.]/g, "\\$&");
var nonEmpty = (a) => !!a && a.length > 0;
function matchingTraits(state, features) {
  if (!nonEmpty(state.trait_name) && !nonEmpty(state.trait_grouping) && !nonEmpty(state.structure_measured) && !nonEmpty(state.keywords)) return null;
  let traits = features.map((f) => f.trait);
  if (nonEmpty(state.trait_grouping)) traits = features.filter((f) => state.trait_grouping.includes(f.trait_group)).map((f) => f.trait);
  const hasAny = (field, terms) => new Set(features.filter((f) => terms.some((t) => (f[field] ?? "").includes(t))).map((f) => f.trait));
  if (nonEmpty(state.structure_measured)) {
    const ok = hasAny("structure_measured", state.structure_measured);
    traits = traits.filter((t) => ok.has(t));
  }
  if (nonEmpty(state.keywords)) {
    const ok = hasAny("keywords", state.keywords);
    traits = traits.filter((t) => ok.has(t));
  }
  if (nonEmpty(state.trait_name)) traits = traits.filter((t) => state.trait_name.includes(t));
  return traits;
}
function buildWhere(state, spec, features) {
  const ds = state.dataset, w = [];
  const custom = spec.filters.find((f) => f.id === "custom");
  const vocab = custom.controlled_vocabulary_columns;
  const tr = matchingTraits(state, features);
  if (tr !== null) w.push(tr.length ? "trait_name IN " + inList(tr) : "FALSE");
  const tt = state.taxon_type;
  if (tt && ["family", "genus", "taxon_name"].includes(tt) && nonEmpty(state[tt])) w.push(`${tt} IN ` + inList(state[tt]));
  for (const k of ["basis_of_record", "life_stage"]) if (nonEmpty(state[k]) && ds === "raw") w.push(`${k} IN ` + inList(state[k]));
  if (state.location === "georeferenced" && ds === "raw") {
    w.push('"latitude (deg)" IS NOT NULL AND "longitude (deg)" IS NOT NULL');
    const b = [["min_latitude", "latitude (deg)", ">="], ["max_latitude", "latitude (deg)", "<="], ["min_longitude", "longitude (deg)", ">="], ["max_longitude", "longitude (deg)", "<="]];
    for (const [k, col, op] of b) {
      const v = state[k];
      if (v !== void 0 && v !== null && !Number.isNaN(v)) w.push(`${q(col)} ${op} ${Number(v)}`);
    }
  }
  if (state.location === "apc" && nonEmpty(state.apc_taxon_distribution))
    w.push("regexp_matches(taxon_distribution, " + lit(state.apc_taxon_distribution.map(escRegex).join("|")) + ")");
  for (const cf of state.custom ?? []) {
    const { column, value } = cf;
    if (vocab.includes(column)) {
      if (column === "dataset_id" && ds === "species")
        w.push(`regexp_matches(${q(column)}, ` + lit("(^|; )(" + value.map(escRegex).join("|") + ")(;|$)") + ")");
      else w.push(`${q(column)} IN ` + inList(value));
    } else {
      const parts = value.join("|").toLowerCase().split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length) w.push(`regexp_matches(lower(${q(column)}), ` + lit(parts.map(escRegex).join("|")) + ")");
    }
  }
  return w;
}
var whereClause = (w) => w.length ? " WHERE " + w.map((x) => `(${x})`).join(" AND ") : "";
function viewSql(base) {
  const f = (name) => lit(base.replace(/\/$/, "") + "/" + name);
  return [
    `CREATE OR REPLACE VIEW taxa AS SELECT * FROM read_parquet(${f("taxa.parquet")})`,
    `CREATE OR REPLACE VIEW raw_f AS SELECT * FROM read_parquet(${f("raw_by_trait.parquet")})`,
    `CREATE OR REPLACE VIEW raw_taxon_f AS SELECT * FROM read_parquet(${f("raw_by_taxon.parquet")})`,
    `CREATE OR REPLACE VIEW species_f AS SELECT * FROM read_parquet(${f("species_averages.parquet")})`,
    `CREATE OR REPLACE VIEW dataset_citations AS SELECT dataset_id, source_primary_citation FROM read_parquet(${f("dataset_citations.parquet")})`,
    `CREATE OR REPLACE VIEW sources AS SELECT source_primary_key, source_primary_citation FROM read_parquet(${f("sources.parquet")})`,
    `CREATE OR REPLACE VIEW raw AS SELECT r.*, t.* EXCLUDE (taxon_name, family, genus), s.source_primary_citation FROM raw_f r JOIN taxa t USING (taxon_name) LEFT JOIN dataset_citations s USING (dataset_id)`,
    `CREATE OR REPLACE VIEW raw_taxon AS SELECT r.*, t.* EXCLUDE (taxon_name, family, genus), s.source_primary_citation FROM raw_taxon_f r JOIN taxa t USING (taxon_name) LEFT JOIN dataset_citations s USING (dataset_id)`,
    `CREATE OR REPLACE VIEW species AS SELECT s.*, t.* EXCLUDE (taxon_name, family, genus) FROM species_f s JOIN taxa t USING (taxon_name)`
  ];
}
var CITATION = "source_primary_citation";
function chooseSource(state, spec, features, taxaCols) {
  const where = buildWhere(state, spec, features);
  const text = where.join(" ");
  const uses = (col) => new RegExp('(^|[^A-Za-z0-9_])"?' + col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"?($|[^A-Za-z0-9_])').test(text);
  let name = state.dataset;
  if (state.dataset === "raw") {
    const tt = state.taxon_type;
    const byTaxon = !!tt && ["family", "genus", "taxon_name"].includes(tt) && nonEmpty(state[tt]);
    const byTrait = where.some((c) => /(^|[^A-Za-z0-9_])trait_name([^A-Za-z0-9_]|$)/.test(c));
    if (byTaxon && !byTrait) name = "raw_taxon";
  }
  const needsJoin = (state.dataset === "raw" ? [...taxaCols, CITATION] : taxaCols).some(uses);
  return { file: name + "_f", joined: name, needsJoin };
}
var countSql = (state, spec, features, taxaCols) => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT count(*) AS n FROM ${src.needsJoin ? src.joined : src.file}${whereClause(buildWhere(state, spec, features))}`;
};
var downloadSql = (state, spec, features, taxaCols) => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT * EXCLUDE (seq) FROM ${src.joined}${whereClause(buildWhere(state, spec, features))} ORDER BY seq`;
};
var selectSql = (state, spec, features, taxaCols, select, extra = "") => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT ${select} FROM ${src.needsJoin ? src.joined : src.file}${whereClause(buildWhere(state, spec, features))}${extra}`;
};
var keysSql = (state, spec, features, taxaCols) => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT DISTINCT source_primary_key AS k FROM ${src.needsJoin ? src.joined : src.file}${whereClause(buildWhere(state, spec, features))}`;
};
function pageSql(state, spec, features, taxaCols, limit, offset, sort, columns) {
  const src = chooseSource(state, spec, features, taxaCols);
  const wc = whereClause(buildWhere(state, spec, features));
  const base = src.needsJoin ? src.joined : src.file;
  const dir = sort?.desc ? "DESC" : "ASC";
  const col = sort ? q(sort.column) : "seq";
  const num = sort?.numeric ? `TRY_CAST(regexp_extract(CAST(${col} AS VARCHAR), '^-?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?') AS DOUBLE) ${dir} NULLS LAST, ` : "";
  const order = sort ? `${num}${col} ${dir} NULLS LAST, seq` : "seq";
  const idStep = `SELECT seq FROM ${base}${wc} ORDER BY ${order} LIMIT ${Math.floor(limit)} OFFSET ${Math.floor(offset)}`;
  const fromTaxa = new Set(taxaCols);
  const wantCite = !!columns && columns.includes(CITATION) && state.dataset === "raw";
  const finish = (seqs) => {
    const ids = seqs.length ? seqs.join(",") : "NULL";
    const lo = seqs.length ? Math.min(...seqs) : 0, hi = seqs.length ? Math.max(...seqs) : 0;
    const where = `seq BETWEEN ${lo} AND ${hi} AND seq IN (${ids})`;
    const byIds = `ORDER BY list_position([${ids}], r.seq)`;
    if (!columns) return `SELECT r.*, t.* EXCLUDE (taxon_name, family, genus) FROM (SELECT * FROM ${src.file} WHERE ${where}) r JOIN taxa t USING (taxon_name) ${byIds}`;
    const fileCols = columns.filter((c) => !fromTaxa.has(c) && !(wantCite && c === CITATION));
    const taxCols = columns.filter((c) => fromTaxa.has(c));
    const innerCols = ["seq", "taxon_name", ...wantCite && !columns.includes("dataset_id") ? ["dataset_id"] : [], ...fileCols.filter((c) => c !== "taxon_name")];
    const inner = `SELECT ${innerCols.map(q).join(", ")} FROM ${src.file} WHERE ${where}`;
    const sel = columns.map((c) => (c === CITATION && wantCite ? "s." : fromTaxa.has(c) ? "t." : "r.") + q(c)).join(", ");
    return `SELECT ${sel} FROM (${inner}) r${taxCols.length ? " JOIN taxa t USING (taxon_name)" : ""}${wantCite ? " LEFT JOIN dataset_citations s USING (dataset_id)" : ""} ORDER BY list_position([${ids}], r.seq)`;
  };
  return { idStep, finish };
}
export {
  buildWhere,
  chooseSource,
  countSql,
  downloadSql,
  keysSql,
  matchingTraits,
  pageSql,
  selectSql,
  viewSql,
  whereClause
};
