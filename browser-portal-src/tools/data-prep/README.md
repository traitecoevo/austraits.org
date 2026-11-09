# Data preparation scripts

These scripts turn the AusTraits portal files into the data folder that the browser portal reads (for example `data/7.1.0/`). Run them from the folder `browser-portal-src/`. Each script prints a usage line if it gets the wrong number of arguments.

You need Python 3 with the `duckdb` package, and R with the packages `dplyr`, `jsonlite` and `readr`.

Names used below:

- `SRC` is the folder with the AusTraits portal files: `austraits-data.parquet`, `austraits-species-averages.parquet`, `trait_groups.rds`, `dropdown_cache.rds`, `sources.rds`, `synonyms.rds` and `definitions.rds`.
- `WORK` is an empty folder for the middle files.
- `DATA` is the output folder, for example `data/7.1.0`.
- `ZENODO` is the file `inst/extdata/austraits/austraits.json` from the `austraits.portal` repository. It holds the version, DOI and date of the release.

## Order of the steps

```
Rscript tools/data-prep/export_from_rds.R SRC WORK
python3 tools/data-prep/build_layout.py SRC DATA
Rscript tools/data-prep/build_trait_definitions.R SRC DATA
python3 tools/data-prep/build_extras.py DATA WORK 2026-07-30
python3 tools/data-prep/build_contracts.py SRC DATA WORK 7.1.0 ZENODO
python3 tools/data-prep/verify_layout.py SRC DATA
python3 tools/split_dropdowns.py DATA
```

| Script | What it makes |
|---|---|
| `export_from_rds.R` | Plain CSV and JSON files in `WORK` (trait features, sources, synonyms, dropdowns) |
| `build_layout.py` | `taxa.parquet`, `raw_by_trait.parquet`, `raw_by_taxon.parquet`, `species_averages.parquet` and a first `manifest.json` |
| `build_trait_definitions.R` | `trait_definitions.json` |
| `build_contracts.py` | `trait_features`, `sources`, `dataset_citations` and `taxon_lookup` (Parquet), `name_index.json`, `dropdowns.json`, `schema.json`, `filter_spec.json`, `portal.json` and the final `manifest.json` |
| `build_extras.py` | `flora_links.parquet`, `taxon_synonyms.parquet` and `taxon_extras.json`. The last argument is the date of the APC (taxonomy) version |
| `verify_layout.py` | Checks only. It compares the new files with the original data and prints the differences (all should be 0) |
| `../split_dropdowns.py` | Moves the taxon names out of `dropdowns.json` into `taxon_names.json` |

`build_contracts.py` also holds the text of `schema.json`, `filter_spec.json` and `portal.json` (labels, default values, the download limit). Edit that file when one of them must change.

## Files that these scripts do not make

- `golden_cases.json` (the test cases, made by `golden/run_golden.py`)
- `sources.bib` (copy it from the AusTraits portal files)

The test on 7.0.0 gave the same files as the live data folder, except `flora_links.parquet`, which has 541 fewer rows. The live file has 541 rows with no taxon name (the text NA), and the new script leaves them out. No page uses them.

## After the data folder is ready

Follow the release steps in `browser-portal/README.md`: upload the folder, build `default_view.json`, rebuild the Browse pages with `tools/build_static_pages.py`, change `dataBase` in `browser-portal/config.json`, and purge the Cloudflare cache.
