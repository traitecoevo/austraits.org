// AusTraits Data Portal: browser-only. DuckDB-WASM reads Parquet over HTTP range requests; SQL comes from toSql.mjs (tested against 375 golden cases).
import * as T from "./toSql.mjs";
import { markdownToHtml, citationText } from "./cite.js";
import * as TV from "./traitview.js";
import * as TX from "./taxonview.js";
import { buildZip, saveBlob } from "./download.js";
import { initTelemetry, track, monthly, counterCsv, counterJson } from "./telemetry.js";

const $ = (s, r = document) => r.querySelector(s);
// run something when the browser has nothing better to do (falls back to a short timer)
const idle = (f) => { try { "requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2000); } catch { setTimeout(f, 2000); } };
const abs = (p) => new URL(p, location.href).href.replace(/\/$/, "");
const nf = new Intl.NumberFormat("en-AU");
const pretty = (c) => c.replace(/\s*\(deg\)/, "").replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
const NUMERIC_SORT = new Set(["value", "replicates", "value_mean", "all_replicates"]);
const RAW_COLS = ["family", "genus", "taxon_name", "trait_name", "dataset_id", "value", "unit", "entity_type", "value_type", "basis_of_value", "replicates", "basis_of_record", "life_stage", "collection_date", "measurement_remarks", "original_name", "location_name", "latitude (deg)", "longitude (deg)", "location_properties", "treatment_context_properties", "plot_context_properties", "entity_context_properties", "temporal_context_properties", "method_context_properties", "source_primary_citation", "data_contributors", "taxon_rank", "taxon_distribution", "establishment_means"];
const SPECIES_COLS = ["family", "genus", "taxon_name", "trait_name", "dataset_id", "value_mean", "value_range", "all_replicates", "taxon_rank", "taxon_distribution", "establishment_means"];
const STATES = ["ACT", "NSW", "NT", "Qld", "SA", "Tas", "Vic", "WA"];

// ---------- engine ----------
let conn;
const boot = (m) => { const e = $("#status-text"); if (e) e.textContent = m; console.log("[portal]", m); };
// a step that never answers becomes a clear error instead of an endless spinner
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} did not finish after ${ms / 1000} seconds. Check the browser console (F12) for details.`)), ms))]);
async function startEngine(cfg) {
  const eb = abs(cfg.engineBase) + "/";
  const D = await import(eb + "duckdb-browser.bundled.mjs");
  // a tiny wrapper lets the worker load from another origin (a CDN) as well
  const worker = new Worker(URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(eb + "duckdb-browser-eh.worker.js")})`], { type: "text/javascript" })));
  const db = new D.AsyncDuckDB(new D.VoidLogger(), worker);
  boot("Loading the database engine…");
  await within(db.instantiate(eb + "duckdb-eh.wasm"), 120000, "Starting the database engine");
  // range requests only: never download a whole data file
  await db.open({ filesystem: { forceFullHTTPReads: false, allowFullHTTPReads: false } });
  conn = await db.connect(); A.db = db;
  boot("Loading the Parquet reader…");
  await run(`SET custom_extension_repository='${abs(cfg.extensionRepo)}'`);
  await within(run("INSTALL parquet"), 60000, "Installing the Parquet reader");
  await within(run("LOAD parquet"), 60000, "Loading the Parquet reader");
}
const clean = (v) => (typeof v === "bigint" ? Number(v) : v);
async function run(sql) {
  // The test host sometimes answers a range request with an error page, which the Parquet reader reports as "Invalid data". Try again a couple of times before giving up.
  let r;
  for (let i = 0; ; i++) {
    try { r = await conn.query(sql); break; }
    catch (e) {
      const m = String((e && e.message) || e);
      if (i >= 2 || !/TProtocol|Invalid data|IO Error|HTTP|fetch/i.test(m)) throw e;
      console.warn("Read failed, trying again (" + (i + 1) + "):", m, sql.slice(0, 120));
      await new Promise((ok) => setTimeout(ok, 1200 * (i + 1)));
    }
  }
  return r.toArray().map((x) => { const o = x.toJSON(); for (const k in o) o[k] = clean(o[k]); return o; });
}

// ---------- widgets ----------
function radios(root, name, opts, onChange) {
  root.innerHTML = "";
  const inputs = opts.map(([v, label]) => {
    const l = document.createElement("label"), i = document.createElement("input");
    i.type = "radio"; i.name = name; i.value = v; l.append(i, document.createTextNode(label)); root.append(l);
    i.addEventListener("change", () => onChange(v)); return i;
  });
  return { set(v) { inputs.forEach((i) => (i.checked = i.value === v)); }, show(v, on) { inputs.find((i) => i.value === v).parentElement.hidden = !on; }, enable(v, on) { const i = inputs.find((x) => x.value === v); i.disabled = !on; i.parentElement.classList.toggle("disabled", !on); } };
}

