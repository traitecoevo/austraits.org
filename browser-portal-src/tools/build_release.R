#!/usr/bin/env Rscript
# Builds the data folder for one AusTraits release, checks it, and stops on any problem.
#
#   Rscript browser-portal-src/tools/build_release.R --src <input folder> --out <data folder> --version 7.1.0
#
# Options:
#   --src          folder made by austraits.portal's prepare_data_for_portal() (see tools/README.md)
#   --out          output folder, for example data/7.1.0
#   --version      data version; must match the Zenodo record
#   --zenodo       the release's austraits.json Zenodo record (default: the one next to --src)
#   --apc-version  APC release date (default: read from synonyms.rds)
# Needs the R packages DBI, duckdb, jsonlite, digest and V8.
here <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))))
for (f in list.files(file.path(here, "..", "R"), pattern = "[.]R$", full.names = TRUE)) source(f)
opt <- parse_cli(commandArgs(TRUE), required = c("src", "out", "version"))
build_browser_data(src = opt$src, out = opt$out, version = opt$version,
                   zenodo = opt$zenodo %||% file.path(dirname(normalizePath(opt$src)), "austraits.json"),
                   apc_version = opt[["apc-version"]],
                   templates = file.path(here, "..", "templates"),
                   site = file.path(here, "..", "..", "browser-portal"))
