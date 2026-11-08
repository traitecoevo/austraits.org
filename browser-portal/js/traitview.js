// Trait View: profile text, distribution chart (canvas) and map (Leaflet, own canvas layer). Port of the Shiny trait view.
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") n.className = v; else if (k === "html") n.innerHTML = v; else n.setAttribute(k, v); }
  for (const c of kids) n.append(c);
  return n;
};
const fmt = (n) => Number(n).toLocaleString("en-AU");

export function banner(isSpecies) {
  const title = isSpecies ? "Species Averages Dataset" : "Raw Observation Data";
  const l1 = isSpecies ? "Showing aggregated species-level means. Location data not available." : "Showing individual observations with full location and measurement details.";
  const l2 = isSpecies ? "To view individual observations, select 'Raw data' in the filters panel." : "To view species-level aggregated means, select 'Species averages' in the filters panel.";
  return el("div", { class: "tv-banner" }, el("div", { class: "tv-banner-t" }, "ⓘ " + title), el("p", {}, l1), el("p", { class: "tv-banner-i" }, l2));
}

export function profile(trait, def, cov) {
  const box = el("div", { class: "prose" });
  box.append(el("h2", {}, trait));
  if (!def) { box.append(el("p", {}, "No definition is available for this trait.")); }
  else {
    const ul = el("ul");
    const li = (k, v) => { const x = el("li"); x.append(el("strong", {}, k + ": ")); if (typeof v === "string") x.append(v); else x.append(v); ul.append(x); };
    li("Label", def.label ?? "");
    const a = el("a", { href: def.entity_URI, target: "_blank", rel: "noopener noreferrer" }, def.entity_URI); li("Entity URI", a);
    li("Type", def.type ?? "");
    li("Definition", def.description ?? "");
    li("Additional comments", def.comments ?? "None");
    if (def.type === "numeric") {
      li("units", def.units ?? ""); li("allowable range", `${def.allowed_values_min} - ${def.allowed_values_max} ${def.units ?? ""}`);
    } else if (def.allowed_values_levels) {
      const li2 = el("li"); li2.append(el("strong", {}, "Allowed values: "));
      const tb = el("table", { class: "tv-levels" }, el("thead", {}, el("tr", {}, el("th", {}, "value"), el("th", {}, "description"))));
      const body = el("tbody");
      for (const [k, v] of Object.entries(def.allowed_values_levels)) body.append(el("tr", {}, el("td", {}, k), el("td", {}, v == null ? "" : String(v))));
      tb.append(body); li2.append(tb); ul.append(li2);
    }
    box.append(ul);
    const p = el("p"); p.append("See the AusTraits Plant Dictionary (");
    p.append(el("a", { href: def.entity_URI, target: "_blank", rel: "noopener noreferrer" }, def.entity_URI));
    p.append(") for additional information about this trait."); box.append(p);
  }
  box.append(el("h3", {}, "Coverage"));
  box.append(el("p", { html: `For this trait, AusTraits includes a total of <strong>${fmt(cov.n)}</strong> records. This includes:` }));
  box.append(el("ul", {}, el("li", { html: `data for <strong>${fmt(cov.taxa)}</strong> species.` }), el("li", { html: `data for <strong>${fmt(cov.families)}</strong> families.` }), el("li", { html: `data from <strong>${fmt(cov.datasets)}</strong> datasets (see the Citations tab for a list of sources)` })));
  return box;
}

const PAL = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#999999", "#7B3294", "#44AA99", "#882255", "#117733", "#332288", "#AA4499", "#DDCC77", "#88CCEE"];

function tip() { let t = $("#tv-tip"); if (!t) { t = el("div", { id: "tv-tip", class: "tv-tip" }); document.body.append(t); } return t; }
function showTip(x, y, text) { const t = tip(); t.textContent = text; t.style.display = "block"; t.style.left = Math.min(x + 12, innerWidth - 260) + "px"; t.style.top = y + 14 + "px"; }
const hideTip = () => { const t = $("#tv-tip"); if (t) t.style.display = "none"; };

