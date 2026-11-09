#!/usr/bin/env Rscript
# Recomputes the expected results of the golden cases for a new release, with the Shiny portal's own filter
# code (austraits.portal's parse_filters() and apply_filters()) on the release inputs. The filter states in
# the file are kept; only the expected row counts and checksums change.
#
#   Rscript browser-portal-src/tools/make_golden_cases.R --src <input folder> --portal-repo ../austraits.portal
#
# Needs a checkout of austraits.portal and the packages it imports (pkgload loads it).
here <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))))
for (f in list.files(file.path(here, "..", "R"), pattern = "[.]R$", full.names = TRUE)) source(f)
options(browser_portal.r_dir = normalizePath(file.path(here, "..", "R")))
options(warnPartialMatchDollar = TRUE)
opt <- parse_cli(commandArgs(TRUE), required = c("src", "portal-repo"), optional = c("cases", "out"))
cases <- opt[["cases"]] %||% file.path(here, "..", "golden", "golden_cases.json")
make_golden_cases(opt[["src"]], opt[["portal-repo"]], cases = cases, out = opt[["out"]] %||% cases)
