// APCalign-app in the browser: the page logic.
// R (APCalign matching code) runs in the browser through webR; see README.md.
const $ = (id) => document.getElementById(id);
const CHUNK = 1500;   // names per call: small chunks are slower because each call has a fixed cost
const PKGS = ["rlang", "cli", "tibble", "dplyr", "purrr", "stringi", "stringr", "stringdist", "crayon"];
let webR, shelter, ready = false, DATA_URL = "";
let fileRows = null, lastCsv = "";
const tbl = { head: [], rows: [], view: [], sortCol: -1, sortDir: 1, page: 0, size: 10, q: "" };

const getBytes = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`); return new Uint8Array(await r.arrayBuffer()); };
const Rrun = async (code) => { await shelter.captureR(code, { captureConditions: false }); };
const Rnum = async (code) => { const r = await shelter.evalR(code); const a = await r.toArray(); return a[0]; };
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
  for (const t of ["output", "start", "faq"]) $("tab-" + t).classList.toggle("hide", t !== b.dataset.tab);
}));

// ---------- input ----------
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
const inputType = () => document.querySelector('input[name="inputType"]:checked').value;
function fillColumns() {
  const head = fileRows ? fileRows[0] : [];
  const opts = head.map((h, i) => `<option value="${i}">${String(h || "column " + (i + 1)).replace(/[&<>"]/g, "")}</option>`).join("");
  $("sp_col").innerHTML = opts; $("col").innerHTML = opts;
}
function currentRows() {
  // returns [{name, id}] in input order
  if (inputType() === "paste") return $("names_input").value.split(",").map((s) => ({ name: s.trim(), id: "" })).filter((r) => r.name);
  if (!fileRows) return [];
  const sp = Number($("sp_col").value) || 0, ic = Number($("col").value) || 0, useId = $("ident").checked;
  return fileRows.slice(1).map((r) => ({ name: (r[sp] ?? "").trim(), id: useId ? (r[ic] ?? "").trim() : "" })).filter((r) => r.name);
}
function updateInputUi() {
  const up = inputType() === "upload";
  $("pasteBox").classList.toggle("hide", up); $("uploadBox").classList.toggle("hide", !up);
  $("identWrap").classList.toggle("hide", !(up && $("ident").checked));
  $("submit").disabled = !ready;
}
document.querySelectorAll('input[name="inputType"]').forEach((r) => r.addEventListener("change", updateInputUi));
$("ident").addEventListener("change", updateInputUi);
$("file_input").addEventListener("change", async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  $("fileName").textContent = f.name;
  fileRows = parseCsv((await f.text()).replace(/^﻿/, ""));
  fillColumns();
});

// ---------- matching ----------
async function matchRows(rows, splits, full, onProgress) {
  const useId = rows.some((r) => r.id);
  const clean = (s) => s.replace(/[\t\r\n]+/g, " ");
  const text = rows.map((r) => clean(r.name) + (useId ? "\t" + clean(r.id) : "")).join("\n");
  await webR.FS.writeFile("/home/web_user/in.txt", new TextEncoder().encode(text));
  const n = await Rnum(`e$app_start("/home/web_user/in.txt", "${splits}", ${full ? "TRUE" : "FALSE"})`);
  const chunks = Math.ceil(n / CHUNK), t0 = performance.now();
  for (let i = 1; i <= chunks; i++) {
    await Rnum(`e$app_chunk(res, ${i}, ${CHUNK})`);
    await shelter.purge();
    onProgress(i / chunks, (performance.now() - t0) / 1000);
    await tick();
  }
  await Rnum(`e$app_finish("/home/web_user/out.csv")`);
  const bytes = await webR.FS.readFile("/home/web_user/out.csv");
  return { text: new TextDecoder("utf-8").decode(bytes), n, secs: (performance.now() - t0) / 1000 };
}

// ---------- table ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function setTable(csv) {
  const rows = parseCsv(csv);
  tbl.head = rows[0] || [];
  tbl.rows = rows.slice(1).map((r) => r.map((v) => (v === "NA" ? "" : v)));
  tbl.lower = null; tbl.sortCol = -1; tbl.page = 0; tbl.q = ""; $("search").value = "";
  applyView();
}
function applyView() {
  if (tbl.q) {
    if (!tbl.lower) tbl.lower = tbl.rows.map((r) => r.join("\u0001").toLowerCase());
    const q = tbl.q.toLowerCase();
    tbl.view = tbl.rows.filter((_, i) => tbl.lower[i].includes(q));
  } else tbl.view = tbl.rows.slice();
  if (tbl.sortCol >= 0) {
    const c = tbl.sortCol, d = tbl.sortDir;
    const num = tbl.view.every((r) => r[c] === "" || !isNaN(Number(r[c])));
    tbl.view.sort((a, b) => {
      if (a[c] === "" && b[c] !== "") return 1; if (b[c] === "" && a[c] !== "") return -1;
      return d * (num ? Number(a[c]) - Number(b[c]) : String(a[c]).localeCompare(String(b[c]), undefined, { numeric: true }));
    });
  }
  renderTable();
}
function renderTable() {
  const total = tbl.view.length, pages = Math.max(1, Math.ceil(total / tbl.size));
  tbl.page = Math.min(tbl.page, pages - 1);
  const start = tbl.page * tbl.size, end = Math.min(total, start + tbl.size);
  let h = "<thead><tr>" + tbl.head.map((c, i) => `<th data-c="${i}">${esc(c)}<span class="arrow">${tbl.sortCol === i ? (tbl.sortDir > 0 ? "▲" : "▼") : ""}</span></th>`).join("") + "</tr></thead><tbody>";
  for (const r of tbl.view.slice(start, end)) h += "<tr>" + r.map((v) => `<td class="truncated" title="${esc(v)}">${esc(v)}</td>`).join("") + "</tr>";
  $("tbl").innerHTML = h + "</tbody>";
  $("info").textContent = total ? `Showing ${start + 1} to ${end} of ${total.toLocaleString()} entries` + (tbl.q ? ` (filtered from ${tbl.rows.length.toLocaleString()} total entries)` : "") : "No matching entries";
  const btn = (label, p, dis, cur) => `<button data-p="${p}" ${dis ? "disabled" : ""} class="${cur ? "cur" : ""}">${label}</button>`;
  let pg = btn("Previous", tbl.page - 1, tbl.page === 0);
  const lo = Math.max(0, Math.min(tbl.page - 2, pages - 5)), hi = Math.min(pages, lo + 5);
  if (lo > 0) pg += btn("1", 0) + (lo > 1 ? "<span>…</span>" : "");
  for (let p = lo; p < hi; p++) pg += btn(p + 1, p, false, p === tbl.page);
  if (hi < pages) pg += (hi < pages - 1 ? "<span>…</span>" : "") + btn(pages, pages - 1);
  $("pager").innerHTML = pg + btn("Next", tbl.page + 1, tbl.page >= pages - 1);
}
$("tbl").addEventListener("click", (e) => { const th = e.target.closest("th"); if (!th) return; const c = Number(th.dataset.c); tbl.sortDir = tbl.sortCol === c ? -tbl.sortDir : 1; tbl.sortCol = c; applyView(); });
$("pager").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.disabled) return; tbl.page = Number(b.dataset.p); renderTable(); });
$("pagesize").addEventListener("change", () => { tbl.size = Number($("pagesize").value); tbl.page = 0; renderTable(); });
$("search").addEventListener("input", () => { tbl.q = $("search").value.trim(); tbl.page = 0; applyView(); });

