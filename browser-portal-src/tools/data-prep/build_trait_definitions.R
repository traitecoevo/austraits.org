# Writes <data folder>/trait_definitions.json from the AusTraits definitions.rds (used by the Trait View tab).
library(jsonlite)
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("Usage: Rscript build_trait_definitions.R <folder with definitions.rds> <data folder, e.g. data/7.1.0>")
d <- readRDS(file.path(args[1], "definitions.rds"))
out <- lapply(d, function(x) Filter(Negate(is.null), x[c("entity_URI","label","description","comments","type","units","allowed_values_min","allowed_values_max","allowed_values_levels")]))
write_json(out, file.path(args[2], "trait_definitions.json"), auto_unbox = TRUE, digits = NA, null = "null")
