#' Build the data folder that the browser portal reads
#'
#' Turns one prepared AusTraits release (the folder that austraits.portal's
#' `prepare_data_for_portal()` and `prepare_synonyms_for_portal()` write) into
#' the files the browser portal reads over HTTP: Parquet tables laid out for
#' range requests, small lookup tables, and the JSON files that describe the
#' data and the filters. It finishes by checking the result with
#' [verify_browser_data()] and stops on any problem.
#'
#' @param src Folder with `austraits-data.parquet`,
#'   `austraits-species-averages.parquet`, `trait_groups.rds`,
#'   `dropdown_cache.rds`, `sources.rds`, `synonyms.rds`, `flora_links.rds`,
#'   `definitions.rds` and `sources.bib`.
#' @param out Output folder, for example `data/7.1.0`. Created if missing.
#' @param version Data version, for example `"7.1.0"`. Must match the version
#'   in `zenodo`.
#' @param zenodo The `austraits.json` Zenodo record for the release. Defaults
#'   to the one next to `src`, as austraits.portal stores it.
#' @param apc_version Date of the APC release the synonyms come from. Defaults
#'   to the `apc_version` attribute stored in `synonyms.rds`.
#' @param templates Folder with `filter_spec.json` and `portal.json`.
#' @return `out`, invisibly.
build_browser_data <- function(src, out, version,
                               zenodo = file.path(dirname(src), "austraits.json"),
                               apc_version = NULL,
                               templates = file.path("browser-portal-src", "templates")) {
  check_browser_inputs(src, zenodo, templates)
  zen <- read_zenodo_meta(zenodo)
  if (!identical(zen$version, version)) {
    stop(sprintf("The Zenodo record %s is for version %s, not %s. Pass the record for this release (--zenodo on the command line).",
                 zenodo, zen$version, version), call. = FALSE)
  }
  dir.create(out, showWarnings = FALSE, recursive = TRUE)
  con <- DBI::dbConnect(duckdb::duckdb())
  on.exit(DBI::dbDisconnect(con, shutdown = TRUE), add = TRUE)

  message("Building the data tables…")
  build_data_tables(con, src, out)
  message("Building the lookup tables…")
  synonyms <- readRDS(file.path(src, "synonyms.rds"))
  if (is.null(apc_version)) apc_version <- attr(synonyms, "apc_version")
  if (is.null(apc_version) || is.na(apc_version)) {
    stop("synonyms.rds has no apc_version attribute; pass `apc_version`.", call. = FALSE)
  }
  build_lookup_tables(con, src, out, synonyms, apc_version)
  message("Writing the description files…")
  write_contract_files(con, src, out, version, zen, templates)
  file.copy(file.path(src, "sources.bib"), file.path(out, "sources.bib"), overwrite = TRUE)
  write_manifest(con, out, version)
  message("Checking the result…")
  verify_browser_data(src, out)
  invisible(out)
}

# Columns the browser portal reads; the build stops if the input lacks any of them
required_columns <- list(
  data = c("taxon_name", "family", "genus", "trait_name", "dataset_id", "observation_id", "row_id",
           "value", "unit", "entity_type", "value_type", "basis_of_value", "replicates",
           "basis_of_record", "life_stage", "collection_date", "measurement_remarks", "original_name",
           "location_name", "latitude (deg)", "longitude (deg)", "location_properties",
           "treatment_context_properties", "plot_context_properties", "entity_context_properties",
           "temporal_context_properties", "method_context_properties", "source_primary_key",
           "source_primary_citation", "data_contributors", "taxon_rank", "taxon_distribution",
           "establishment_means", "scientific_name", "taxon_id"),
  species = c("taxon_name", "family", "genus", "trait_name", "dataset_id", "unit", "value_type",
              "value_mean", "value_range", "value_min", "value_max", "all_replicates", "type"),
  synonyms = c("taxon_name", "name", "scientific_name", "taxonomic_status", "kind"),
  trait_groups = c("trait", "structure_measured", "trait_group_for_portal", "keywords", "core_trait", "Entity")
)

