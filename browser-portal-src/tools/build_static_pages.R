#!/usr/bin/env Rscript
# Builds the static Browse pages (one per taxon, trait and family) from a built data folder.
#
#   Rscript browser-portal-src/tools/build_static_pages.R --data data/7.1.0 --out site-pages \
#     --base https://data.austraitsdata.org --portal https://www.austraits.org/browser-portal/
#
# Options:
#   --data    data folder made by build_release.R
#   --out     output folder; pages go under <out>/pages/
#   --base    public address of the site root, no trailing slash (canonical links and sitemap.xml)
#   --portal  address of the portal page (default /portal/index.html)
#   --limit   build only this many taxon pages, for a quick test
here <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))))
for (f in list.files(file.path(here, "..", "R"), pattern = "[.]R$", full.names = TRUE)) source(f)
options(browser_portal.r_dir = normalizePath(file.path(here, "..", "R")))
options(warnPartialMatchDollar = TRUE)
opt <- parse_cli(commandArgs(TRUE), required = c("data", "out"), optional = c("base", "portal", "limit"))
build_static_pages(data = opt[["data"]], out = opt[["out"]], base = opt[["base"]] %||% "",
                   portal = opt[["portal"]] %||% "/portal/index.html", limit = as.integer(opt[["limit"]] %||% 0))
