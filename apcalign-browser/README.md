# APCalign in the browser

A page that aligns plant names to the Australian Plant Census (APC) and runs only in the visitor's
browser. There is no server. It looks and works like the Shiny APCalign-app (same sidebar options, Output, Get Started and FAQs tabs, sortable table, CSV download). It will be served at `https://www.austraits.org/apcalign-browser/`.
The Shiny app (`apcalign.qmd`, an iframe of `app.austraits.org/APCalign-app/`) is not changed.

## How it works

- The page loads [webR](https://docs.r-wasm.org/webr/latest/) (R compiled to WebAssembly) from
  `webr.r-wasm.org`, installs five R packages (rlang, cli, tibble, dplyr, stringdist; about 7 MB with their dependencies), and then runs the APCalign matching code from `R/` unchanged, except for the speed changes below. `nanoparquet`, `curl`, `httr`, `jsonlite` and `readr` are not needed: they are only used to download the data or write files. Since APCalign dropped `stringr`, `stringi` and `purrr` (APCalign #302) and `crayon` (#300), the page no longer installs them, which saves about 15 MB of download (stringi alone was 14 MB).
- The census data is one file, `resources.rds` (about 11 MB), in the Cloudflare R2 bucket on
  `data.austraitsdata.org` under `apcalign/<release>/`. `config.json` holds its address and the release date.
- Like the Shiny app, the output has one row for every input row, in the same order. Names are matched in chunks
  of 1,500 so the page can show progress. Small chunks are slower because every call has a fixed cost.
- Start-up: the census data and the R files download while R starts, and all R packages install in one call.
  Submit can be pressed while R is still starting; the names are matched as soon as R is ready.
- Typical speed in a browser: a few seconds for a short list, and well under a minute for several thousand names.
  Add `?speedtest` to the page address to show a speed-test panel that measures it on your computer.

## Where the code is

- `index.html` (page), `css/apcalign.css` (look, follows the Shiny app's `apcalign-app.css`) and `js/app.js` (page logic) are plain files. `assets/` has the logo. `R/` holds the R files copied from the APCalign package
  (MIT licence, Daniel Falster) plus `R/app.R`, a small helper written for this page.
- `R/manifest.txt` lists the APCalign files the page loads, in order. `R/sysdata.rda` is copied from APCalign too: it holds the character tables (lower case, ASCII transliteration) that `R/strings.R` uses, and the page loads it before the R files.
- Three files differ from APCalign. Search for `SPEED` to find the changes. They only make the code faster and
  were tested to give identical answers (most recently on 1,830 names with every combination of `taxonomic_splits`, `full` and identifier, and in a fuzz test of `fuzzy_match()`; see austraits.org #52):
  - `R/fuzzy_match.R`: the unique reference names for each first letter are kept between names (on top of APCalign's own `first_letters()` cache), and reference names whose length is too different to match are skipped.
  - `R/update_taxonomy.R`: tables that depend only on the census data are built once and kept.
  - `R/update_taxonomy.R` also checks `resources$app_cache` first (tables stored in the data file by `tools/build_resources.R`).
  - `R/app.R`: new file (reads the names, runs one chunk, writes the CSV). It passes the same options as the Shiny app
    (`taxonomic_splits`, `full`, `identifier`); all 12 combinations were checked against the original code.

## Publishing a new APC release

1. Run `tools/build_resources.R` from the repo root (set `release` first). It writes `<release>/resources.rds`.
   The script also drops columns that no R file names and stores the tables that would otherwise be built on the first call (`app_cache`). This makes the file smaller and the start faster.
2. Upload it to the R2 bucket at `apcalign/<release>/resources.rds (if you replace a file at the same path, purge the Cloudflare cache for that URL, or the old file can be served for up to a day)`.
3. Change `dataUrl` and `release` in `config.json`, commit, and merge.
4. If APCalign itself changes, copy the new R files (and `R/sysdata.rda`) into `R/` and apply the `SPEED` changes again. A three-way merge keeps them: `git merge-file R/<file> <APCalign file at the commit last copied> <APCalign file now>`. The files were last copied from APCalign `55d95ac` (2026-11-15). Rebuild `resources.rds` with that APCalign version installed, since the data file must match the code (APCalign #311 added `hyphenated_words` to it).
   Compare 10 names with the same names in normal R before you publish.

## Things to know

- `js/app.js` loads the R files with `%>%` set to magrittr's eager pipe `%!>%`. The normal `%>%` is lazy, so a long chain (`standardise_names()` has 46 steps) runs as deeply nested calls. Safari has a much smaller stack than Chrome, and the lazy version failed there with "Maximum call stack size exceeded". The eager pipe needs about a fifth of the depth and gives identical output (checked for all three `taxonomic_splits` options, with and without full output). Do not raise `options(expressions)` to work around a depth error: Safari then crashes instead of R reporting the error.

- `_quarto.yml` lists `apcalign-browser/` under `project: resources:`. Without that line Quarto does not copy the folder.
- The page loads a fixed webR release, set by `WEBR_VERSION` at the top of `js/app.js` (now `v0.6.1`, which runs R 4.6.0). Do not use `https://webr.r-wasm.org/latest/`: that is webR's development build (it loads its files from `/main/`), so it can change at any time, and browsers re-check it on every visit (`cache-control: no-cache`), where a release is cached for 7 days. It was tested with dplyr 1.2.1, stringdist 0.9.17, tibble 3.3.1, rlang 1.3.0 and cli 3.6.6.
- The R packages still come from webR's package repository (`repo.r-wasm.org`), which is not versioned, so a package update can still change the page. To upgrade webR, change `WEBR_VERSION`, then check the example names and the `?speedtest` panel before merging.
- The R2 bucket must allow requests from `https://www.austraits.org` (the portal already needs the same setting).
- Test locally with `python -m http.server 8000` in this folder, then open
  `http://localhost:8000/?data=<address of resources.rds>`.