#' Stop with a clear message if an input file or a required column is missing
check_browser_inputs <- function(src, zenodo, templates) {
  files <- c("austraits-data.parquet", "austraits-species-averages.parquet", "trait_groups.rds",
             "dropdown_cache.rds", "sources.rds", "synonyms.rds", "flora_links.rds",
             "definitions.rds", "sources.bib")
  missing <- c(file.path(src, files), zenodo, file.path(templates, c("filter_spec.json", "portal.json")))
  missing <- missing[!file.exists(missing)]
  if (length(missing)) stop("Missing input files:\n  ", paste(missing, collapse = "\n  "), call. = FALSE)
  con <- DBI::dbConnect(duckdb::duckdb())
  on.exit(DBI::dbDisconnect(con, shutdown = TRUE), add = TRUE)
  # every taxon column is copied into taxa.parquet, so all of them are required too
  required_columns$data <- union(required_columns$data, taxon_columns)
  have <- list(
    data = db_columns(con, sql_str(file.path(src, "austraits-data.parquet"))),
    species = db_columns(con, sql_str(file.path(src, "austraits-species-averages.parquet"))),
    synonyms = names(readRDS(file.path(src, "synonyms.rds"))),
    trait_groups = names(readRDS(file.path(src, "trait_groups.rds")))
  )
  problems <- unlist(lapply(names(required_columns), function(k) {
    gone <- setdiff(required_columns[[k]], have[[k]])
    if (length(gone)) sprintf("%s: %s", k, paste(gone, collapse = ", "))
  }))
  if (length(problems)) {
    stop("The input lacks columns the portal needs (were the inputs made with the current austraits.portal?):\n  ",
         paste(problems, collapse = "\n  "), call. = FALSE)
  }
  invisible(TRUE)
}

read_zenodo_meta <- function(path) {
  m <- jsonlite::read_json(path)$hits$hits[[1]]
  list(version = sub("^v", "", m$metadata$version), doi = m$metadata$doi,
       concept_doi = m$conceptdoi, date = m$metadata$publication_date)
}

# Columns that describe the taxon; they move to taxa.parquet (one row per taxon) instead of being
# repeated on every data row
taxon_columns <- c("taxon_rank", "taxonomic_status", "taxonomic_dataset", "taxon_name_alternatives",
                   "genus", "family", "binomial", "trinomial", "taxon_distribution", "establishment_means",
                   "scientific_name", "taxon_id", "taxon_id_genus", "taxon_id_family", "scientific_name_id")
# Not needed in the browser: row_id only breaks sort ties, the citation comes from dataset_citations
dropped_columns <- c("row_id", "source_primary_citation", "repeat_measurements_id")

# The load-time fixes the Shiny portal applies (austraits.portal R/data_loading.R), done once here:
# strip the leading bracket from hybrid-formula genera (issue #113), and store coordinates as numbers
genus_fix_sql <- "regexp_replace(genus, '^[(]', '') AS genus"
coordinates_sql <- paste('TRY_CAST("latitude (deg)" AS DOUBLE) AS "latitude (deg)",',
                         'TRY_CAST("longitude (deg)" AS DOUBLE) AS "longitude (deg)"')

# Views `d` (raw data) and `s` (species averages) over the input files, with the load-time fixes
create_source_views <- function(con, src) {
  db_run(con, sprintf("CREATE OR REPLACE VIEW d AS SELECT * REPLACE (%s, %s) FROM %s", genus_fix_sql,
                      coordinates_sql, sql_str(file.path(src, "austraits-data.parquet"))))
  db_run(con, sprintf("CREATE OR REPLACE VIEW s AS SELECT * REPLACE (%s) FROM %s", genus_fix_sql,
                      sql_str(file.path(src, "austraits-species-averages.parquet"))))
}

