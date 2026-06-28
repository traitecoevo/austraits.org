# austraits.org — agent & contributor guide

`austraits.org` is the source for the **AusTraits project website** (<https://austraits.org/>),
built with [Quarto](https://quarto.org/).

## Repo-local guidance

- **Content:** pages are `.qmd` files (Quarto markdown that can run small bits of R). Key pages:
  `index.qmd` (home), `impact.qmd` (download/citation stats — runs R), `contributors.qmd`,
  `contact.qmd`, and `team/team-partners.qmd`. Individual team profiles live under
  `team/team/*/_index.md` with a sibling `avatar.jpg`.
- **Config & styling:** `_quarto.yml` holds site settings and the navbar; `styles.css` (plus
  `team/styles.css`) for styling; `_footer.html` for the shared footer; `_extensions/` for Quarto
  shortcodes (e.g. social embeds).
- **Generated/cached:** `_site/` is the rendered output (don't hand-edit content there), and
  `_freeze/` caches Quarto code execution — keep it unless deliberately refreshing.
- **Build/preview:** install Quarto, then `quarto render` (builds into `_site/`) and
  `quarto preview` (local preview). No `renv`; if an R package is missing, `install.packages(...)`
  it (`impact.qmd` needs `jsonlite`).

Deployment: GitHub Actions (`.github/workflows/quarto-publish.yaml`) renders and publishes to
Netlify on pushes to **`master`** (the default branch); PR previews come from Netlify's own GitHub
integration. Gotchas: do **not** add a `pull_request` trigger to the publish workflow — it uses the
production Netlify credentials and would publish to the live site. The `impact.qmd` page is designed
to render from cached data (`data/zenodo/3568417.json` + its `_freeze/` output), refreshed by the
scheduled `Refresh Zenodo Cache` workflow.

---

## AusTraits family — cross-package context

`austraits.org` is part of the **AusTraits family** (a subset of the
[`traitecoevo`](https://github.com/traitecoevo) org) — here, the AusTraits project website. Family-wide
concerns are documented centrally in
**[austraits-meta](https://github.com/traitecoevo/austraits-meta)** — don't restate them here, read
them there:

- **Start with [`AGENTS.md`](https://github.com/traitecoevo/austraits-meta/blob/main/AGENTS.md)** —
  pipeline order, who owns what, dependency direction, source-of-truth rules, cross-boundary
  artifacts, gotchas.
- **[`dependencies.yml`](https://github.com/traitecoevo/austraits-meta/blob/main/dependencies.yml)** —
  machine-readable package graph + cross-boundary artifacts.
- **[`governance/`](https://github.com/traitecoevo/austraits-meta/tree/main/governance)** —
  label taxonomy, board #9 conventions, release playbooks, triage.

**Filing issues:** the whole family is tracked on one board,
[AusTraits #9](https://github.com/orgs/traitecoevo/projects/9) (new issues auto-add to it). Follow
the [issue & labelling guide](https://github.com/traitecoevo/austraits-meta/blob/main/governance/issue-guide.md):
pick one work-type label (`bug` / `task` / `epic`); Status and Priority are set on the board, not as
labels.

> austraits-meta is hand-maintained prose — a map, not ground truth. Verify specifics against the
> actual repos.
