# Builds the census data file used by the APCalign browser page.
#
# Run this in R, from the root of the austraits.org repository, when a new APC release is out:
#   install.packages("APCalign")   # or remotes::install_github("traitecoevo/APCalign")
#   source("apcalign-browser/tools/build_resources.R")
#
# Then upload the new file to Cloudflare R2 at  apcalign/<release>/resources.rds
# (data.austraitsdata.org) and change "dataUrl" and "release" in apcalign-browser/config.json.
# A new folder per release means the browser cache never serves an old file.
#
# Besides downloading the data, this script makes the page start faster. Both steps are checked to
# give identical answers (see README.md):
#   1. It drops columns that no R file in apcalign-browser/R ever names (long text fields and similar).
#   2. It builds, once, the tables that APCalign would otherwise build from the whole census on the
#      first call, and stores them in the file as `app_cache`.

release <- "2026-07-30"   # change to the new release date
code_dir <- "apcalign-browser/R"

res <- APCalign::load_taxonomic_resources(version = release)

# 1. drop columns the code never names
files <- list.files(code_dir, pattern = "[.]R$", full.names = TRUE)
code <- paste(unlist(lapply(files, function(f) { l <- readLines(f); l[!grepl("^\\s*#", l)] })), collapse = "\n")
for (n in names(res)) {
  d <- res[[n]]
  if (!is.data.frame(d)) next
  used <- vapply(names(d), function(cn) grepl(paste0("\\b", cn, "\\b"), code), TRUE)
  cat(sprintf("%-16s keeps %2d of %2d columns\n", n, sum(used), length(used)))
  res[[n]] <- d[, used, drop = FALSE]
}

# 2. build the tables that depend only on the census data
e <- new.env(); e[["%>%"]] <- dplyr::`%>%`
for (f in files) sys.source(f, envir = e, keep.source = FALSE)
for (sp in c("most_likely_species", "collapse_to_higher_taxon", "return_all")) {
  invisible(suppressMessages(e$create_taxonomic_update_lookup("Acacia aneura", resources = res, taxonomic_splits = sp)))
}
res$app_cache <- e$.memo$items
cat("cached tables:", paste(names(res$app_cache), collapse = ", "), "\n")

dir.create(release, showWarnings = FALSE)
out <- file.path(release, "resources.rds")
saveRDS(res, out, compress = "xz")
cat("Wrote", out, "-", round(file.size(out) / 1e6, 1), "MB\n")