// ---------- submit and download ----------
$("submit").addEventListener("click", async () => {
  const rows = currentRows();
  $("error").classList.add("hide");
  if (!rows.length) { $("error").textContent = inputType() === "paste" ? "Please enter at least one taxon name." : "Please select a .csv file and the column that contains the taxon names."; $("error").classList.remove("hide"); return; }
  const splits = document.querySelector('input[name="taxonomic_splits"]:checked').value, full = $("full").checked;
  $("submit").disabled = true; $("download_table").disabled = true;
  $("instructions").classList.add("hide"); $("tablearea").classList.add("hide"); $("running").classList.remove("hide"); $("bar").value = 0;
  $("runMsg").textContent = `Matching ${rows.length.toLocaleString()} names …`;
  document.querySelector('[data-tab="output"]').click();
  try {
    const r = await matchRows(rows, splits, full, (p, s) => { $("bar").value = p * 100; $("runMsg").textContent = `Matching ${rows.length.toLocaleString()} names: ${Math.round(p * 100)}% done` + (p > 0.05 && p < 1 ? `, about ${Math.max(0, s / p - s).toFixed(0)} s left` : ""); });
    lastCsv = r.text; setTable(r.text);
    $("tablearea").classList.remove("hide"); $("download_table").disabled = false;
  } catch (e) {
    $("error").textContent = "Something went wrong: " + (e && e.message ? e.message : e); $("error").classList.remove("hide"); $("instructions").classList.remove("hide");
  }
  $("running").classList.add("hide"); $("submit").disabled = !ready;
});
$("download_table").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([lastCsv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `APCalign_taxa_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

// ---------- speed test (only shown with ?speedtest in the address) ----------
if (new URLSearchParams(location.search).has("speedtest")) $("speedpanel").classList.remove("hide");
$("speed").addEventListener("click", async () => {
  $("speed").disabled = true; const out = [];
  const say = (s) => { out.push(s); $("report").value = out.join("\n"); };
  try {
    say(`Browser: ${navigator.userAgent}`); say(`Cores: ${navigator.hardwareConcurrency}`);
    for (const n of [100, 1000, 3000]) {
      await Rrun(`set.seed(1); nm <- unique(res$APC$canonical_name[res$APC$taxon_rank %in% "species"]); nm <- nm[!is.na(nm)]
        b <- sample(nm, ${n}, TRUE); k <- sample(${n}, round(${n} * 0.2))
        b[k] <- vapply(b[k], function(x) { i <- sample(nchar(x), 1); substr(x, i, i) <- sample(letters, 1); x }, "")
        writeLines(b, "/home/web_user/speed.txt")`);
      const names = new TextDecoder().decode(await webR.FS.readFile("/home/web_user/speed.txt")).split("\n").filter(Boolean).map((name) => ({ name, id: "" }));
      const r = await matchRows(names, "most_likely_species", false, () => {});
      say(`${names.length} names: ${r.secs.toFixed(1)} s (${(r.secs / names.length * 1000).toFixed(1)} ms per name)`);
    }
    say("Done.");
  } catch (e) { say("ERROR: " + (e && e.message ? e.message : e)); }
  $("speed").disabled = false;
});

// ---------- start-up ----------
(async () => {
  try {
    const t0 = performance.now(), bar = $("loadbar");
    const step = (p, m) => { bar.value = p; $("loadMsg").textContent = m; };
    step(2, "Loading R in the browser …");
    const cfg = await (await fetch("config.json")).json();
    if (cfg.release) $("rel").textContent = cfg.release;
    DATA_URL = new URLSearchParams(location.search).get("data") || cfg.dataUrl;
    const { WebR } = await import("https://webr.r-wasm.org/latest/webr.mjs");
    webR = new WebR(); await webR.init(); shelter = await new webR.Shelter();
    for (let i = 0; i < PKGS.length; i++) { step(8 + i * 6, `Installing R package ${PKGS[i]} …`); await webR.installPackages([PKGS[i]], { quiet: true }); }
    step(65, "Loading the matching code …");
    await webR.FS.mkdir("/home/web_user/R");
    const mbytes = await getBytes("R/manifest.txt");
    const files = new TextDecoder().decode(mbytes).split(/\r?\n/).filter(Boolean);
    await webR.FS.writeFile("/home/web_user/R/manifest.txt", mbytes);
    for (const f of [...files, "app.R"]) await webR.FS.writeFile(`/home/web_user/R/${f}`, await getBytes(`R/${f}`));
    step(72, "Downloading the plant census data …");
    await webR.FS.writeFile("/home/web_user/resources.rds", await getBytes(DATA_URL));
    await Rrun(`e <- new.env(); e[["%>%"]] <- dplyr::\`%>%\`
      for (f in c(readLines("/home/web_user/R/manifest.txt"), "app.R")) sys.source(file.path("/home/web_user/R", f), envir = e, keep.source = FALSE)
      options(expressions = 500000)`);
    step(85, "Reading the plant census data …");
    await Rrun(`res <- readRDS("/home/web_user/resources.rds")`);
    ready = true; $("speed").disabled = false; $("loading").classList.add("hide");
    $("submit").textContent = "Submit"; updateInputUi();
    console.log(`APCalign ready in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    $("loadMsg").textContent = "Could not start: " + (e && e.message ? e.message : e); $("loadbar").classList.add("hide");
  }
})();
updateInputUi();
