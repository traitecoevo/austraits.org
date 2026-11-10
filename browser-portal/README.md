# AusTraits browser portal

A data portal that runs only in the visitor's browser. There is no server. It is served at
`https://www.austraits.org/browser-portal/`. The old Shiny portal (`portal.qmd`, an iframe of
`app.austraits.org`) is not changed and still works.

## How it works

- The page loads DuckDB-WASM and reads the Parquet data files with HTTP range requests.
- The data and the engine files are in a Cloudflare R2 bucket on `data.austraitsdata.org`:
  `/data/<version>/` (Parquet, JSON, `sources.bib`), `/site/engine-1.32.0/` and `/site/ext/` (DuckDB engine).
- `config.json` holds the three addresses above, `extensionVersion` (the DuckDB version folder inside `ext/`, for example `v1.4.3`; change it together with the engine) and the usage-counting settings (Supabase publishable key).
- The browser only builds SQL text from the filters. Usage counts use the same Supabase table as the Shiny
  portal; each event carries `details.portal = "browser"`, so the two portals can be told apart.

## Where the code is

- `index.html`, `css/`, `js/`, `vendor/`, `assets/` in this folder are plain files. Edit them here.
- `js/toSql.mjs` is **compiled output**. Do not edit it by hand. Its source is
  `../browser-portal-src/src/toSql.ts` in this repository.

## Publishing a new data release

Everything is in R; no Python or Node is needed. Follow `browser-portal-src/tools/README.md`: five commands build the data folder (with `default_view.json`, the first page the portal shows while its engine starts), check the browser's filters against the Shiny portal's on the new data, build the Browse pages, and test the portal in a real browser. Then upload the data folder to `data/<new version>/` in the R2 bucket and `site-pages/` to the bucket root, change `dataBase` in `config.json`, commit the regenerated `golden_cases.json` with it, and purge the Cloudflare cache.

## Changing the filter or query logic

The filter logic is written in TypeScript (`browser-portal-src/src/toSql.ts`) and compiled to `js/toSql.mjs`, so changing it needs Node:

```sh
cd browser-portal-src
npm install
npm test          # the golden cases in DuckDB-WASM; DATA_DIR=<data folder> (default ./data/7.0.0)
npm run build     # rewrites ../browser-portal/js/toSql.mjs
```

Commit the rebuilt `js/toSql.mjs` together with the `toSql.ts` change, then run `tools/run_golden.R` and `tools/test_portal.R` as well. The golden cases in `browser-portal-src/golden/golden_cases.json` are filter states plus the row count and checksum that the Shiny portal's own filter code gives on the current data release; `tools/make_golden_cases.R` recomputes them.

## Things to know

- `_quarto.yml` lists `browser-portal/` under `project: resources:`. Without that line Quarto does not copy the folder.
- The static taxon, trait and family pages (for search engines) are on `data.austraitsdata.org/pages/` and
  link to this portal. They are built with `browser-portal-src/tools/build_static_pages.R`.