#' taxa, raw_by_trait, raw_by_taxon and species_averages
build_data_tables <- function(con, src, out) {
  create_source_views(con, src)
  cols <- db_columns(con, "d")
  raw_cols <- setdiff(cols, c(taxon_columns, dropped_columns))
  pq <- function(name) file.path(out, paste0(name, ".parquet"))
  # one row per taxon_name (verify_browser_data checks the taxon columns are constant per name)
  copy_to_parquet(con, sprintf("SELECT DISTINCT taxon_name, %s FROM d ORDER BY taxon_name",
                               sql_ids(taxon_columns)), pq("taxa"))
  # `seq` is the row's position in the file's sort order; the browser pages by it
  raw <- function(order) {
    sprintf("SELECT row_number() OVER (ORDER BY %s)::INTEGER AS seq, d.family, d.genus, %s FROM d ORDER BY seq",
            order, sql_ids(raw_cols))
  }
  copy_to_parquet(con, raw("trait_name, taxon_name, dataset_id, observation_id, row_id"), pq("raw_by_trait"))
  # family and genus lead the sort so row-group statistics can skip most of the file
  copy_to_parquet(con, raw("family, genus, taxon_name, trait_name, dataset_id, observation_id, row_id"),
                  pq("raw_by_taxon"))
  scols <- db_columns(con, "s")
  skeep <- setdiff(scols, c(dropped_columns, setdiff(intersect(taxon_columns, scols), c("genus", "family"))))
  first <- c("trait_name", "taxon_name", "dataset_id", "value_type")
  sorder <- sql_ids(c(first, setdiff(skeep, first)))
  copy_to_parquet(con, sprintf("SELECT row_number() OVER (ORDER BY %s)::INTEGER AS seq, %s FROM s ORDER BY seq",
                               sorder, sql_ids(skeep)), pq("species_averages"))
}

