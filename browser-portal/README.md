# AusTraits browser portal

A data portal that runs only in the visitor's browser. There is no server. It is served at
`https://www.austraits.org/browser-portal/`. The old Shiny portal (`portal.qmd`, an iframe of
`app.austraits.org`) is not changed and still works.

## How it works

- The page loads DuckDB-WASM and reads the Parquet data files with HTTP range requests.
- The data and the engine files are in a Cloudflare R2 bucket on `data.austraitsdata.org`:
  `/data/<version>/` (Parquet, JSON, `sources.bib`), `/site/engine-1.32.0/` and `/site/ext/` (DuckDB engine).
- `config.json` holds the three addresses above and the usage-counting settings (Supabase publishable key).
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
npm test          # runs the 368 golden cases against DuckDB
npm run build     # rewrites ../browser-portal/js/toSql.mjs
```

The golden cases are in `browser-portal-src/golden/golden_cases.json`. Each one is a filter plus the row
count and checksum that the original (Shiny) logic gave on the same data. Commit the rebuilt
`js/toSql.mjs` together with the `toSql.ts` change.

## Publishing a new data release

Upload the new Parquet files, JSON files and `sources.bib` to `data/<new version>/` in the R2 bucket, change
`dataBase` in `config.json`, and run the tests above against the new data.

## Things to know

- `_quarto.yml` lists `browser-portal/` under `project: resources:`. Without that line Quarto does not copy the folder.
- The static taxon, trait and family pages (for search engines) are on `data.austraitsdata.org/pages/` and
  link to this portal. They are built with `build_static_pages.py`.
