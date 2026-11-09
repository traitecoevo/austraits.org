# Building and testing a data release for the browser portal

Five R commands turn one AusTraits release into everything the browser portal reads, and test it: the data folder (Parquet and JSON files, including the stored first page), a check that the browser's filters return the same rows as the Shiny portal's, the static Browse pages, and a run of the portal itself in a real browser. Run them from the repository root. On 7.0.0 the whole sequence takes about five minutes.

You need R with the packages `DBI`, `duckdb`, `jsonlite`, `digest`, `V8`, `pkgload`, `dbplyr`, `chromote`, `httpuv` and `callr`, Google Chrome, and a checkout of [austraits.portal](https://github.com/traitecoevo/austraits.portal) with the packages it imports. No Python or Node is needed.

## 1. Prepare the inputs (in austraits.portal)

The input is the folder that the austraits.portal package writes for its Shiny app. In the austraits.portal checkout, follow its README section "Data Preparation" (load the release with `austraits::load_austraits()`, apply any fix listed there for that version, then run `prepare_data_for_portal()`). The folder it writes, for example `inst/extdata/austraits/austraits-7.1.0-full/`, is `SRC` below. The release's Zenodo record `austraits.json` sits next to it.

The build checks that every file and column the portal needs is present, and stops with a list of what is missing. That usually means the inputs were made with an older austraits.portal.

> **Known problem (November 2026):** `prepare_data_for_portal()` reads `inst/extdata/austraits/trait_groups_for_portal.csv`, which was deleted from austraits.portal in PR #123, so it fails on a fresh checkout. Until that is fixed, restore the file with `git show dc8a965^:inst/extdata/austraits/trait_groups_for_portal.csv > inst/extdata/austraits/trait_groups_for_portal.csv`.

## 2. Build the data folder

```sh
Rscript browser-portal-src/tools/build_release.R --src SRC --out data/7.1.0 --version 7.1.0
```

About 30 seconds. It writes the Parquet tables and JSON files, copies `sources.bib`, writes `default_view.json` (the first page of the default view, made with the browser's own query code), writes `manifest.json` (size, row count and sha256 of every file, plus the DuckDB version used), and then runs 23 checks against the input. If any check fails it stops with the list; do not upload a folder from a run that stopped.

Options: `--zenodo` points at the Zenodo record if it is not next to `--src` (its version must match `--version`), and `--apc-version` overrides the APC date, which is otherwise read from `synonyms.rds`.

## 3. Check the filters against the Shiny portal

```sh
Rscript browser-portal-src/tools/make_golden_cases.R --src SRC --portal-repo ../austraits.portal
Rscript browser-portal-src/tools/run_golden.R --data data/7.1.0
```

The first command (about a minute) recomputes the expected results of the 375 golden cases in `browser-portal-src/golden/golden_cases.json` with the Shiny portal's own filter code (`parse_filters()` and `apply_filters()` from austraits.portal) on the release inputs. The second (about a minute) runs every case through the browser's filter code, `browser-portal/js/toSql.mjs` run in R's V8 engine, on the built data folder, and stops if any case returns different rows. Commit the updated `golden_cases.json` with the release.

## 4. Build the Browse pages

```sh
Rscript browser-portal-src/tools/build_static_pages.R --data data/7.1.0 --out site-pages \
  --base https://data.austraitsdata.org --portal https://www.austraits.org/browser-portal/
```

About two minutes. It writes `site-pages/pages/` (one page per taxon, trait and family, an index with a search box and `search-index.json`) plus `site-pages/sitemap.xml` and `site-pages/robots.txt`. Add `--limit 50` for a quick test run.

## 5. Test the portal in a browser

```sh
Rscript browser-portal-src/tools/test_portal.R --data data/7.1.0
```

About 30 seconds. It serves `browser-portal/` and the new data folder from a local web server, opens the portal in headless Chrome, and checks, the way a visitor would use it: the stored first page shows and matches what the engine returns; about 80 searches covering every kind of filter give the golden cases' row counts; the Taxon View, Trait View and Citations tabs fill in; a download completes; and no JavaScript error occurs. The database engine is still fetched from `engineBase` in `config.json`, so it needs internet access. Usage counting is switched off for the test.

## 6. Publish

Upload the data folder to `data/<version>/` in the R2 bucket and `site-pages/` to the bucket root, change `dataBase` in `browser-portal/config.json`, commit that with the new `golden_cases.json`, and purge the Cloudflare cache.

## What is where

| Path | What it holds |
|---|---|
| `browser-portal-src/R/` | The functions: `build_browser_data()`, `verify_browser_data()`, `build_default_view()`, `make_golden_cases()`, `run_golden_cases()`, `build_static_pages()`, `test_portal_in_browser()` and helpers |
| `browser-portal-src/tools/*.R` | The five command-line entry points above |
| `browser-portal-src/templates/filter_spec.json` | How each filter becomes SQL. Edit it by hand when the filters change; the build copies it unchanged |
| `browser-portal-src/templates/portal.json` | Names, labels, links, theme, default filters and download limits. The build fills in `data_version` and the Zenodo DOI |
| `browser-portal-src/golden/golden_cases.json` | The golden cases: filter states plus the rows the Shiny portal returns for them on the current data release |

## Decisions and next steps

- **R only.** This tooling replaced Python scripts and a Node script (November 2026), so a release needs one language besides the portal's own JavaScript. The SQL is unchanged: R's `duckdb` runs the same statements. On the 7.0.0 inputs the R build gives the same content as the Python scripts in every table, the Browse pages are byte-identical, and `default_view.json` is identical in content to the one the Node script made. Node is needed only to change the filter logic itself (`toSql.ts`).
- **The Shiny portal is the reference.** The golden cases' expected results come from austraits.portal's own filter functions, not from a re-implementation; the earlier Python reference agreed with them on all 375 row counts and on every checksum where the inputs were the same.
- **Moving into austraits.portal.** The functions in `browser-portal-src/R/` are written as package code (no `library()` calls, every external function namespaced, roxygen headers) so they can move into the austraits.portal package unchanged. Keep them that way when editing.
- **Fixes over the Python version:** the genus filter list no longer contains `(Dockrillia` (the bracket is stripped as in the data, issue austraits.portal#113); the build stops on missing inputs or columns; the checks stop the build instead of only printing; `portal.json` and `manifest.json` no longer carry placeholder fields.
- **Still to do:** one GitHub Action that runs steps 2–6 for a given version; and starting the build from the published AusTraits release instead of a prepared folder.
