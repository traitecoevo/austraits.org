#' Build and test a whole data release, running independent steps at the same time
#'
#' Runs the five release steps with as much overlap as their inputs allow:
#' the golden cases (which need only the inputs) are computed while the data
#' folder is built; then the golden check, the Browse pages and the browser
#' test run together. Each step runs in its own R process, with its own
#' workers. Stops with the log of any step that failed.
#'
#' @inheritParams build_browser_data
#' @param portal_repo A checkout of austraits.portal (see [make_golden_cases()]).
#' @param pages_out Output folder for the Browse pages.
#' @param base,portal Passed to [build_static_pages()].
#' @param cases The golden cases file; its expected values are recomputed for this release.
#' @param browser_test Run [test_portal_in_browser()] (needs Chrome and internet access).
#' @return A data frame of the steps and their times, invisibly.
release_browser_data <- function(src, out, version, portal_repo, pages_out,
                                 base = "https://data.austraitsdata.org",
                                 portal = "https://www.austraits.org/browser-portal/",
                                 cases = file.path("browser-portal-src", "golden", "golden_cases.json"),
                                 site = "browser-portal",
                                 templates = file.path("browser-portal-src", "templates"),
                                 zenodo = file.path(dirname(src), "austraits.json"),
                                 browser_test = TRUE) {
  src <- normalizePath(src); portal_repo <- normalizePath(portal_repo); site <- normalizePath(site)
  cases <- normalizePath(cases); templates <- normalizePath(templates); zenodo <- normalizePath(zenodo)
  dir.create(out, showWarnings = FALSE, recursive = TRUE); out <- normalizePath(out)
  dir.create(pages_out, showWarnings = FALSE, recursive = TRUE); pages_out <- normalizePath(pages_out)
  cores <- default_workers()
  t_start <- Sys.time()
  steps <- list()

  message("Building the data folder and the golden cases at the same time…")
  golden <- start_step("make golden cases", "make_golden_cases",
                       list(src = src, portal_repo = portal_repo, cases = cases, out = cases, workers = max(1L, cores %/% 2L)))
  steps$build <- run_step_here("build data folder", function() {
    build_browser_data(src, out, version, zenodo = zenodo, templates = templates, site = site)
  })
  steps$golden <- finish_step(golden)
  stop_if_failed(steps)

  message("Checking the golden cases, building the Browse pages and testing in a browser at the same time…")
  running <- list(
    check = start_step("run golden cases", "run_golden_cases",
                       list(data = out, cases = cases, tosql = file.path(site, "js", "toSql.mjs"), workers = max(1L, cores %/% 3L))),
    pages = start_step("build Browse pages", "build_static_pages",
                       list(data = out, out = pages_out, base = base, portal = portal, workers = max(1L, cores %/% 2L)))
  )
  if (browser_test) {
    running$browser <- start_step("test in a browser", "test_portal_in_browser", list(data = out, cases = cases, site = site))
  }
  for (k in names(running)) steps[[k]] <- finish_step(running[[k]])
  stop_if_failed(steps)

  res <- do.call(rbind, lapply(steps, function(s) data.frame(step = s$name, seconds = round(s$seconds, 1), ok = s$ok)))
  for (i in seq_len(nrow(res))) message(sprintf("  %-22s %6.1f s", res$step[i], res$seconds[i]))
  message(sprintf("Release %s built and tested in %.0f s.", version, as.numeric(Sys.time() - t_start, units = "secs")))
  invisible(res)
}

# Start `fn(args)` in a background R process with this tooling loaded; its output goes to a log file
start_step <- function(name, fn, args) {
  log <- tempfile(paste0(gsub("\\W+", "-", name), "-"), fileext = ".log")
  child <- function(r_dir, fn, args) {
    if (is.null(r_dir)) library("austraits.portal", character.only = TRUE)
    else for (f in list.files(r_dir, pattern = "[.]R$", full.names = TRUE)) source(f)
    options(browser_portal.r_dir = r_dir)
    do.call(fn, args)
    invisible(NULL)
  }
  environment(child) <- globalenv()
  proc <- callr::r_bg(child, args = list(r_dir = getOption("browser_portal.r_dir"), fn = fn, args = args),
                      stdout = log, stderr = "2>&1", supervise = TRUE)
  list(name = name, proc = proc, log = log, start = Sys.time())
}

finish_step <- function(step) {
  step$proc$wait()
  ok <- identical(step$proc$get_exit_status(), 0L)
  list(name = step$name, ok = ok, seconds = as.numeric(Sys.time() - step$start, units = "secs"), log = step$log)
}

run_step_here <- function(name, f) {
  t0 <- Sys.time()
  ok <- tryCatch({ f(); TRUE }, error = function(e) { message(conditionMessage(e)); FALSE })
  list(name = name, ok = ok, seconds = as.numeric(Sys.time() - t0, units = "secs"), log = NULL)
}

stop_if_failed <- function(steps) {
  bad <- Filter(function(s) !s$ok, steps)
  if (!length(bad)) return(invisible())
  for (s in bad) {
    message(sprintf("\n%s FAILED", toupper(s$name)))
    if (!is.null(s$log) && file.exists(s$log)) message(paste(utils::tail(readLines(s$log, warn = FALSE), 25), collapse = "\n"))
  }
  stop(sprintf("%d release step(s) failed: %s", length(bad), paste(vapply(bad, function(s) s$name, ""), collapse = ", ")), call. = FALSE)
}
