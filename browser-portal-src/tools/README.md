# Building a data release for the browser portal

Two R commands turn one AusTraits release into everything the browser portal reads: the data folder (Parquet files and JSON files) and the static Browse pages. Run them from the repository root.

You need R with the packages `DBI`, `duckdb`, `jsonlite` and `digest`. No Python or Node is needed for these steps.

## 1. Prepare the inputs (in austraits.portal)

The input is the folder that the austraits.portal package writes for its Shiny app. In a checkout of [austraits.portal](https://github.com/traitecoevo/austraits.portal), follow its README section "Data Preparation" (load the release with `austraits::load_austraits()`, apply any fix listed there for that version, then run `prepare_data_for_portal()`). The folder it writes, for example `inst/extdata/austraits/austraits-7.1.0-full/`, is the `--src` below. The release's Zenodo record `austraits.json` sits next to it.

The build checks that every file and column the portal needs is present, and stops with a list of what is missing. That usually means the inputs were made with an older austraits.portal.

> **Known problem (November 2026):** `prepare_data_for_portal()` reads `inst/extdata/austraits/trait_groups_for_portal.csv`, which was deleted from austraits.portal in PR #123, so it fails on a fresh checkout. Until that is fixed, restore the file with `git show dc8a965^:inst/extdata/austraits/trait_groups_for_portal.csv > inst/extdata/austraits/trait_groups_for_portal.csv`.

## 2. Build the data folder

```sh
Rscript browser-portal-src/tools/build_release.R \
  --src ../austraits.portal/inst/extdata/austraits/austraits-7.1.0-full \
  --out data/7.1.0 --version 7.1.0
```

This takes under a minute. It writes the Parquet tables and JSON files, copies `sources.bib`, writes `manifest.json` (size, row count and sha256 of every file, plus the DuckDB version used), and then runs 23 checks against the input. If any check fails it stops with the list, so do not upload a folder from a run that stopped.

Options: `--zenodo` points at the Zenodo record if it is not next to `--src` (its version must match `--version`), and `--apc-version` overrides the APC date, which is otherwise read from `synonyms.rds`.

## 3. Build the Browse pages

```sh
Rscript browser-portal-src/tools/build_static_pages.R --data data/7.1.0 --out site-pages \
  --base https://data.austraitsdata.org --portal https://www.austraits.org/browser-portal/
```

About two minutes. It writes `site-pages/pages/` (one page per taxon, trait and family, an index with a search box and `search-index.json`) plus `site-pages/sitemap.xml` and `site-pages/robots.txt`. Add `--limit 50` for a quick test run.

## 4. Publish

Follow "Publishing a new data release" in `browser-portal/README.md`: upload the data folder and the pages, make `default_view.json`, change `dataBase` in `browser-portal/config.json`, and purge the Cloudflare cache.

## What is where

| Path | What it holds |
|---|---|
| `browser-portal-src/R/` | The functions: `build_browser_data()`, `verify_browser_data()`, `build_static_pages()` and helpers |
| `browser-portal-src/tools/*.R` | The two command-line entry points above |
| `browser-portal-src/templates/filter_spec.json` | How each filter becomes SQL. Edit it by hand when the filters change; the build copies it unchanged |
| `browser-portal-src/templates/portal.json` | Names, labels, links, theme, default filters and download limits. The build fills in `data_version` and the Zenodo DOI |

## Decisions and next steps

- **R only.** This tooling replaced Python scripts (November 2026) so that the release needs one language besides the portal's own JavaScript. The SQL is unchanged: R's `duckdb` runs the same statements. On the 7.0.0 inputs the R build gives the same content as the Python scripts in every table, and the Browse pages are byte-identical.
- **Moving into austraits.portal.** The functions in `browser-portal-src/R/` are written as package code (no `library()` calls, every external function namespaced, roxygen headers) so they can move into the austraits.portal package unchanged. Keep them that way when editing.
- **Fixes over the Python version:** the genus filter list no longer contains `(Dockrillia` (the bracket is stripped as in the data, issue austraits.portal#113); the build stops on missing inputs or columns; the checks stop the build instead of only printing; `portal.json` and `manifest.json` no longer carry placeholder fields.
- **Still to do:** one GitHub Action that runs steps 2–4 for a given version; starting the build from the published AusTraits release instead of a prepared folder; regenerating the golden test cases in R from austraits.portal's own filter functions (`browser-portal-src/golden/` is still Python); and making `default_view.json` without Node.
