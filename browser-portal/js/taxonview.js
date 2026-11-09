// Taxon View: port of generate_taxon_text() from the Shiny portal. Builds HTML (all text escaped) from the rows fetched in app.js.
import { inline } from "./cite.js";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const a = (t, u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
const r2 = (v) => { const n = Number(v); return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v ?? ""); };
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

export function emptyState() {
  return `<div class="tx-empty"><div class="tx-empty-t">ⓘ Select a Taxon to View Profile</div><p>To view a taxon profile, please:</p><ol><li>Set the taxonomy filter to 'Taxon name'</li><li>Select exactly one taxon from the dropdown</li><li>Click 'Apply Filters'</li></ol></div>`;
}

function portalLinks(info, floraLinks) {
  const dist = info.taxon_distribution ?? "", taxon = info.taxon_name;
  const L = [
    ["APC", info.taxon_id],
    ["Flora of Australia", "https://profiles.ala.org.au/opus/foa/profile/" + taxon.replace(/ /g, "%20")],
    ["ALA", "https://bie.ala.org.au/species/" + info.taxon_id],
    ["iNaturalist", "https://www.inaturalist.org/taxa/search?q=" + taxon.replace(/ var\. | subsp\. /g, " ").replace(/ /g, "-")],
  ];
  const fl = (src) => floraLinks.find((r) => r.source === src && r.url);
  if (/NSW/i.test(dist)) L.push(["NSW Flora", "https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?page=nswfl&lvl=sp&name=" + taxon.replace(/ /g, "~")]);
  if (/NT/i.test(dist)) L.push(["NT eFlora", fl("nt")?.url ?? "https://eflora.nt.gov.au/"]);
  if (/SA/i.test(dist)) L.push(["SA eFlora", "https://flora.sa.gov.au/"]);
  if (/Vic/i.test(dist)) L.push(["Vic Flora", fl("vic")?.url ?? "https://vicflora.rbg.vic.gov.au/flora/taxon/"]);
  if (/WA/i.test(dist)) L.push(["Florabase", "https://florabase.dbca.wa.gov.au/"]);
  L.push(["ATRP", fl("atrp")?.url ?? "https://apps.lucidcentral.org/rainforest/"]);
  return L;
}

function synonyms(rows, apcVersion) {
  const src = apcVersion ? "APC " + apcVersion : "APC";
  const sec = (kind, label) => {
    const x = rows.filter((r) => r.kind === kind);
    if (!x.length) return "";
    return `<details><summary><strong>${label}</strong>: ${x.length} (${esc(src)})</summary><ul>${x.map((r) => `<li>${esc(r.scientific_name)} (${esc(r.taxonomic_status)})</li>`).join("")}</ul></details>`;
  };
  const out = sec("synonym", "Synonyms") + sec("misapplied", "Misapplied names");
  return out || `<p><strong>Synonyms</strong>: none listed in the ${esc(src)}</p>`;
}

// info: row of taxa; datasets: [{dataset_id, n_traits, n_records, reference}]; means: species rows for the taxon; groups: trait_groups list
export function taxonHtml({ taxon, info, datasets, means, groups, syn, apcVersion, floraLinks, nTraits }) {
  const ds = [...datasets].sort((x, y) => cmp(x.dataset_id, y.dataset_id));
  const nRecords = ds.reduce((s, d) => s + Number(d.n_records), 0);
  const byTrait = new Map(means.map((m) => [m.trait_name, m]));
  const core = new Map();
  for (const g of groups) {
    if (!g.core) continue; const m = byTrait.get(g.trait); if (!m || m.type == null) continue;
    const u = m.unit ?? "";
    const line = m.type === "categorical"
      ? `<li>${a(g.trait, g.entity)} (categorical): ${esc(m.value_range)}  [sources: ${esc(m.dataset_id)}]</li>`
      : `<li>${a(g.trait, g.entity)} (numerical): ${esc(r2(m.value_mean))} ${esc(u)} (${esc(r2(m.value_min))}-${esc(r2(m.value_max))} ${esc(u)})  [sources: ${esc(m.dataset_id)}]</li>`;
    if (!core.has(g.group)) core.set(g.group, []); core.get(g.group).push(line);
  }
  const groupsHtml = [...core.keys()].sort(cmp).map((k) => `<details><summary>${esc(k)}</summary><ul>${core.get(k).join("")}</ul></details>`).join("");
  const links = portalLinks(info, floraLinks).map(([s, u]) => a(s, u)).join(", ");
  const bydesc = [...ds].sort((x, y) => Number(y.n_records) - Number(x.n_records));
  const table = `<table class="tx-table"><thead><tr><th>dataset_id</th><th>n_traits</th><th>n_records</th><th>reference</th></tr></thead><tbody>${bydesc.map((d) => `<tr><td>${esc(d.dataset_id)}</td><td>${esc(d.n_traits)}</td><td>${esc(d.n_records)}</td><td>${d.reference ? inline(d.reference) : ""}</td></tr>`).join("")}</tbody></table>`;
  return `<div class="prose tx">
<h2>${esc(taxon)}</h2>
<p><strong>FAMILY</strong> ${esc(info.family)}</p>
<p><strong>Taxonomy</strong>: ${esc(info.scientific_name)}</p>
${synonyms(syn, apcVersion)}
<p><strong>Distribution (APC)</strong>: ${esc(info.taxon_distribution ?? "")}</p>
<p><strong>Profiles</strong>: ${links}</p>
<h2>Traits</h2>
<p><strong>Top source datasets</strong>: ${ds.map((d) => `${esc(d.dataset_id)} (${esc(d.n_records)})`).join(", ")}.     See below for a full list of sources.<br>
<strong>Summary</strong>: AusTraits contains ${nTraits} traits from ${nRecords.toLocaleString("en-AU")} records in ${ds.length} datasets.<br></p>
<p><strong>Traits by category</strong> (click to expand):<br></p>
<ul><li>For categorical traits, the number of records for each value is shown. For numerical traits, the mean and range are shown.</li></ul>
${groupsHtml}
<h2>Sources</h2>
${table}</div>`;
}