// Categorical: share of each value inside the 50 families with the most taxa (same weighting as the Shiny code).
export function categoricalChart(rows) {
  const byGroup = new Map(); // family|taxon|dataset -> set of values
  for (const r of rows) { r.family ??= "(no family)"; if (r.value == null) continue; for (const v of String(r.value).split(" ")) { if (!v) continue; const k = r.family + "\u0001" + r.taxon_name + "\u0001" + r.dataset_id; let s = byGroup.get(k); if (!s) byGroup.set(k, (s = new Set())); s.add(v); } }
  const perTaxon = new Map(); // family|taxon -> Map(value -> count)
  for (const [k, vals] of byGroup) { const [fam, tax] = k.split("\u0001"); const kk = fam + "\u0001" + tax; let m = perTaxon.get(kk); if (!m) perTaxon.set(kk, (m = new Map())); for (const v of vals) m.set(v, (m.get(v) || 0) + 1 / vals.size); }
  const famTaxa = new Map(), famVals = new Map();
  for (const [kk, m] of perTaxon) {
    const fam = kk.split("\u0001")[0]; famTaxa.set(fam, (famTaxa.get(fam) || 0) + 1);
    let tot = 0; for (const c of m.values()) tot += c;
    let fv = famVals.get(fam); if (!fv) famVals.set(fam, (fv = new Map()));
    for (const [v, c] of m) fv.set(v, (fv.get(v) || 0) + c / tot);
  }
  const fams = [...famTaxa.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 50).map((x) => x[0]);
  const totals = new Map();
  for (const f of fams) { for (const [v, c] of famVals.get(f)) totals.set(v, (totals.get(v) || 0) + c); }
  const values = [...totals.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  return { fams, values, share: (f, v) => { const m = famVals.get(f); let s = 0; for (const c of m.values()) s += c; return (m.get(v) || 0) / s; }, taxa: (f) => famTaxa.get(f) };
}

export function drawCategorical(host, rows) {
  host.innerHTML = "";
  const C = categoricalChart(rows);
  if (!C.fams.length) { host.append(el("p", {}, "No data available for this trait")); return; }
  const rowH = 20, left = 150, top = 8, W = Math.max(host.clientWidth, 480), H = top + C.fams.length * rowH + 40;
  const cv = el("canvas"); const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; host.append(cv);
  const g = cv.getContext("2d"); g.scale(dpr, dpr); g.font = "12px system-ui, sans-serif"; g.textBaseline = "middle";
  const bw = W - left - 12, colour = (v) => PAL[C.values.indexOf(v) % PAL.length];
  const spans = [];
  C.fams.forEach((f, i) => {
    const y = top + i * rowH; g.fillStyle = "#222"; g.textAlign = "right"; g.fillText(f.length > 22 ? f.slice(0, 21) + "…" : f, left - 8, y + rowH / 2);
    let x = left;
    for (const v of C.values) { const s = C.share(f, v); if (!s) continue; const w = s * bw; g.fillStyle = colour(v); g.fillRect(x, y + 2, w, rowH - 4); spans.push({ x0: x, x1: x + w, y0: y, y1: y + rowH, f, v, s }); x += w; }
  });
  g.fillStyle = "#555"; g.textAlign = "center"; for (const t of [0, .25, .5, .75, 1]) g.fillText((t * 100) + "%", left + t * bw, top + C.fams.length * rowH + 14);
  g.fillText("Proportion of taxa with each value, by family (50 families with the most taxa)", left + bw / 2, top + C.fams.length * rowH + 32);
  cv.addEventListener("mousemove", (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; const h = spans.find((s) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y < s.y1); if (h) showTip(e.clientX, e.clientY, `${h.f} | ${h.v}: ${(h.s * 100).toFixed(1)}%`); else hideTip(); });
  cv.addEventListener("mouseleave", hideTip);
  const lg = el("div", { class: "tv-legend" }); for (const v of C.values.slice(0, 24)) lg.append(el("span", {}, el("i", { style: "background:" + colour(v) }), v)); if (C.values.length > 24) lg.append(el("span", {}, "+" + (C.values.length - 24) + " more"));
  host.append(lg);
}

// Numeric: one row per family (ordered by mean value), a dot per record, log scale when every value is positive.
export function drawNumeric(host, rows, unit) {
  host.innerHTML = "";
  const pts = []; for (const r of rows) { r.family ??= "(no family)"; const v = Number(r.value); if (!Number.isFinite(v) || r.value === null || r.value === "") continue; if (r.value_type === "bin" || r.value_type === "range") continue; pts.push({ v, fam: r.family, text: r.dataset_id + " | " + r.taxon_name, t: /mean/.test(r.value_type || "") ? 0 : /min/.test(r.value_type || "") ? 1 : /max/.test(r.value_type || "") ? 2 : 3 }); }
  if (!pts.length) { host.append(el("p", {}, "No data available")); return; }
  let mn = Infinity, mx = -Infinity; for (const p of pts) { if (p.v < mn) mn = p.v; if (p.v > mx) mx = p.v; }
  const log = mn > 0, tx = (v) => (log ? Math.log10(v) : v);
  const sum = new Map(), cnt = new Map(); for (const p of pts) { p.x = tx(p.v); sum.set(p.fam, (sum.get(p.fam) || 0) + p.x); cnt.set(p.fam, (cnt.get(p.fam) || 0) + 1); }
  const fams = [...sum.keys()].sort((a, b) => sum.get(a) / cnt.get(a) - sum.get(b) / cnt.get(b)); const idx = new Map(fams.map((f, i) => [f, i]));
  const rowH = fams.length > 20 ? 18 : 24, left = 150, top = 8, W = Math.max(host.clientWidth, 480), H = top + fams.length * rowH + 52;
  const a = tx(mn) - 0.05 * (tx(mx) - tx(mn) || 1), b = tx(mx) + 0.05 * (tx(mx) - tx(mn) || 1), pw = W - left - 14, X = (x) => left + ((x - a) / (b - a)) * pw;
  const cv = el("canvas"); const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; host.append(cv);
  const g = cv.getContext("2d"); g.scale(dpr, dpr); g.font = "12px system-ui, sans-serif"; g.textBaseline = "middle";
  fams.forEach((f, i) => { const y = top + i * rowH; if (i % 2 === 0) { g.fillStyle = "#f4f6f5"; g.fillRect(left, y, pw, rowH); } g.fillStyle = "#222"; g.textAlign = "right"; g.fillText(f.length > 22 ? f.slice(0, 21) + "…" : f, left - 8, y + rowH / 2); });
  const grid = new Map(), cell = 8; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const p of pts) {
    const i = idx.get(p.fam); p.px = X(p.x); p.py = top + i * rowH + 3 + rnd() * (rowH - 6);
    g.fillStyle = i % 2 === 0 ? "#0072B2" : "#E69F00"; g.globalAlpha = 0.55; g.beginPath();
    if (p.t === 0) g.arc(p.px, p.py, 2.2, 0, 7); else if (p.t === 1) { g.moveTo(p.px + 2.5, p.py - 3); g.lineTo(p.px - 2.5, p.py); g.lineTo(p.px + 2.5, p.py + 3); } else if (p.t === 2) { g.moveTo(p.px - 2.5, p.py - 3); g.lineTo(p.px + 2.5, p.py); g.lineTo(p.px - 2.5, p.py + 3); } else { g.moveTo(p.px, p.py - 3); g.lineTo(p.px + 3, p.py); g.lineTo(p.px, p.py + 3); g.lineTo(p.px - 3, p.py); }
    g.closePath(); g.fill();
    const k = ((p.px / cell) | 0) + "," + ((p.py / cell) | 0); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(p);
  }
  g.globalAlpha = 1; g.fillStyle = "#555"; g.textAlign = "center";
  const ticks = 6, ay = top + fams.length * rowH;
  for (let i = 0; i <= ticks; i++) { const x = a + ((b - a) * i) / ticks, v = log ? 10 ** x : x; g.fillText(Number(v.toPrecision(3)).toLocaleString("en-AU"), X(x), ay + 12); }
  g.fillText((unit ? `Value (${unit})` : "Value") + (log ? ", log scale" : ""), left + pw / 2, ay + 34);
  cv.addEventListener("mousemove", (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 49; const cx = (x / cell) | 0, cy = (y / cell) | 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grid.get(cx + i + "," + (cy + j)) || []) { const d = (p.px - x) ** 2 + (p.py - y) ** 2; if (d < bd) { bd = d; best = p; } } if (best) showTip(e.clientX, e.clientY, `${best.fam} | ${best.text} | ${Number(best.v.toPrecision(6))}${unit ? " " + unit : ""}`); else hideTip(); });
  cv.addEventListener("mouseleave", hideTip);
  const lg = el("div", { class: "tv-legend" }, el("span", {}, "● mean"), el("span", {}, "◀ minimum"), el("span", {}, "▶ maximum"), el("span", {}, "◆ unknown")); host.append(lg);
}

