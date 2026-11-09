// Zip download: data CSV, sources.csv, sources.bib and usage.html, all built in the browser.
import { zipSync, strToU8 } from "../vendor/fflate.min.mjs";
import { markdownToHtml, citationText } from "./cite.js";

const q1 = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Keep only the BibTeX entries whose key is wanted (entries start with "@Type{key,").
export function subsetBib(text, keys) {
  const want = new Set(keys), out = [];
  for (const block of text.split(/\n(?=@\w+\s*\{)/)) { const m = block.match(/^@\w+\s*\{\s*([^,\s]+)\s*,/); if (m && want.has(m[1])) out.push(block.trim()); }
  return out.join("\n\n") + (out.length ? "\n" : "");
}

export async function buildZip({ db, run, dataSql, keysSql, base, meta, onStep }) {
  const step = (s) => onStep && onStep(s);
  step("Collecting the rows…");
  await run(`COPY (${dataSql}) TO 'austraits-data.csv' (HEADER, DELIMITER ',')`);
  const csv = await db.copyFileToBuffer("austraits-data.csv");
  await db.dropFile("austraits-data.csv");
  step("Collecting the sources…");
  const rows = await run(keysSql);
  const keys = [...new Set(rows.flatMap((r) => (r.k == null ? [] : String(r.k).split("; "))))].sort();
  const files = { "austraits-data.csv": csv };
  if (!keys.length) { files["sources.bib"] = strToU8(""); files["sources.csv"] = strToU8(""); files["usage.html"] = strToU8("<p>No data selected</p>"); }
  else {
    const inList = keys.map(q1).join(",");
    await run(`COPY (SELECT * FROM read_parquet(${q1(base.replace(/\/$/, "") + "/sources.parquet")}) WHERE source_primary_key IN (${inList}) ORDER BY source_primary_key) TO 'sources.csv' (HEADER, DELIMITER ',')`);
    files["sources.csv"] = await db.copyFileToBuffer("sources.csv"); await db.dropFile("sources.csv");
    let bibRes = null;
    try { bibRes = await fetch(base.replace(/\/$/, "") + "/sources.bib"); } catch {}
    if (!bibRes || !bibRes.ok) throw new Error("The reference file sources.bib could not be loaded (" + (bibRes ? "server answered " + bibRes.status : "network error") + "), so the zip was not made. Please try again later.");
    files["sources.bib"] = strToU8(subsetBib(await bibRes.text(), keys));
    const refs = (await run(`SELECT source_primary_citation AS c FROM sources WHERE source_primary_key IN (${inList}) ORDER BY source_primary_key`)).map((r) => r.c).filter(Boolean);
    files["usage.html"] = strToU8(`<!doctype html><html><head><meta charset="utf-8"><title>AusTraits usage and citations</title></head><body>${markdownToHtml(citationText(meta, keys, refs))}</body></html>`);
  }
  step("Zipping…");
  const zip = zipSync(files, { level: 1 });
  return { zip, nKeys: keys.length, csvBytes: csv.length };
}

export function saveBlob(u8, name) {
  const url = URL.createObjectURL(new Blob([u8], { type: "application/zip" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
