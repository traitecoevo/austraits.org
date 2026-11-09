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

## Changing the filter or query logic

```sh
cd browser-portal-src
npm install
# put the data release in ./data/7.0.0 (download it from the data bucket)
npm test          # runs the 375 golden cases (222 raw, 153 species averages) against DuckDB
npm run build     # rewrites ../browser-portal/js/toSql.mjs
```

The golden cases are in `browser-portal-src/golden/golden_cases.json`. Each one is a filter plus the row
count and checksum that the original (Shiny) logic gave on the same data. They were made by
`browser-portal-src/golden/run_golden.py` (with `sql_builder.py`); edit the file paths at the top of those
two scripts before running them. Commit the rebuilt
`js/toSql.mjs` together with the `toSql.ts` change.

## Publishing a new data release

1. Build the data folder `data/<new version>/` and the Browse pages with the two R commands in `browser-portal-src/tools/README.md`. The build checks its own output and stops on any problem.
2. Upload the data folder to `data/<new version>/` in the R2 bucket, upload `site-pages/` to the bucket root (`pages/`, `sitemap.xml`, `robots.txt`), and change `dataBase` in `config.json`.
3. Make the stored first page of the default view (the portal shows it while the engine starts): `node browser-portal-src/tools/make_default_view.cjs https://www.austraits.org/browser-portal/ default_view.json` and upload `default_view.json` to the same data folder. (It needs `npm install playwright` once. If the file is missing or from another data version, the portal simply skips it and still works.)
4. Run the tests above against the new data, and purge the Cloudflare cache.

## Things to know

- `_quarto.yml` lists `browser-portal/` under `project: resources:`. Without that line Quarto does not copy the folder.
- The static taxon, trait and family pages (for search engines) are on `data.austraitsdata.org/pages/` and
  link to this portal. They are built with `browser-portal-src/tools/build_static_pages.R`.
