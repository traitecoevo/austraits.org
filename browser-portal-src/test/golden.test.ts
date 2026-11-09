// Runs every golden case through toSql inside DuckDB-WASM (the same engine family the browser uses)
// and compares the row count and a checksum of the matching rows with the values the independent oracle produced.
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildWhere, whereClause, viewSql, type FilterSpec, type FilterState, type TraitFeature } from "../src/toSql";

const require = createRequire(import.meta.url);
const duckdb = require("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
const DATA = process.env.DATA_DIR ?? path.resolve("data/7.0.0"); // folder with the Parquet files and filter_spec.json (see README)
const DIST = path.dirname(require.resolve("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs"));

const spec: FilterSpec = JSON.parse(readFileSync(path.join(DATA, "filter_spec.json"), "utf8"));
const cases: Array<{ name: string; state: FilterState; expected: { rows: number; md5: string } }> =
  JSON.parse(readFileSync(path.resolve("golden/golden_cases.json"), "utf8"));
const only = process.env.ONLY; // "raw" or "species" to run half the cases

// trait_features comes from the Parquet file itself (the same table the browser loads)
let conn: any;
let features: TraitFeature[] = [];

// Columns that identify a row, per dataset. They must match what the reference script used (golden/run_golden.py).
const ID: Record<string, string[]> = {
  raw: ["trait_name", "taxon_name", "dataset_id", "observation_id", "value"],
  species: ["trait_name", "taxon_name", "dataset_id", "value_type", "value_mean"],
};

beforeAll(async () => {
  const bundles = {
    mvp: { mainModule: path.join(DIST, "duckdb-mvp.wasm"), mainWorker: path.join(DIST, "duckdb-node-mvp.worker.cjs") },
    eh: { mainModule: path.join(DIST, "duckdb-eh.wasm"), mainWorker: path.join(DIST, "duckdb-node-eh.worker.cjs") },
  };
  const db = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await db.instantiate(() => {});
  db.open({});
  conn = db.connect();
  for (const sql of viewSql(DATA)) conn.query(sql);
  features = conn.query(`SELECT trait, coalesce(structure_measured,'') AS structure_measured, coalesce(trait_group,'') AS trait_group, coalesce(keywords,'') AS keywords
    FROM read_parquet('${DATA}/trait_features.parquet')`).toArray().map((r: any) => r.toJSON());
}, 600_000);

function run(state: FilterState) {
  const ids = ID[state.dataset]!;
  const key = ids.map(c => `coalesce("${c}", '')`).join(" || chr(31) || ");
  const sql = `SELECT ${key} AS k FROM ${state.dataset}${whereClause(buildWhere(state, spec, features))} ORDER BY k`;
  const rows = conn.query(sql).toArray();
  const h = createHash("md5");
  for (let i = 0; i < rows.length; i++) h.update((i ? "\x1e" : "") + rows[i].k);
  return { rows: rows.length, md5: h.digest("hex") };
}

describe("golden cases in DuckDB-WASM", () => {
  const list = cases.filter(c => !only || c.state.dataset === only);
  it.each(list.map(c => [c.name, c] as const))("%s", (_name, c) => {
    expect(run(c.state)).toEqual(c.expected);
  }, 900_000);
});