function multiSelect(root, { options = [], placeholder = "Type to search…", onChange = () => {} } = {}) {
  let opts = options, lower = opts.map((o) => o.toLowerCase()), sel = [], hits = [], act = -1;
  root.innerHTML = ""; root.classList.add("ms");
  const box = document.createElement("div"), input = document.createElement("input"), list = document.createElement("ul");
  box.className = "ms-box"; input.type = "text"; input.placeholder = placeholder; input.setAttribute("aria-label", placeholder);
  list.className = "ms-list"; list.hidden = true; list.setAttribute("role", "listbox");
  box.append(input); root.append(box, list);
  const emit = () => onChange(sel.slice());
  function drawChips() {
    box.querySelectorAll(".chip").forEach((c) => c.remove());
    for (const v of sel) {
      const c = document.createElement("span"), t = document.createElement("span"), b = document.createElement("button");
      c.className = "chip"; t.textContent = v; t.title = v; b.type = "button"; b.textContent = "×"; b.setAttribute("aria-label", "Remove " + v);
      b.addEventListener("click", () => { sel = sel.filter((x) => x !== v); drawChips(); emit(); });
      c.append(t, b); box.insertBefore(c, input);
    }
    input.placeholder = sel.length ? "" : placeholder;
  }
  function draw() {
    const q = input.value.trim().toLowerCase(); hits = [];
    const chosen = new Set(sel); let more = 0;
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < opts.length; i++) {
        if (chosen.has(opts[i])) continue;
        const p = lower[i].indexOf(q);
        if (q && (pass === 0 ? p !== 0 : p <= 0)) continue;
        if (!q && pass === 1) continue;
        if (hits.length < 80) hits.push(opts[i]); else more++;
      }
    list.innerHTML = ""; act = hits.length ? 0 : -1;
    hits.forEach((h, i) => { const li = document.createElement("li"); li.textContent = h; li.setAttribute("role", "option"); li.setAttribute("aria-selected", i === act); li.addEventListener("mousedown", (e) => { e.preventDefault(); pick(h); }); list.append(li); });
    if (!hits.length) { const li = document.createElement("li"); li.className = "none"; li.textContent = opts.length ? "No matches" : "Loading…"; list.append(li); }
    if (more) { const li = document.createElement("li"); li.className = "more"; li.textContent = `${nf.format(more)} more. Keep typing to narrow the list.`; list.append(li); }
    list.hidden = false;
  }
  function pick(v) { sel = [...sel, v]; input.value = ""; drawChips(); emit(); draw(); }
  function move(d) { if (!hits.length) return; act = (act + d + hits.length) % hits.length; [...list.children].forEach((li, i) => li.setAttribute("aria-selected", i === act)); list.children[act]?.scrollIntoView({ block: "nearest" }); }
  input.addEventListener("input", draw); input.addEventListener("focus", draw);
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 100));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); list.hidden ? draw() : move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { if (!list.hidden && hits[act] !== undefined) { e.preventDefault(); pick(hits[act]); } }
    else if (e.key === "Escape") list.hidden = true;
    else if (e.key === "Backspace" && !input.value && sel.length) { sel = sel.slice(0, -1); drawChips(); emit(); }
  });
  box.addEventListener("click", () => input.focus());
  return {
    get value() { return sel.slice(); },
    set(v) { sel = (v || []).slice(); drawChips(); },
    setOptions(o) { opts = o; lower = o.map((x) => x.toLowerCase()); if (document.activeElement === input) draw(); },
  };
}

// ---------- state ----------
const defaults = (portal) => ({
  dataset: portal.defaults.dataset, rank: portal.defaults.taxon_type || "all", family: portal.defaults.family || [], genus: [], taxon_name: [],
  trait_name: [], traitmode: "name", trait_grouping: [], structure_measured: [], keywords: [], location: "", apc: [],
  min_latitude: "", max_latitude: "", min_longitude: "", max_longitude: "", custom: [],
});
const num = (x) => (x === "" || x === null || x === undefined || Number.isNaN(Number(x)) ? null : Number(x));
function toFilterState(S) {
  const f = { dataset: S.dataset };
  if (S.rank !== "all") { f.taxon_type = S.rank; f[S.rank] = S[S.rank]; }
  if (S.rank === "taxon_name" && A.hint && A.hint.key === S.taxon_name.join("\u0001")) f.taxon_hint = A.hint.v;
  f.trait_name = S.trait_name;
  if (S.traitmode === "features") { f.trait_grouping = S.trait_grouping; f.structure_measured = S.structure_measured; f.keywords = S.keywords; }
  if (S.location) f.location = S.location;
  if (S.location === "apc") f.apc_taxon_distribution = S.apc;
  if (S.location === "georeferenced") for (const k of ["min_latitude", "max_latitude", "min_longitude", "max_longitude"]) f[k] = num(S[k]);
  f.custom = S.custom.filter((c) => c.column && c.value.length && (c.value.some((v) => String(v).trim()))).map((c) => ({ column: c.column, value: c.value }));
  return f;
}

// ---------- app ----------
const A = window.__portal = { cfg: null, portal: null, spec: null, dd: null, feats: null, taxaCols: [], base: "", S: null, applied: null, page: 0, size: 100, sort: null, total: 0, token: 0, citeTok: 0, taxonTok: 0, traitTok: 0, tab: "data", vocab: new Map() };

