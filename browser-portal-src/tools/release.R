#!/usr/bin/env Rscript
# Builds and tests a whole data release in one command, running independent steps at the same time:
# the data folder (build_release.R) alongside the golden cases (make_golden_cases.R), then the golden
# check (run_golden.R), the Browse pages (build_static_pages.R) and the browser test (test_portal.R).
#
#   Rscript browser-portal-src/tools/release.R --src <input folder> --out data/7.1.0 --version 7.1.0 \
#     --portal-repo ../austraits.portal --pages-out site-pages [--no-browser-test true]
#
# Run from the repository root. See tools/README.md for what each step does and needs.
here <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))))
for (f in list.files(file.path(here, "..", "R"), pattern = "[.]R$", full.names = TRUE)) source(f)
options(browser_portal.r_dir = normalizePath(file.path(here, "..", "R")))
options(warnPartialMatchDollar = TRUE)
opt <- parse_cli(commandArgs(TRUE), required = c("src", "out", "version", "portal-repo", "pages-out"), optional = c("base", "portal", "cases", "zenodo", "no-browser-test"))
release_browser_data(src = opt[["src"]], out = opt[["out"]], version = opt[["version"]], portal_repo = opt[["portal-repo"]],
                     pages_out = opt[["pages-out"]],
                     base = opt[["base"]] %||% "https://data.austraitsdata.org",
                     portal = opt[["portal"]] %||% "https://www.austraits.org/browser-portal/",
                     cases = opt[["cases"]] %||% file.path(here, "..", "golden", "golden_cases.json"),
                     site = file.path(here, "..", "..", "browser-portal"),
                     templates = file.path(here, "..", "templates"),
                     zenodo = opt[["zenodo"]] %||% file.path(dirname(normalizePath(opt[["src"]])), "austraits.json"),
                     browser_test = !identical(opt[["no-browser-test"]], "true"))
