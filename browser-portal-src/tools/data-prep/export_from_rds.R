# Reads the portal's .rds tables and writes plain files (CSV/JSON) that the next step turns into Parquet.
suppressMessages({library(dplyr);library(jsonlite);library(readr)})
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("Usage: Rscript export_from_rds.R <folder with the .rds files> <work folder>")
src <- args[1]
out <- args[2]
dir.create(out, showWarnings = FALSE, recursive = TRUE)
tg  <- as.data.frame(readRDS(file.path(src, "trait_groups.rds")))
tf  <- tg |> transmute(trait, structure_measured, trait_group = trait_group_for_portal,
                       keywords, core_trait = !is.na(core_trait), entity = Entity)
write_csv(tf, file.path(out, "trait_features.csv"), na = "")
dd  <- readRDS(file.path(src, "dropdown_cache.rds"))
write_json(dd, file.path(out, "dropdowns.json"), auto_unbox = TRUE, pretty = FALSE)
so  <- as.data.frame(readRDS(file.path(src, "sources.rds")))
write_csv(so, file.path(out, "sources.csv"), na = "")
sy  <- as.data.frame(readRDS(file.path(src, "synonyms.rds")))
write_csv(sy, file.path(out, "synonyms.csv"), na = "")
cat("trait_features", nrow(tf), "| sources", nrow(so), "| synonyms", nrow(sy), "\n")
fl  <- dplyr::bind_rows(lapply(names(readRDS(file.path(src, "flora_links.rds"))), function(n) {
  x <- as.data.frame(readRDS(file.path(src, "flora_links.rds"))[[n]]); x$source <- n; x[, c("source", "taxon_name", "url")] }))
write_csv(fl, file.path(out, "flora_links.csv"), na = "")
cat("flora_links", nrow(fl), "\n")
