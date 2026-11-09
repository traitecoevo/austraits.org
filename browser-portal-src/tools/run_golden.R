#!/usr/bin/env Rscript
# Runs every golden case through the browser's own filter code (browser-portal/js/toSql.mjs, run in V8) on a
# built data folder, and stops if any case's rows differ from the expected ones.
#
#   Rscript browser-portal-src/tools/run_golden.R --data data/7.1.0 [--cases browser-portal-src/golden/golden_cases.json]
#
# Run from the repository root. Needs the R packages DBI, duckdb, jsonlite, digest and V8.
here <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))))
for (f in list.files(file.path(here, "..", "R"), pattern = "[.]R$", full.names = TRUE)) source(f)
options(browser_portal.r_dir = normalizePath(file.path(here, "..", "R")))
options(warnPartialMatchDollar = TRUE)
opt <- parse_cli(commandArgs(TRUE), required = "data", optional = c("cases"))
run_golden_cases(opt[["data"]], cases = opt[["cases"]] %||% file.path(here, "..", "golden", "golden_cases.json"),
                 tosql = file.path(here, "..", "..", "browser-portal", "js", "toSql.mjs"))