// read a JSON file; if the server answers with something else, say which file it was
async function getJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Could not read ${url} (server answered ${r.status}, and it is not a JSON file). The file may be missing from the upload.`); }
}
async function main() {
  const cfg = await getJson("config.json");
  A.cfg = cfg; A.base = abs(cfg.dataBase);
  initTelemetry(cfg.telemetry); idle(() => track("login"));
  const get = (n) => getJson(A.base + "/" + n);
  // everything that does not need the engine starts now, in parallel with the engine
  prefetchExtension(cfg);
  const engine = startEngine(cfg);
  engine.catch(() => {}); // reported below
  const quiet = (p) => p.catch(() => null);
  const [portal, spec, dd, dv] = await Promise.all([get("portal.json"), get("filter_spec.json"), get("dropdowns.json"), quiet(get("default_view.json"))]);
  A.portal = portal; A.spec = spec; A.dd = dd;
  document.title = portal.name;
  // the filters and the page are usable while the engine is still starting
  buildUI();
  const fromUrl = readHash();
  A.S = fromUrl ? cleanState(fromUrl, defaults(portal)) : defaults(portal);
  syncUI();
  setApply(false);
  // the first page of the default view is stored as a small file, so it can be shown while the engine starts
  if (!fromUrl && dv && dv.data_version === portal.data_version && Array.isArray(dv.rows) && Number.isFinite(dv.total)) {
    A.applied = JSON.parse(JSON.stringify(A.S)); A.total = dv.total; A.page = 0; A.pre = true;
    render(dv.rows, cols());
  }
  setStatus("Starting the database engine. The first visit downloads about 6 MB; later visits are much faster.");
  await engine;
  boot("Opening the data…");
  for (const s of T.viewSql(A.base)) await run(s);
  A.feats = await run(`SELECT trait, coalesce(structure_measured,'') AS structure_measured, coalesce(trait_group,'') AS trait_group, coalesce(keywords,'') AS keywords FROM read_parquet('${A.base}/trait_features.parquet')`);
  A.taxaCols = (await run("SELECT column_name FROM (DESCRIBE SELECT * FROM taxa)")).map((r) => r.column_name).filter((c) => !["taxon_name", "family", "genus"].includes(c));
  A.engineReady = true; setApply(true);
  if (A.pre) { A.pre = false; writeHash(); updateDownloadUI(); setStatus(""); } // the stored first page is already on screen
  else await apply(true);
  idle(() => keepLookups()); // two small tables are kept in memory, so later queries do not fetch them piece by piece
  idle(() => ensureTaxonNames()); // get the taxon names ready in the background
}
// taxa (1.3 MB) and dataset_citations are joined into almost every query. Read once into memory, they save about 8 round trips on the first query that needs them.
async function keepLookups() {
  try {
    for (const [name, file, cols] of [["taxa", "taxa.parquet", "*"], ["dataset_citations", "dataset_citations.parquet", "dataset_id, source_primary_citation"]]) {
      await run(`CREATE OR REPLACE TABLE ${name}_mem AS SELECT ${cols} FROM read_parquet('${A.base}/${file}')`);
      await run(`CREATE OR REPLACE VIEW ${name} AS SELECT * FROM ${name}_mem`);
    }
  } catch (e) { console.warn("Could not keep the lookup tables in memory; the portal still works.", e); }
}
const setApply = (on) => document.querySelectorAll("#filters button[type=submit]").forEach((b) => (b.disabled = !on));
// warm the browser cache with the Parquet reader while the engine downloads
function prefetchExtension(cfg) { try { fetch(abs(cfg.extensionRepo) + "/" + (cfg.extensionVersion || "v1.4.3") + "/wasm_eh/parquet.duckdb_extension.wasm").catch(() => {}); } catch {} }

function buildUI() {
  const { dd, portal } = A, W = (A.w = {});
  const S = () => A.S;
  W.dataset = radios($("#f-dataset"), "dataset", [["raw", portal.labels.raw], ["species", portal.labels.species]], (v) => { S().dataset = v; syncUI(); if (!$("#filters button[type=submit]").disabled) apply(); });
  W.rank = radios($("#f-rank"), "rank", [["all", "All taxa"], ["family", "Family"], ["genus", "Genus"], ["taxon_name", "Taxon name"]], (v) => { S().rank = v; syncUI(); });
  W.family = multiSelect($("#f-family"), { options: dd.all_family, placeholder: "Choose families…", onChange: (v) => (S().family = v) });
  W.genus = multiSelect($("#f-genus"), { options: dd.all_genus, placeholder: "Choose genera…", onChange: (v) => (S().genus = v) });
  W.taxon_name = multiSelect($("#f-taxon_name"), { options: dd.all_taxon_names || [], placeholder: `Search ${(dd.taxon_name_count || (dd.all_taxon_names || []).length).toLocaleString("en-AU")} taxa…`, onChange: (v) => (S().taxon_name = v) });
  W.trait = multiSelect($("#f-trait"), { options: dd.all_traits, placeholder: "Choose traits…", onChange: (v) => { S().trait_name = v; W.traitmode.enable("features", v.length === 0 || S().traitmode === "features"); } });
  W.traitmode = radios($("#f-traitmode"), "traitmode", [["name", "None"], ["features", "Trait features"]], (v) => { S().traitmode = v; syncUI(); });
  W.grouping = multiSelect($("#f-grouping"), { options: dd.all_trait_groupings, placeholder: "Choose groupings…", onChange: (v) => (S().trait_grouping = v) });
  W.structure = multiSelect($("#f-structure"), { options: dd.all_structure_measured, placeholder: "Choose structures…", onChange: (v) => (S().structure_measured = v) });
  W.keywords = multiSelect($("#f-keywords"), { options: dd.all_keywords, placeholder: "Choose keywords…", onChange: (v) => (S().keywords = v) });
  W.location = radios($("#f-location"), "location", [["", "None"], ["georeferenced", "Georeferenced records"], ["apc", "APC taxon distribution"]], (v) => { S().location = v; syncUI(); });
  W.apc = multiSelect($("#f-apc"), { options: STATES, placeholder: "Choose states…", onChange: (v) => (S().apc = v) });
  for (const k of ["min_latitude", "max_latitude", "min_longitude", "max_longitude"]) $("#" + k).addEventListener("input", (e) => (S()[k] = e.target.value));

  $("#filters").addEventListener("submit", (e) => { e.preventDefault(); apply(); $("#sidebar").classList.remove("open"); $("#menu-btn").setAttribute("aria-expanded", "false"); });
  $("#reset").addEventListener("click", () => { A.S = defaults(A.portal); syncUI(); if (A.engineReady) apply(); });
  $("#menu-btn").addEventListener("click", () => { const o = $("#sidebar").classList.toggle("open"); $("#menu-btn").setAttribute("aria-expanded", o); });
  $("#pagesize").addEventListener("change", (e) => { A.size = Number(e.target.value); A.page = 0; if (A.engineReady && A.applied) loadPage(); });
  $("#first").addEventListener("click", () => goto(0)); $("#prev").addEventListener("click", () => goto(A.page - 1));
  $("#next").addEventListener("click", () => goto(A.page + 1)); $("#last").addEventListener("click", () => goto(lastPage()));
  $("#share").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); $("#share").textContent = "Copied"; setTimeout(() => ($("#share").textContent = "Copy link"), 1500); } catch { prompt("Copy this link", location.href); } });
  for (const t of TABS) $("#tab-" + t).addEventListener("click", () => {
    A.tab = t;
    for (const u of TABS) { $("#tab-" + u).classList.toggle("active", u === t); $("#tab-" + u).setAttribute("aria-selected", u === t); $("#panel-" + u).hidden = u !== t; }
    if (t === "cite") loadCitations();
    if (t === "trait") loadTrait();
    if (t === "taxon") loadTaxon();
    if (t === "info") loadUsage();
  });
  // tooltip on truncated cells
  const tip = $("#tip");
  $("#grid").addEventListener("mouseover", (e) => { const td = e.target.closest("td"); if (td && td.scrollWidth > td.clientWidth) { tip.textContent = td.textContent; tip.hidden = false; td.style.cursor = "help"; } });
  $("#grid").addEventListener("mousemove", (e) => { tip.style.left = Math.min(e.clientX + 14, innerWidth - 420) + "px"; tip.style.top = e.clientY + 16 + "px"; });
  $("#grid").addEventListener("mouseout", () => (tip.hidden = true));
}

function customRows() {
  const root = $("#f-custom"); root.innerHTML = "";
  const spec = A.spec.filters.find((f) => f.id === "custom"), S = A.S;
  const cols = S.dataset === "species" ? spec.species_columns.filter((c) => c !== "value_count") : [...spec.controlled_vocabulary_columns, ...spec.free_text_columns];
  S.custom = S.custom.filter((c) => !c.column || cols.includes(c.column));
  const n = Math.min(spec.max, S.custom.length + (S.custom.length === 0 || S.custom.at(-1).value.length ? 1 : 0));
  while (S.custom.length < n) S.custom.push({ column: "", value: [] });
  S.custom.length = n;
  S.custom.forEach((c, i) => {
    const box = document.createElement("div"); box.className = "cf";
    const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = `Filter ${i + 1}`;
    const sel = document.createElement("select"); sel.setAttribute("aria-label", `Filter ${i + 1} column`);
    sel.append(new Option("(none)", "")); cols.forEach((x) => sel.append(new Option(pretty(x), x))); sel.value = c.column;
    const val = document.createElement("div");
    sel.addEventListener("change", () => { c.column = sel.value; c.value = []; customRows(); });
    box.append(lab, sel, val); root.append(box);
    if (!c.column) return;
    if (spec.controlled_vocabulary_columns.includes(c.column)) {
      const ms = multiSelect(val, { placeholder: "Choose values…", onChange: (v) => { const had = c.value.length; c.value = v; if ((had === 0) !== (v.length === 0)) customRows(); } });
      ms.set(c.value); vocab(c.column).then((o) => ms.setOptions(o));
    } else {
      const t = document.createElement("input"); t.type = "text"; t.placeholder = "Text to find (use | for “or”)"; t.value = c.value[0] || "";
      t.addEventListener("input", () => { c.value = t.value.trim() ? [t.value] : []; });
      t.addEventListener("change", () => customRows());
      val.append(t);
    }
  });
}
async function vocab(col) {
  const S = A.S, key = S.dataset + "|" + col;
  if (A.vocab.has(key)) return A.vocab.get(key);
  let rows;
  if (col === "dataset_id" && S.dataset === "species") rows = A.dd.all_dataset_ids_species;
  else if (col === "basis_of_record") rows = A.dd.all_bor;
  else if (col === "life_stage") rows = A.dd.all_age;
  else {
    const from = A.taxaCols.includes(col) ? "taxa" : S.dataset + "_f";
    rows = (await run(`SELECT DISTINCT "${col}" AS v FROM ${from} WHERE "${col}" IS NOT NULL ORDER BY 1`)).map((r) => String(r.v));
  }
  A.vocab.set(key, rows); return rows;
}

// The long list of taxon names is a separate file, read only when it is needed
async function ensureTaxonNames() {
  if (A.dd.all_taxon_names) return;
  if (!A.taxonNamesP) A.taxonNamesP = getJson(A.base + "/taxon_names.json").then((names) => { A.dd.all_taxon_names = names; A.w.taxon_name.setOptions(names); }).catch((e) => { A.taxonNamesP = null; console.error(e); });
  return A.taxonNamesP;
}
function syncUI() {
  const S = A.S, W = A.w;
  W.dataset.set(S.dataset); W.rank.set(S.rank); W.family.set(S.family); W.genus.set(S.genus); W.taxon_name.set(S.taxon_name);
  W.trait.set(S.trait_name); W.traitmode.set(S.traitmode); W.grouping.set(S.trait_grouping); W.structure.set(S.structure_measured); W.keywords.set(S.keywords);
  W.location.set(S.location); W.apc.set(S.apc);
  W.traitmode.enable("features", S.trait_name.length === 0 || S.traitmode === "features"); // Trait features can only be switched on while no trait name is selected
  if (S.dataset === "species" && S.location === "georeferenced") S.location = "";
  W.location.show("georeferenced", S.dataset === "raw"); W.location.set(S.location);
  for (const k of ["min_latitude", "max_latitude", "min_longitude", "max_longitude"]) $("#" + k).value = S[k];
  for (const r of ["family", "genus", "taxon_name"]) $("#w-" + r).hidden = S.rank !== r;
  if (S.rank === "taxon_name") ensureTaxonNames();
  $("#w-features").hidden = S.traitmode !== "features";
  $("#w-apc").hidden = S.location !== "apc"; $("#w-bbox").hidden = S.location !== "georeferenced";
  customRows();
}

function cols() { return A.applied.dataset === "species" ? SPECIES_COLS : RAW_COLS; }
const lastPage = () => Math.max(0, Math.ceil(A.total / A.size) - 1);
function goto(p) { if (!A.engineReady || !A.applied) return; A.page = Math.min(Math.max(0, p), lastPage()); loadPage(); }
function setStatus(msg, err) { const s = $("#status"), t = $("#status-text"); s.hidden = !msg; t.textContent = msg || ""; s.classList.toggle("err", !!err); }

const TABS = ["data", "info", "taxon", "trait", "cite"];
// Citations: only worked out when the tab is open, and only again when the applied filters change
async function loadCitations() {
  if (!A.applied || !A.engineReady) return;
  const key = JSON.stringify(A.applied);
  if (A.citeKey === key) return;
  const tok = ++A.citeTok, body = $("#cite-body"), st = $("#cite-status");
  st.hidden = false; $("#cite-status-text").textContent = "Collecting the references…"; body.innerHTML = "";
  try {
    const stt = toFilterState(A.applied);
    const rows = await run(T.keysSql(stt, A.spec, A.feats, A.taxaCols));
    const keys = [...new Set(rows.flatMap((r) => (r.k == null ? [] : String(r.k).split("; "))))].sort();
    if (!keys.length) { if (tok === A.citeTok) { st.hidden = true; body.innerHTML = "<p>No rows match the filters, so there is nothing to cite.</p>"; } return; }
    const q = keys.map((k) => "'" + k.replace(/'/g, "''") + "'").join(",");
    const refs = (await run(`SELECT source_primary_citation AS c FROM sources WHERE source_primary_key IN (${q}) ORDER BY source_primary_key`)).map((r) => r.c).filter(Boolean);
    if (tok !== A.citeTok) return;
    body.innerHTML = markdownToHtml(citationText(A.portal.zenodo_meta, keys, refs));
    A.citeKey = key; st.hidden = true;
  } catch (e) { if (tok === A.citeTok) { st.hidden = true; body.innerHTML = ""; fail(e); } }
}
// Usage figures on the App Information tab (Supabase, read-only view)
const dlText = (text, name, type) => { const u = URL.createObjectURL(new Blob([text], { type })); const l = document.createElement("a"); l.href = u; l.download = name; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); };
async function loadUsage() {
  try {
    const rows = await monthly();
    if (!rows) return;
    const nf = new Intl.NumberFormat("en-AU"), sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    $("#usage-off").hidden = true; $("#usage").hidden = false;
    $("#m-sessions").textContent = nf.format(sum("logins")); $("#m-searches").textContent = nf.format(sum("searches")); $("#m-downloads").textContent = nf.format(sum("downloads"));
    const tb = $("#u-table tbody"); tb.textContent = "";
    for (const r of rows) { const tr = document.createElement("tr"); for (const v of [r.month, nf.format(r.logins), nf.format(r.searches), nf.format(r.downloads)]) { const td = document.createElement("td"); td.textContent = String(v); tr.append(td); } tb.append(tr); }
    const day = new Date().toISOString().slice(0, 10);
    $("#u-csv").onclick = () => dlText(counterCsv(rows), `austraits_counter_metrics_${day}.csv`, "text/csv");
    $("#u-json").onclick = () => dlText(counterJson(rows), `austraits_counter_metrics_${day}.json`, "application/json");
  } catch (e) { $("#usage-off").hidden = false; $("#usage-off").textContent = String((e && e.message) || e); }
}
// Download: warn from 100,000 rows, refuse above the cap, build the zip in the browser
function updateDownloadUI() {
  const btn = $("#download"), warn = $("#dl-warn"), note = $("#dl-note"), n = A.total || 0;
  const cap = A.portal?.download_cap_rows ?? 300000, warnAt = A.portal?.download_warn_rows ?? 100000, nf = new Intl.NumberFormat("en-AU");
  A.dlConfirm = false; btn.classList.remove("warning"); warn.hidden = true; note.hidden = true; note.textContent = "";
  btn.textContent = "⬇ Download Data";
  if (!A.applied || !n || !A.engineReady) { btn.disabled = true; return; }
  if (n > cap) { btn.disabled = true; note.hidden = false; note.textContent = `Too many rows to download here (${nf.format(n)}; the limit is ${nf.format(cap)}). Narrow the filters, for example pick a trait or a family.`; return; }
  btn.disabled = false;
  if (n >= warnAt) { warn.hidden = false; warn.textContent = `⚠ Large download: ${nf.format(n)} rows`; btn.classList.add("warning"); btn.textContent = `Confirm & Download (${nf.format(n)} rows)`; }
}
async function doDownload() {
  const btn = $("#download"), note = $("#dl-note");
  btn.disabled = true; note.hidden = false;
  try {
    const stt = toFilterState(A.applied), t0 = performance.now();
    const { zip } = await buildZip({ db: A.db, run, dataSql: T.downloadSql(stt, A.spec, A.feats, A.taxaCols), keysSql: T.keysSql(stt, A.spec, A.feats, A.taxaCols), base: A.base, meta: A.portal.zenodo_meta, onStep: (s) => { note.textContent = s; } });
    track("download", { dataset_type: A.applied.dataset, trait: A.applied.trait_name?.length ? A.applied.trait_name : null, rows: A.total });
    saveBlob(zip, "austraits-" + new Date().toISOString().slice(0, 10) + ".zip");
    note.textContent = `Downloaded (${(zip.length / 1048576).toFixed(1)} MB, ${((performance.now() - t0) / 1000).toFixed(1)} s).`;
  } catch (e) { console.error(e); note.textContent = "The download failed: " + ((e && e.message) || e); }
  finally { btn.disabled = false; }
}
// Taxon View: needs rank = taxon name and exactly one taxon; reads only that taxon's rows
const q1 = (s) => "'" + String(s).replace(/'/g, "''") + "'";
async function loadTaxon() {
  if (!A.applied || !A.engineReady) return;
  const key = JSON.stringify(A.applied);
  if (A.taxonKey === key) return;
  const tok = ++A.taxonTok, st = $("#taxon-status"), body = $("#taxon-body");
  const names = A.applied.rank === "taxon_name" ? A.applied.taxon_name : null;
  if (!names || names.length !== 1) { st.hidden = true; body.innerHTML = TX.emptyState(); A.taxonKey = key; return; }
  const taxon = names[0];
  st.hidden = false; $("#taxon-status-text").textContent = "Loading the taxon profile…"; body.innerHTML = "";
  try {
    if (!A.taxonViews) {
      const f = (n) => q1(A.base.replace(/\/$/, "") + "/" + n);
      await run(`CREATE OR REPLACE VIEW taxon_synonyms AS SELECT * FROM read_parquet(${f("taxon_synonyms.parquet")})`);
      await run(`CREATE OR REPLACE VIEW flora_links AS SELECT * FROM read_parquet(${f("flora_links.parquet")})`);
      A.taxonViews = true;
    }
    if (!A.taxonExtras) A.taxonExtras = await getJson(A.base + "/taxon_extras.json");
    const t = q1(taxon);
    const [info, datasets, means, syn, fl] = await Promise.all([
      run(`SELECT * FROM taxa WHERE taxon_name = ${t}`),
      run(`SELECT r.dataset_id, count(DISTINCT r.trait_name) AS n_traits, count(*) AS n_records, any_value(c.source_primary_citation) AS reference FROM raw_taxon_f r LEFT JOIN dataset_citations c USING (dataset_id) WHERE r.taxon_name = ${t} GROUP BY r.dataset_id`),
      run(`SELECT trait_name, unit, value_mean, value_min, value_max, value_range, dataset_id, type FROM species_f WHERE taxon_name = ${t}`),
      run(`SELECT scientific_name, taxonomic_status, kind FROM taxon_synonyms WHERE taxon_name = ${t} ORDER BY kind, scientific_name`),
      run(`SELECT source, url FROM flora_links WHERE taxon_name = ${t}`),
    ]);
    if (tok !== A.taxonTok) return;
    if (!info.length) { st.hidden = true; body.innerHTML = TX.emptyState(); A.taxonKey = key; return; }
    const nTraits = (await run(`SELECT count(DISTINCT trait_name) AS n FROM raw_taxon_f WHERE taxon_name = ${t}`))[0].n;
    if (tok !== A.taxonTok) return;
    const clean = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])));
    body.innerHTML = TX.taxonHtml({ taxon, info: clean(info)[0], datasets: clean(datasets), means: clean(means), groups: A.taxonExtras.trait_groups, syn: clean(syn), apcVersion: A.taxonExtras.apc_version, floraLinks: clean(fl), nTraits: Number(nTraits) });
    st.hidden = true; A.taxonKey = key;
  } catch (e) { if (tok === A.taxonTok) { st.hidden = true; fail(e); } }
}
// Trait View: only worked out when the tab is open, and only again when the applied filters change
function loadCss(href) { if (document.querySelector(`link[href="${href}"]`)) return; const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); }
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Could not load " + src)); document.head.append(s); }); }
async function loadTrait() {
  if (!A.applied || !A.engineReady) return;
  const key = JSON.stringify(A.applied);
  if (A.traitKey === key) return;
  const tok = ++A.traitTok, st = $("#trait-status"), body = $("#trait-body");
  const show = (id, on) => { $("#" + id).hidden = !on; };
  st.hidden = false; $("#trait-status-text").textContent = "Loading the trait profile…"; body.hidden = true;
  try {
    const stt = toFilterState(A.applied), species = A.applied.dataset === "species";
    const cov = (await run(T.selectSql(stt, A.spec, A.feats, A.taxaCols, "count(DISTINCT trait_name) AS nt, min(trait_name) AS trait, count(*) AS n, count(DISTINCT taxon_name) AS taxa, count(DISTINCT family) AS families, count(DISTINCT dataset_id) AS datasets")))[0];
    if (tok !== A.traitTok) return;
    const nt = Number(cov.nt);
    $("#tv-banner").replaceChildren(); $("#tv-profile").replaceChildren(); show("tv-plotcard", false); show("tv-geocard", false);
    if (nt !== 1) { $("#tv-profile").append(Object.assign(document.createElement("p"), { textContent: "Please select a single trait to view." })); st.hidden = true; body.hidden = false; A.traitKey = key; return; }
    const trait = cov.trait;
    if (!A.traitDefs) A.traitDefs = await getJson(A.base + "/trait_definitions.json");
    if (tok !== A.traitTok) return;
    $("#tv-banner").append(TV.banner(species));
    $("#tv-profile").append(TV.profile(trait, A.traitDefs[trait], { n: Number(cov.n), taxa: Number(cov.taxa), families: Number(cov.families), datasets: Number(cov.datasets) }));
    st.hidden = true; body.hidden = false;
    // chart
    $("#tv-plottext").innerHTML = species
      ? "<p>The plot below shows the distribution of species-level mean values for this trait.</p><p>Each point represents the mean trait value for a species, calculated from all available observations for that species.</p>"
      : "<p>The plot below shows the distribution of selected data for this trait, including data collected on individuals of all age classes (seedling, sapling, adult), in field and glasshouse settings.</p><p>Visualising data records across the families with the most data for the trait indicates the taxonomic breadth of information for this trait</p>";
    show("tv-plotcard", true); $("#tv-plot").textContent = "Drawing the chart…";
    const valCol = species ? "value_mean" : "value";
    const rows = await run(T.selectSql(stt, A.spec, A.feats, A.taxaCols, `family, taxon_name, dataset_id, ${valCol} AS value, value_type, unit`));
    if (tok !== A.traitTok) return;
    const unit = rows.length ? rows[0].unit : null;
    if (unit == null) TV.drawCategorical($("#tv-plot"), rows); else TV.drawNumeric($("#tv-plot"), rows, unit);
    // map (raw data only)
    if (!species) {
      show("tv-geocard", true);
      const pts = (await run(T.selectSql(stt, A.spec, A.feats, A.taxaCols, `TRY_CAST("latitude (deg)" AS DOUBLE) AS lat, TRY_CAST("longitude (deg)" AS DOUBLE) AS lon, dataset_id, taxon_name`))).filter((r) => r.lat != null && r.lon != null && r.lat >= -90 && r.lat <= 90 && r.lon >= -180 && r.lon <= 180).map((r) => ({ lat: r.lat, lon: r.lon, label: r.dataset_id + " | " + r.taxon_name }));
      if (tok !== A.traitTok) return;
      $("#tv-geotext").innerHTML = `<p>Of the <strong>${Number(cov.n).toLocaleString("en-AU")}</strong> records for this trait, <strong>${pts.length.toLocaleString("en-AU")}</strong> have latitude and longitude coordinates.</p><p>The map below shows the geographical distribution of trait data for this trait. The data are shown as points on the map.</p>`;
      if (!window.L) { loadCss("vendor/leaflet/leaflet.css"); await loadScript("vendor/leaflet/leaflet.js"); }
      TV.drawMap($("#tv-map"), pts);
    }
    A.traitKey = key;
  } catch (e) { if (tok === A.traitTok) { st.hidden = true; fail(e); } }
}
async function apply(first) {
  const tok = ++A.token;
  A.applied = JSON.parse(JSON.stringify(A.S)); A.page = 0; A.sort = null;
  if (!first) track("search", { dataset_type: A.applied.dataset, trait: A.applied.trait_name?.length ? A.applied.trait_name : null });
  if (A.tab === "cite") queueMicrotask(loadCitations);
  if (A.tab === "trait") queueMicrotask(loadTrait);
  if (A.tab === "taxon") queueMicrotask(loadTaxon);
  writeHash();
  $("#table-wrap").classList.add("busy"); setStatus("Counting matching rows…");
  try {
    await findHint(A.applied, tok);
    const st = toFilterState(A.applied);
    const sql = T.countSql(st, A.spec, A.feats, A.taxaCols);
    const t0 = performance.now(), r = await run(sql);
    if (tok !== A.token) return;
    A.total = r[0].n; A.countMs = performance.now() - t0; updateDownloadUI();
    await loadPage(tok);
  } catch (e) { fail(e); }
}

// Family and genus of the chosen taxon names. Adding them to the filter changes no result, but the raw file is sorted by family and genus, so the reader can skip most row groups.
async function findHint(S, tok) {
  if (S.rank !== "taxon_name" || !S.taxon_name.length || S.taxon_name.length > 200) { A.hint = null; return; }
  const key = S.taxon_name.join("\u0001");
  if (A.hint && A.hint.key === key) return;
  try {
    const list = S.taxon_name.map((n) => "'" + String(n).replace(/'/g, "''") + "'").join(",");
    const rows = await run(`SELECT DISTINCT family, genus FROM taxa WHERE taxon_name IN (${list})`);
    if (tok !== A.token) return;
    const fam = [...new Set(rows.map((r) => r.family).filter((x) => x))], gen = [...new Set(rows.map((r) => r.genus).filter((x) => x))];
    A.hint = fam.length && gen.length ? { key, v: { family: fam, genus: gen } } : null;
  } catch { A.hint = null; }
}
async function loadPage(tok = A.token) {
  $("#table-wrap").classList.add("busy");
  try {
    const st = toFilterState(A.applied), c = cols();
    const q = A.applied.dataset === "species" ? [...c, "unit"] : c;
    const sort = A.sort ? { column: A.sort.column, desc: A.sort.desc, numeric: NUMERIC_SORT.has(A.sort.column) } : undefined;
    const P = T.pageSql(st, A.spec, A.feats, A.taxaCols, A.size, A.page * A.size, sort, q);
    const ids = (await run(P.idStep)).map((r) => r.seq);
    const rows = ids.length ? await run(P.finish(ids)) : [];
    if (tok !== A.token) return;
    render(rows, c);
  } catch (e) { fail(e); }
}

function render(rows, c) {
  A.lastRows = rows;
  const head = $("#grid thead"), body = $("#grid tbody");
  head.innerHTML = ""; body.innerHTML = "";
  const tr = document.createElement("tr");
  for (const col of c) {
    const th = document.createElement("th"); th.scope = "col"; th.tabIndex = 0;
    const on = A.sort?.column === col;
    th.setAttribute("aria-sort", on ? (A.sort.desc ? "descending" : "ascending") : "none");
    const ar = document.createElement("span"); ar.className = "arrow"; ar.setAttribute("aria-hidden", "true"); ar.dataset.dir = on ? (A.sort.desc ? "desc" : "asc") : "";
    ar.innerHTML = '<i class="up"></i><i class="dn"></i>'; th.append(col, ar);
    const sortBy = () => { if (!A.engineReady) return; A.sort = on && A.sort.desc ? null : { column: col, desc: on }; A.page = 0; loadPage(); };
    th.addEventListener("click", sortBy); th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sortBy(); } });
    tr.append(th);
  }
  head.append(tr);
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const row = document.createElement("tr");
    for (const col of c) {
      let v = r[col]; if (col === "value_mean" && v != null && r.unit) v = v + " " + r.unit;
      const td = document.createElement("td"); td.textContent = v == null ? "" : String(v); row.append(td);
    }
    frag.append(row);
  }
  body.append(frag);
  const from = A.total ? A.page * A.size + 1 : 0, to = Math.min(A.total, (A.page + 1) * A.size);
  $("#summary").innerHTML = A.total ? `Showing ${nf.format(from)} to ${nf.format(to)} of <strong>${nf.format(A.total)}</strong> rows <small>(${A.applied.dataset === "raw" ? A.portal.labels.raw : A.portal.labels.species})</small>` : "No rows match these filters";
  $("#pageinfo").textContent = A.total ? `Page ${nf.format(A.page + 1)} of ${nf.format(lastPage() + 1)}` : "";
  $("#first").disabled = $("#prev").disabled = A.page === 0; $("#next").disabled = $("#last").disabled = A.page >= lastPage();
  setStatus(A.total ? "" : "Nothing matches. Try removing a filter.");
  $("#table-wrap").classList.remove("busy");
  $("#table-wrap").scrollTop = 0;
}
function fail(e) { console.error(e); setStatus("Something went wrong while reading the data: " + (e && e.message ? e.message : e), true); $("#table-wrap").classList.remove("busy"); }

// ---------- link sharing ----------
function writeHash() { try { history.replaceState(null, "", "#s=" + encodeURIComponent(JSON.stringify(A.applied))); } catch {} }
function readHash() { try { const m = location.hash.match(/^#s=(.+)$/); return m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch { return null; } }
// A shared link is only a suggestion: keep the values that have the right type and are on the allowed list, drop the rest
function cleanState(raw, base) {
  const out = { ...base };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const oneOf = (v, list) => (typeof v === "string" && list.includes(v) ? v : null);
  const list = (v) => (Array.isArray(v) && v.length <= 5000 && v.every((x) => typeof x === "string") ? v : null);
  const pick = (k, v) => { if (v !== null && v !== undefined) out[k] = v; };
  pick("dataset", oneOf(raw.dataset, ["raw", "species"]));
  pick("rank", oneOf(raw.rank, ["all", "family", "genus", "taxon_name"]));
  pick("traitmode", oneOf(raw.traitmode, ["name", "features"]));
  pick("location", oneOf(raw.location, ["", "georeferenced", "apc"]));
  for (const k of ["family", "genus", "taxon_name", "trait_name", "trait_grouping", "structure_measured", "keywords", "apc"]) pick(k, list(raw[k]));
  for (const k of ["min_latitude", "max_latitude", "min_longitude", "max_longitude"]) pick(k, raw[k] === "" || (["string", "number"].includes(typeof raw[k]) && Number.isFinite(Number(raw[k]))) ? String(raw[k]) : null);
  if (Array.isArray(raw.custom)) out.custom = raw.custom.slice(0, 20).filter((c) => c && typeof c.column === "string" && list(c.value)).map((c) => ({ column: c.column, value: c.value }));
  return out;
}

function initSplitter() {
  const sp = $("#splitter"), root = document.documentElement, KEY = "austraits.sideW", DEF = 340;
  const clamp = (w) => Math.max(240, Math.min(w, 640, Math.round(window.innerWidth * 0.6)));
  const set = (w, save) => { w = clamp(w); root.style.setProperty("--side-w", w + "px"); if (save) { try { localStorage.setItem(KEY, w); } catch (e) {} } return w; };
  try { const s = parseInt(localStorage.getItem(KEY), 10); if (s) set(s); } catch (e) {}
  sp.addEventListener("pointerdown", (e) => {
    e.preventDefault(); sp.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
    const mv = (ev) => set(ev.clientX, false);
    const up = (ev) => { sp.removeEventListener("pointermove", mv); sp.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); set(ev.clientX, true); };
    sp.addEventListener("pointermove", mv); sp.addEventListener("pointerup", up);
  });
  sp.addEventListener("dblclick", () => set(DEF, true));
  sp.addEventListener("keydown", (e) => {
    const cur = $("#sidebar").getBoundingClientRect().width;
    if (e.key === "ArrowLeft") { e.preventDefault(); set(cur - 20, true); }
    if (e.key === "ArrowRight") { e.preventDefault(); set(cur + 20, true); }
  });
}
(function () {
  const t = $("#side-toggle"), K = "austraits.sideHidden";
  const set = (hide, save) => { document.body.classList.toggle("side-collapsed", hide); t.setAttribute("aria-expanded", String(!hide)); t.setAttribute("aria-label", hide ? "Show filters" : "Hide filters"); if (save) { try { localStorage.setItem(K, hide ? "1" : "0"); } catch (e) {} } };
  try { if (localStorage.getItem(K) === "1") set(true); } catch (e) {}
  t.addEventListener("click", () => set(!document.body.classList.contains("side-collapsed"), true));
})();
initSplitter();
$("#download").addEventListener("click", doDownload);
main().catch((e) => { console.error(e); setStatus("The portal could not start: " + (e && e.message ? e.message : e), true); });
