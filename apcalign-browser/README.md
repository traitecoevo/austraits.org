# APCalign in the browser

A page that aligns plant names to the Australian Plant Census (APC) and runs only in the visitor's
browser. There is no server. It looks and works like the Shiny APCalign-app (same sidebar options, Output, Get Started and FAQs tabs, sortable table, CSV download). It will be served at `https://www.austraits.org/apcalign-browser/`.
The Shiny app (`apcalign.qmd`, an iframe of `app.austraits.org/APCalign-app/`) is not changed.

## How it works

- The page loads [webR](https://docs.r-wasm.org/webr/latest/) (R compiled to WebAssembly) from
  `webr.r-wasm.org`, installs nine R packages (rlang, cli, tibble, dplyr, purrr, stringi, stringr,
  stringdist, crayon), and then runs the APCalign matching code from `R/` unchanged, except for the speed
  changes below. `arrow`, `curl` and `httr` are not needed: they are only used to download the data.
- The census data is one file, `resources.rds` (about 15 MB), in the Cloudflare R2 bucket on
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
- `R/manifest.txt` lists the APCalign files the page loads, in order.
- Three files differ from APCalign. Search for `SPEED` to find the changes. They only make the code faster and
  were tested to give identical answers (3,016 names, all three `taxonomic_splits` options):
  - `R/fuzzy_match.R`: the first-letter lists are kept between names, and reference names whose length is too
    different to match are skipped.
  - `R/update_taxonomy.R`: tables that depend only on the census data are built once and kept.
  - `R/update_taxonomy.R` also checks `resources$app_cache` first (tables stored in the data file by `tools/build_resources.R`).
  - `R/app.R`: new file (reads the names, runs one chunk, writes the CSV). It passes the same options as the Shiny app
    (`taxonomic_splits`, `full`, `identifier`); all 12 combinations were checked against the original code.

## Publishing a new APC release

1. Run `tools/build_resources.R` from the repo root (set `release` first). It writes `<release>/resources.rds`.
   The script also drops columns that no R file names and stores the tables that would otherwise be built on the first call (`app_cache`). This makes the file smaller and the start faster.
2. Upload it to the R2 bucket at `apcalign/<release>/resources.rds (if you replace a file at the same path, purge the Cloudflare cache for that URL, or the old file can be served for up to a day)`.
3. Change `dataUrl` and `release` in `config.json`, commit, and merge.
4. If APCalign itself changes, copy the new R files into `R/` and apply the three `SPEED` changes again.
   Compare 10 names with the same names in normal R before you publish.

## Things to know

- `_quarto.yml` lists `apcalign-browser/` under `project: resources:`. Without that line Quarto does not copy the folder.
- The page loads webR from `https://webr.r-wasm.org/latest/`. It was tested with R 4.6.0 and dplyr 1.2.1,
  purrr 1.2.2, stringr 1.6.0, stringi 1.8.9, stringdist 0.9.17, tibble 3.3.1, rlang 1.3.0 and cli 3.6.6.
  If a later webR version breaks the page, pin the address in `index.html` to a fixed webR version.
- The R2 bucket must allow requests from `https://www.austraits.org` (the portal already needs the same setting).
- Test locally with `python -m http.server 8000` in this folder, then open
  `http://localhost:8000/?data=<address of resources.rds>`.
