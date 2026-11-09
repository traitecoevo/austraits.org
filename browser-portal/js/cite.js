// Builds the "Referencing your filtered data" text. Same wording as the Shiny portal (generate_usage_and_citations_text).
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`;

// A small markdown reader: paragraphs, bullet lists, **bold**, _italic_, [text](url) and <url>. Everything is escaped first.
export function inline(s) {
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, t, u) => link(t, u));
  s = s.replace(/&lt;(https?:[^\s&]+)&gt;/g, (m, u) => link(u, u));
  return s;
}
export function markdownToHtml(md) {
  const out = [];
  for (const block of md.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*-\s/.test(l))) out.push("<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*-\s+/, "")) + "</li>").join("") + "</ul>");
    else out.push("<p>" + lines.map(inline).join(" ") + "</p>");
  }
  return out.join("\n");
}

export function citationText(meta, keys, refs) {
  const { doi, concept_doi: cdoi, version, date } = meta;
  const year = String(date).slice(0, 4);
  return `The AusTraits dataset is available at [doi: ${cdoi}](http://doi.org/${cdoi}). AusTraits data is distributed under the CC BY 4.0 license (<https://creativecommons.org/licenses/by/4.0/>). The data is provided 'as is' without any warranties or guarantees of any kind. The AusTraits database is described in Falster et al. 2021, drawing from many the contributed datasets. Publications using AusTraits data should cite the AusTraits data paper and relevant datasets.

Taxa were aligned against the Australian Plant Census (APC, <https://biodiversity.org.au/nsl/services/search/taxonomy>) using the R package {APCalign} (Wenk et al 2024a), by first, searching for alignments with known names (via exact, then fuzzy matching), and then using known alignments to update taxon names to the currently accepted name. Original taxon names attributed by the data collectors are included.

Trait names were harmonised against the AusTraits Plant Dictionary (APD) (Wenk et al 2024b).

Note that trait values were scored at different levels (individual, population or species), according to source; individual and population level values might not be representative of the trait values displayed by a species in other parts of its range. The full dataset is available at [doi: ${cdoi}](http://doi.org/${cdoi})

The following datasets contributed data included in the selected search: ${keys.join(", ")}

**General AusTraits references**

- Falster et al ${year}. AusTraits ${version} [Data set]. Zenodo. doi: [${doi}](https://doi.org/${doi})
- Falster et al 2021. AusTraits, a curated plant trait database for the Australian flora. Scientific Data 8, 254. doi: [10.1038/s41597-021-01006-6](http://doi.org/10.1038/s41597-021-01006-6)
- Wenk EH et al. (2024a) APCalign: an R package workflow and app for aligning and updating flora names to the Australian Plant Census. Australian Journal of Botany 72 BT24014. doi: [10.1071/BT24014](http://doi.org/10.1071/BT24014)
- Wenk EH et al. (2024b) The AusTraits plant dictionary. Scientific Data 11: 537. doi: [10.1038/s41597-024-03368-z](http://doi.org/10.1038/s41597-024-03368-z)

**Primary dataset sources**

(subset, for large datasets full list is provided in the download)

${refs.map((r) => "-  " + r).join("\n")}`;
}
