// Makes default_view.json: the first page of the default view, so the portal can show rows while the engine starts.
// Run it at every data release, then upload the file next to the other data files (data/<version>/default_view.json).
//
//   npm install playwright        (once)
//   node make_default_view.cjs <portal-address> <output-file>
//   for example: node make_default_view.cjs https://www.austraits.org/browser-portal/ default_view.json
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const [url, out] = [process.argv[2], process.argv[3] || "default_view.json"];
  if (!url) { console.error("Usage: node make_default_view.cjs <portal-address> [output-file]"); process.exit(1); }
  const b = await chromium.launch(), p = await b.newPage();
  p.setDefaultTimeout(180000);
  await p.route("**/default_view.json", (r) => r.abort()); // make sure the page works from the engine, not from an older stored file
  await p.goto(url + (url.includes("?") ? "&" : "?") + "notrack");
  await p.waitForFunction(() => { const A = window.__portal; return A && A.engineReady && A.applied && A.lastRows && !document.querySelector("#table-wrap").classList.contains("busy"); });
  const v = await p.evaluate(() => { const A = window.__portal; return { data_version: A.portal.data_version, total: A.total, rows: A.lastRows }; });
  fs.writeFileSync(out, JSON.stringify(v));
  console.log(`Wrote ${out}: ${v.rows.length} rows, total ${v.total}, data version ${v.data_version}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  await b.close();
})();