#' Lookup tables and the small files the Taxon View and the Browse pages read
build_lookup_tables <- function(con, src, out, synonyms, apc_version) {
  pq <- function(name) file.path(out, paste0(name, ".parquet"))
  register <- function(name, df) duckdb::duckdb_register(con, name, as_text_columns(df), overwrite = TRUE)

  tg <- as.data.frame(readRDS(file.path(src, "trait_groups.rds")))
  features <- data.frame(trait = tg$trait, structure_measured = tg$structure_measured,
                         trait_group = tg$trait_group_for_portal, keywords = tg$keywords,
                         core_trait = !is.na(tg$core_trait), entity = tg$Entity)
  register("trait_features_in", features)
  copy_to_parquet(con, "SELECT * FROM trait_features_in ORDER BY trait", pq("trait_features"))

  register("sources_in", readRDS(file.path(src, "sources.rds")))
  copy_to_parquet(con, "SELECT * FROM sources_in ORDER BY source_primary_key", pq("sources"))

  # one citation per dataset_id (source_primary_key is not unique: Bryant_2021 has three citations)
  copy_to_parquet(con, sprintf("SELECT DISTINCT dataset_id, source_primary_key, source_primary_citation FROM %s ORDER BY dataset_id",
                               sql_str(file.path(src, "austraits-data.parquet"))), pq("dataset_citations"))

  # every accepted name, plus synonyms and misapplied names, pointing to the taxon_name used in the data
  register("synonyms_in", synonyms)
  copy_to_parquet(con, sprintf(
    "SELECT taxon_name AS name, taxon_name, family, genus, 'accepted' AS kind FROM %1$s
     UNION ALL
     SELECT s.name, s.taxon_name, t.family, t.genus, s.kind FROM synonyms_in s JOIN %1$s t USING (taxon_name)
     ORDER BY name", sql_str(pq("taxa"))), pq("taxon_lookup"))
  copy_to_parquet(con, "SELECT * FROM synonyms_in ORDER BY kind, scientific_name, taxon_name, name", pq("taxon_synonyms"))

  fl <- readRDS(file.path(src, "flora_links.rds"))
  fl <- do.call(rbind, lapply(names(fl), function(n) {
    x <- as.data.frame(fl[[n]])
    data.frame(source = n, taxon_name = x$taxon_name, url = x$url)
  }))
  register("flora_in", fl)
  copy_to_parquet(con, "SELECT source, taxon_name, url FROM flora_in WHERE taxon_name IS NOT NULL ORDER BY source, taxon_name",
                  pq("flora_links"))

  groups <- lapply(seq_len(nrow(features)), function(i) {
    list(trait = features$trait[i], entity = features$entity[i], group = features$trait_group[i],
         core = features$core_trait[i])
  })
  write_json_file(list(apc_version = apc_version, trait_groups = groups), file.path(out, "taxon_extras.json"))

  # trait definitions for the Trait View
  defs <- readRDS(file.path(src, "definitions.rds"))
  keep <- c("entity_URI", "label", "description", "comments", "type", "units", "allowed_values_min",
            "allowed_values_max", "allowed_values_levels")
  defs <- lapply(defs, function(x) Filter(Negate(is.null), x[keep]))
  jsonlite::write_json(defs, file.path(out, "trait_definitions.json"), auto_unbox = TRUE, digits = NA, null = "null")

  # filter choices; the long taxon list goes to its own file, read only when needed
  dd <- readRDS(file.path(src, "dropdown_cache.rds"))
  names_list <- dd[["all_taxon_names"]]
  if (!is.character(names_list) || !length(names_list)) {
    stop("dropdown_cache.rds has no all_taxon_names list.", call. = FALSE)
  }
  dd[["all_genus"]] <- sort_c(unique(sub("^[(]", "", dd[["all_genus"]])))  # as the Shiny loader does (issue #113)
  dd[["all_taxon_names"]] <- NULL
  dd[["taxon_name_count"]] <- length(names_list)
  jsonlite::write_json(dd, file.path(out, "dropdowns.json"), auto_unbox = TRUE)
  jsonlite::write_json(names_list, file.path(out, "taxon_names.json"))
}

#' schema.json, filter_spec.json, portal.json and name_index.json
write_contract_files <- function(con, src, out, version, zen, templates) {
  pq <- function(name) file.path(out, paste0(name, ".parquet"))
  names_all <- db_get(con, sprintf("SELECT taxon_name FROM %s ORDER BY taxon_name", sql_str(pq("taxa"))))$taxon_name
  jsonlite::write_json(names_all, file.path(out, "name_index.json"))

  tables <- list(
    raw_by_trait = list(file = "raw_by_trait.parquet", sorted_by = list("trait_name", "taxon_name", "dataset_id", "observation_id"), page_key = "seq"),
    raw_by_taxon = list(file = "raw_by_taxon.parquet", sorted_by = list("family", "genus", "taxon_name", "trait_name", "dataset_id", "observation_id"), page_key = "seq"),
    species = list(file = "species_averages.parquet", sorted_by = list("trait_name", "taxon_name")),
    taxa = list(file = "taxa.parquet", key = "taxon_name"),
    taxon_lookup = list(file = "taxon_lookup.parquet", key = "name"),
    trait_features = list(file = "trait_features.parquet", key = "trait"),
    sources = list(file = "sources.parquet", key = "source_primary_key"),
    dataset_citations = list(file = "dataset_citations.parquet", key = "dataset_id")
  )
  for (k in names(tables)) {
    f <- sql_str(file.path(out, tables[[k]]$file))
    d <- db_get(con, paste("DESCRIBE SELECT * FROM", f))
    tables[[k]]$columns <- lapply(seq_len(nrow(d)), function(i) list(name = d$column_name[i], type = d$column_type[i]))
    tables[[k]]$rows <- db_get(con, paste("SELECT count(*) AS n FROM", f))$n
  }
  tables$raw_by_trait$join <- "taxa on taxon_name"
  tables$species$join <- "taxa on taxon_name (genus and family are kept in the species file)"
  write_json_file(list(schema_version = 1, data_version = version, tables = tables,
                       note = "Every name, column and table the browser uses comes from this file. No column name is hard-coded in the bundle."),
                  file.path(out, "schema.json"), pretty = TRUE)

  # how filter choices become SQL: a fixed file, edited by hand when the filters change
  file.copy(file.path(templates, "filter_spec.json"), file.path(out, "filter_spec.json"), overwrite = TRUE)

  # names, labels, links, defaults and limits: a fixed file plus this release's version and DOI
  portal <- read_json_file(file.path(templates, "portal.json"))
  portal$data_version <- version
  portal$zenodo_meta <- zen
  write_json_file(portal, file.path(out, "portal.json"), pretty = TRUE)
}

#' manifest.json: size, row count and sha256 of every file, to check an upload against
write_manifest <- function(con, out, version) {
  files <- setdiff(sort_c(list.files(out)), "manifest.json")
  entries <- lapply(files, function(f) {
    p <- file.path(out, f)
    e <- list(bytes = file.size(p), sha256 = sha256_file(p))
    if (grepl("[.]parquet$", f)) {
      e$rows <- db_get(con, paste("SELECT count(*) AS n FROM", sql_str(p)))$n
      e$row_groups <- db_get(con, sprintf("SELECT count(DISTINCT row_group_id) AS n FROM parquet_metadata(%s)", sql_str(p)))$n
    }
    e
  })
  names(entries) <- files
  engine <- db_get(con, "SELECT version() AS v")$v
  write_json_file(list(data_version = version, built_with_duckdb = engine, files = entries),
                  file.path(out, "manifest.json"), pretty = TRUE)
}
