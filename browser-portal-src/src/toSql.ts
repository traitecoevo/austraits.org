// Turns a filter state into SQL. Every rule comes from filter_spec.json, and every table and column name from schema.json.
// This file holds no AusTraits-specific names except through those two files.

export type Dataset = "raw" | "species";
export interface CustomFilter { column: string; value: string[] }
export interface FilterState {
  dataset: Dataset;
  taxon_type?: string; family?: string[]; genus?: string[]; taxon_name?: string[];
  trait_name?: string[]; trait_grouping?: string[]; structure_measured?: string[]; keywords?: string[];
  basis_of_record?: string[]; life_stage?: string[];
  location?: string; apc_taxon_distribution?: string[];
  min_latitude?: number | null; max_latitude?: number | null; min_longitude?: number | null; max_longitude?: number | null;
  custom?: CustomFilter[];
}
export interface TraitFeature { trait: string; structure_measured: string; trait_group: string; keywords: string }
export interface FilterSpec {
  datasets: Record<Dataset, string>;
  regex_escape_characters: string;
  filters: Array<Record<string, any>>;
}

const q = (col: string) => '"' + col.replace(/"/g, '""') + '"';
const lit = (x: string) => "'" + String(x).replace(/'/g, "''") + "'";
const inList = (vals: string[]) => "(" + vals.map(lit).join(", ") + ")";
// escape the regular-expression metacharacters listed in filter_spec.json: ][{}()+*^$|\?.
const escRegex = (x: string) => x.replace(/[\]\[{}()+*^$|\\?.]/g, "\\$&");
const nonEmpty = (a?: string[]) => !!a && a.length > 0;

export function matchingTraits(state: FilterState, features: TraitFeature[]): string[] | null {
  if (!nonEmpty(state.trait_name) && !nonEmpty(state.trait_grouping) && !nonEmpty(state.structure_measured) && !nonEmpty(state.keywords)) return null;
  let traits = features.map(f => f.trait);
  if (nonEmpty(state.trait_grouping)) traits = features.filter(f => state.trait_grouping!.includes(f.trait_group)).map(f => f.trait);
  const hasAny = (field: "structure_measured" | "keywords", terms: string[]) =>
    new Set(features.filter(f => terms.some(t => (f[field] ?? "").includes(t))).map(f => f.trait));
  if (nonEmpty(state.structure_measured)) { const ok = hasAny("structure_measured", state.structure_measured!); traits = traits.filter(t => ok.has(t)); }
  if (nonEmpty(state.keywords)) { const ok = hasAny("keywords", state.keywords!); traits = traits.filter(t => ok.has(t)); }
  if (nonEmpty(state.trait_name)) traits = traits.filter(t => state.trait_name!.includes(t));
  return traits;
}

/** The list of SQL conditions (joined with AND by the caller). An empty list means no filter. */
export function buildWhere(state: FilterState, spec: FilterSpec, features: TraitFeature[]): string[] {
  const ds = state.dataset, w: string[] = [];
  const custom = spec.filters.find(f => f.id === "custom")!;
  const vocab: string[] = custom.controlled_vocabulary_columns;
  const tr = matchingTraits(state, features);
  if (tr !== null) w.push(tr.length ? "trait_name IN " + inList(tr) : "FALSE"); // no matching trait means no rows, not "no filter"
  const tt = state.taxon_type as "family" | "genus" | "taxon_name" | undefined;
  if (tt && ["family", "genus", "taxon_name"].includes(tt) && nonEmpty(state[tt])) w.push(`${tt} IN ` + inList(state[tt]!));
  for (const k of ["basis_of_record", "life_stage"] as const) if (nonEmpty(state[k]) && ds === "raw") w.push(`${k} IN ` + inList(state[k]!));
  if (state.location === "georeferenced" && ds === "raw") {
    w.push('"latitude (deg)" IS NOT NULL AND "longitude (deg)" IS NOT NULL');
    const b: Array<[keyof FilterState, string, string]> = [["min_latitude", "latitude (deg)", ">="], ["max_latitude", "latitude (deg)", "<="], ["min_longitude", "longitude (deg)", ">="], ["max_longitude", "longitude (deg)", "<="]];
    for (const [k, col, op] of b) { const v = state[k] as number | null | undefined; if (v !== undefined && v !== null && !Number.isNaN(v)) w.push(`${q(col)} ${op} ${Number(v)}`); }
  }
  if (state.location === "apc" && nonEmpty(state.apc_taxon_distribution))
    w.push("regexp_matches(taxon_distribution, " + lit(state.apc_taxon_distribution!.map(escRegex).join("|")) + ")");
  for (const cf of state.custom ?? []) {
    const { column, value } = cf;
    if (vocab.includes(column)) {
      if (column === "dataset_id" && ds === "species") // species rows hold several IDs joined with "; ": match whole IDs only
        w.push(`regexp_matches(${q(column)}, ` + lit("(^|; )(" + value.map(escRegex).join("|") + ")(;|$)") + ")");
      else w.push(`${q(column)} IN ` + inList(value));
    } else {
      const parts = value.join("|").toLowerCase().split("|").map(p => p.trim()).filter(Boolean);
      if (parts.length) w.push(`regexp_matches(lower(${q(column)}), ` + lit(parts.map(escRegex).join("|")) + ")");
    }
  }
  return w;
}

export const whereClause = (w: string[]) => (w.length ? " WHERE " + w.map(x => `(${x})`).join(" AND ") : "");

/** CREATE VIEW statements. `x_f` views read one Parquet file only; the plain views also join the taxon table. `base` is the folder or URL of the versioned data. */
export function viewSql(base: string): string[] {
  const f = (name: string) => lit(base.replace(/\/$/, "") + "/" + name);
  return [
    `CREATE OR REPLACE VIEW taxa AS SELECT * FROM read_parquet(${f("taxa.parquet")})`,
    `CREATE OR REPLACE VIEW raw_f AS SELECT * FROM read_parquet(${f("raw_by_trait.parquet")})`,
    `CREATE OR REPLACE VIEW raw_taxon_f AS SELECT * FROM read_parquet(${f("raw_by_taxon.parquet")})`,
    `CREATE OR REPLACE VIEW species_f AS SELECT * FROM read_parquet(${f("species_averages.parquet")})`,
    `CREATE OR REPLACE VIEW dataset_citations AS SELECT dataset_id, source_primary_citation FROM read_parquet(${f("dataset_citations.parquet")})`,
    `CREATE OR REPLACE VIEW sources AS SELECT source_primary_key, source_primary_citation FROM read_parquet(${f("sources.parquet")})`,
    `CREATE OR REPLACE VIEW raw AS SELECT r.*, t.* EXCLUDE (taxon_name, family, genus), s.source_primary_citation FROM raw_f r JOIN taxa t USING (taxon_name) LEFT JOIN dataset_citations s USING (dataset_id)`,
    `CREATE OR REPLACE VIEW raw_taxon AS SELECT r.*, t.* EXCLUDE (taxon_name, family, genus), s.source_primary_citation FROM raw_taxon_f r JOIN taxa t USING (taxon_name) LEFT JOIN dataset_citations s USING (dataset_id)`,
    `CREATE OR REPLACE VIEW species AS SELECT s.*, t.* EXCLUDE (taxon_name, family, genus) FROM species_f s JOIN taxa t USING (taxon_name)`,
  ];
}

const CITATION = "source_primary_citation";

export interface Source {
  /** Single-file view: use it when no condition needs a taxon column, so the taxon table is never read. */
  file: string;
  /** View with the taxon columns joined on. */
  joined: string;
  /** True when the conditions need a taxon column, so `joined` must be used. */
  needsJoin: boolean;
}

/**
 * Raw rows come in two sort orders. With a taxon filter and no trait filter the taxon-sorted copy reads far less data.
 * `taxaCols` lists the columns that exist only in the taxon table (everything in it except taxon_name, family and genus, which every data file carries).
 */
export function chooseSource(state: FilterState, spec: FilterSpec, features: TraitFeature[], taxaCols: string[]): Source {
  const where = buildWhere(state, spec, features);
  const text = where.join(" ");
  const uses = (col: string) => new RegExp("(^|[^A-Za-z0-9_])\"?" + col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\"?($|[^A-Za-z0-9_])").test(text);
  let name: string = state.dataset;
  if (state.dataset === "raw") {
    const tt = state.taxon_type as "family" | "genus" | "taxon_name" | undefined;
    const byTaxon = !!tt && ["family", "genus", "taxon_name"].includes(tt) && nonEmpty(state[tt]);
    const byTrait = where.some(c => /(^|[^A-Za-z0-9_])trait_name([^A-Za-z0-9_]|$)/.test(c));
    if (byTaxon && !byTrait) name = "raw_taxon";
  }
  // columns that live outside the data file: taxon columns, and for raw data the citation text held in the dataset_citations table
  const needsJoin = (state.dataset === "raw" ? [...taxaCols, CITATION] : taxaCols).some(uses);
  return { file: name + "_f", joined: name, needsJoin };
}

export const countSql = (state: FilterState, spec: FilterSpec, features: TraitFeature[], taxaCols: string[]) => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT count(*) AS n FROM ${src.needsJoin ? src.joined : src.file}${whereClause(buildWhere(state, spec, features))}`;
};

/** Every column of every filtered row, with the taxon columns joined on; used by the zip download. */
export const downloadSql = (state: FilterState, spec: FilterSpec, features: TraitFeature[], taxaCols: string[]) => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT * EXCLUDE (seq) FROM ${src.joined}${whereClause(buildWhere(state, spec, features))} ORDER BY seq`;
};

/** Any list of columns / aggregates over the filtered rows (used by the Trait View tab). */
export const selectSql = (state: FilterState, spec: FilterSpec, features: TraitFeature[], taxaCols: string[], select: string, extra = "") => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT ${select} FROM ${src.needsJoin ? src.joined : src.file}${whereClause(buildWhere(state, spec, features))}${extra}`;
};

/** Every distinct source key in the filtered rows (species rows hold several keys joined by "; "). Reads one column only. */
export const keysSql = (state: FilterState, spec: FilterSpec, features: TraitFeature[], taxaCols: string[]) => {
  const src = chooseSource(state, spec, features, taxaCols);
  return `SELECT DISTINCT source_primary_key AS k FROM ${src.needsJoin ? src.joined : src.file}${whereClause(buildWhere(state, spec, features))}`;
};

/** `numeric`: the column holds numbers stored as text, so sort by the leading number first (99 before 1000), then as text. */
export interface Sort { column: string; desc?: boolean; numeric?: boolean }

/**
 * One page of rows. Returns the SQL steps to run in order; the last step returns the rows.
 * Without a sort, one query. With a sort, a first query finds the row numbers (seq) of the page reading only the sort
 * column, and the second fetches those rows. This avoids reading every column of every matching row.
 */
export function pageSql(state: FilterState, spec: FilterSpec, features: TraitFeature[], taxaCols: string[], limit: number, offset: number, sort?: Sort, columns?: string[]) {
  const src = chooseSource(state, spec, features, taxaCols);
  const wc = whereClause(buildWhere(state, spec, features));
  const base = src.needsJoin ? src.joined : src.file;
  const dir = sort?.desc ? "DESC" : "ASC";
  const col = sort ? q(sort.column) : "seq";
  const num = sort?.numeric ? `TRY_CAST(regexp_extract(CAST(${col} AS VARCHAR), '^-?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?') AS DOUBLE) ${dir} NULLS LAST, ` : "";
  const order = sort ? `${num}${col} ${dir} NULLS LAST, seq` : "seq";
  const idStep = `SELECT seq FROM ${base}${wc} ORDER BY ${order} LIMIT ${Math.floor(limit)} OFFSET ${Math.floor(offset)}`;
  const fromTaxa = new Set(taxaCols); // columns that live only in the taxon table
  const wantCite = !!columns && columns.includes(CITATION) && state.dataset === "raw";
  const finish = (seqs: number[]) => {
    const ids = seqs.length ? seqs.join(",") : "NULL";
    const lo = seqs.length ? Math.min(...seqs) : 0, hi = seqs.length ? Math.max(...seqs) : 0;
    const where = `seq BETWEEN ${lo} AND ${hi} AND seq IN (${ids})`;
    const byIds = `ORDER BY list_position([${ids}], r.seq)`; // keep the order the first step chose (matters for sorted pages)
    if (!columns) return `SELECT r.*, t.* EXCLUDE (taxon_name, family, genus) FROM (SELECT * FROM ${src.file} WHERE ${where}) r JOIN taxa t USING (taxon_name) ${byIds}`;
    const fileCols = columns.filter(c => !fromTaxa.has(c) && !(wantCite && c === CITATION));
    const taxCols = columns.filter(c => fromTaxa.has(c));
    const innerCols = ["seq", "taxon_name", ...(wantCite && !columns.includes("dataset_id") ? ["dataset_id"] : []), ...fileCols.filter(c => c !== "taxon_name")];
    const inner = `SELECT ${innerCols.map(q).join(", ")} FROM ${src.file} WHERE ${where}`;
    const sel = columns.map(c => (c === CITATION && wantCite ? "s." : fromTaxa.has(c) ? "t." : "r.") + q(c)).join(", ");
    return `SELECT ${sel} FROM (${inner}) r${taxCols.length ? " JOIN taxa t USING (taxon_name)" : ""}${wantCite ? " LEFT JOIN dataset_citations s USING (dataset_id)" : ""} ORDER BY list_position([${ids}], r.seq)`;
  };
  return { idStep, finish };
}
