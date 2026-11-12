# Builds the census data file used by the APCalign browser page.
#
# Run this in R when a new APC release is out:
#   install.packages("APCalign")   # or remotes::install_github("traitecoevo/APCalign")
#   source("apcalign-browser/tools/build_resources.R")
#
# Then upload the new file to Cloudflare R2 at  apcalign/<release>/resources.rds
# (data.austraitsdata.org) and change "dataUrl" and "release" in ../config.json.
# A new folder per release means the browser cache never serves an old file.

release <- "2026-07-30"   # change to the new release date

res <- APCalign::load_taxonomic_resources(version = release)
dir.create(release, showWarnings = FALSE)
saveRDS(res, file.path(release, "resources.rds"), compress = "xz")
cat("Wrote", file.path(release, "resources.rds"), "-", round(file.size(file.path(release, "resources.rds")) / 1e6, 1), "MB\n")