let map = null, layer = null;
export function drawMap(host, pts) {
  host.innerHTML = "";
  if (map) { map.remove(); map = null; }
  const L = window.L, div = el("div", { class: "tv-map" }); host.append(div);
  map = L.map(div, { preferCanvas: false, worldCopyJump: true }).setView([-25, 134], 4);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
  if (!pts.length) return;
  const Dots = L.Layer.extend({
    onAdd(m) { this._m = m; this._c = L.DomUtil.create("canvas", "leaflet-zoom-animated"); m.getPanes().overlayPane.appendChild(this._c); m.on("moveend zoomend resize", this._draw, this); m.on("mousemove", this._hover, this); m.on("mouseout", hideTip); this._draw(); },
    onRemove(m) { L.DomUtil.remove(this._c); m.off("moveend zoomend resize", this._draw, this); m.off("mousemove", this._hover, this); },
    _draw() { const m = this._m, s = m.getSize(), c = this._c, tl = m.containerPointToLayerPoint([0, 0]); L.DomUtil.setPosition(c, tl); c.width = s.x; c.height = s.y; const g = c.getContext("2d"); g.fillStyle = "rgba(0,114,178,0.55)"; this._xy = new Float32Array(pts.length * 2);
      for (let i = 0; i < pts.length; i++) { const p = m.latLngToContainerPoint([pts[i].lat, pts[i].lon]); this._xy[2 * i] = p.x; this._xy[2 * i + 1] = p.y; if (p.x < -5 || p.y < -5 || p.x > s.x + 5 || p.y > s.y + 5) continue; g.beginPath(); g.arc(p.x, p.y, 3.2, 0, 7); g.fill(); } },
    _hover(e) { const x = e.containerPoint.x, y = e.containerPoint.y, xy = this._xy; let best = -1, bd = 64; for (let i = 0; i < pts.length; i++) { const d = (xy[2 * i] - x) ** 2 + (xy[2 * i + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } } if (best >= 0) showTip(e.originalEvent.clientX, e.originalEvent.clientY, pts[best].label); else hideTip(); }
  });
  layer = new Dots(); layer.addTo(map);
  if (pts.length > 1) { let a = 90, b = -90, c = 180, d = -180; for (const p of pts) { if (p.lat < a) a = p.lat; if (p.lat > b) b = p.lat; if (p.lon < c) c = p.lon; if (p.lon > d) d = p.lon; } map.fitBounds([[a, c], [b, d]], { padding: [20, 20], maxZoom: 8 }); }
  setTimeout(() => map && map.invalidateSize(), 50);
}
