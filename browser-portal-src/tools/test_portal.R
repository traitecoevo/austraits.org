#!/usr/bin/env Rscript
# Tests the portal in headless Chrome against a local data folder: the stored first page, searches checked
# against the golden cases, the Taxon View, Trait View and Citations tabs, and a download.
#
#   Rscript browser-portal-src/tools/test_portal.R --data data/7.1.0 [--port 8765]
#
# Run from the repository root. Needs Google Chrome and the R packages chromote and httpuv, plus internet
# access for the database engine (config.json engineBase).
here <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))))
for (f in list.files(file.path(here, "..", "R"), pattern = "[.]R$", full.names = TRUE)) source(f)
options(browser_portal.r_dir = normalizePath(file.path(here, "..", "R")))
options(warnPartialMatchDollar = TRUE)
opt <- parse_cli(commandArgs(TRUE), required = "data", optional = c("cases", "port"))
test_portal_in_browser(opt[["data"]], cases = opt[["cases"]] %||% file.path(here, "..", "golden", "golden_cases.json"),
                       site = file.path(here, "..", "..", "browser-portal"), port = as.integer(opt[["port"]] %||% 8765))
