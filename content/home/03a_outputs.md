---
widget: blank

# Activate this widget? true/false
active: true

# This file represents a page section.
headless: true

# Order that this section appears on the page.
weight: 15
color: white
title: AusTraits project outputs
subtitle:

design:
  columns: "1"
  background:
    image:
    image_darken: 1.0
    image_parallax: true
    image_position: right
    image_size: contain
    text_color_light: false
  spacing:
    padding: ["20px", "0", "20px", "0"]

---
<div style="background-color:white">

### The AusTraits Plant Dictionary (APD)

[{{< figure src="APD_logo.png" width="175">}}](https://traitecoevo.github.io/APD/)

The trait definitions used to map data within AusTraits have been developed into a formal vocabulary, the **[APD](https://w3id.org/APD)**. The APD extends the core information required by the AusTraits workflow and releases all trait definitions in both machine-readable RDF representations and human-friendly outputs (html & csv documents). The dictionary includes trait description metadata required by the pipeline that builds AusTraits including accepted units (for numeric traits) and either explicitly allowed (and defined) values (for categorical traits) or an allowed range (for numeric traits). The APD also includes references for traits, links to other trait databases, ontologies and thesauri providing data or definitions for the same trait concept, keywords, and hierarchical categories for easy data searching. The APD can also be accessed through the ARDC's Research Vocabulary Australia **[portal](https://vocabs.ardc.edu.au/viewById/649)**. 

The AusTraits team held a series of **[workshops](post/workshop1/)** from 2021-2023 to review and revise 29 trait definitions associated with seeds and germination, 49 trait definitions associated with plant growth form and leaf morphology, and 35 traits associated with fire response and plant regeneration. These workshops considered the scope of each trait concept, crafted explicit trait descriptions, and refined allowable trait values (*terms* for categorical variables and *ranges* for continuous variables). An additional 114 traits have been reviewed by 1-2 subject experts. These are predominately traits related to plant physiology or floral structure. The remaining traits were revised by the AusTraits team.

The APD was published as a data paper in Scientific Data in May 2024 and is available at: **[doi: 10.1038/s41597-024-03368-z](https://doi.org/10.1038/s41597-024-03368-z)**.

### Transforming taxonomic descriptions into trait data tables
Taxonomic descriptions for most of Australia's 30,000+ plant species are available in online floras maintained by state and national herbaria. One of our initiatives has been to use algorithms to extract key trait data from these paragraphs of information, providing an easy-to-search, tabular formulation of the taxonomic descriptions. This effort has led to the extraction of 570,000 distinct trait values across 36 traits. These data are available in AusTraits and the method used is described in **[Coleman et al. 2023](https://doi.org/10.1016/j.ecoinf.2023.102312)**.

For three traits, **[life history](https://w3id.org/APD/traits/trait_0030012)**, **[plant growth form](https://w3id.org/APD/traits/trait_0030010)**, and **[woodiness](https://w3id.org/APD/traits/trait_0030019)**, we manually gap-filled data for nearly all taxa in Australia, creating complete trait tables that can be readily used for diverse research projects. The protocols used and coverage are described in a paper published in the Australian Journal of Botany in May 2024: **[doi: 10.1071/BT23111](https://doi.org/10.1071/BT23111)**.

### Enhanced access options
The AusTraits team has developed a project API along the distribution of AusTraits data to other biodiversity platforms, including the Atlas of Living Australia (ALA), EcoCommons, and the Flora of Australia. ALA's taxon pages each have a traits tab offering a **[summary](https://bie.ala.org.au/species/https://id.biodiversity.org.au/node/apni/2912814#ausTraits)** of the AusTraits' trait data for that taxon and a link to download that taxon's raw data from AusTraits. The ALA traits tabs are visited about 2000 times a day.

### traits.build: a data model, workflow and R package for building harmonised ecological trait databases
[{{< figure src="traits.build_hex.png" width="175">}}](https://github.com/traitecoevo/traits.build)
Prompted by interest from other research groups to use the AusTraits pipeline to aggregate databases for other taxonomic groups or different clusters of traits, the R code underlying AusTraits has been developed into a standalone R package, **[{traits.build}](https://github.com/traitecoevo/traits.build)**. Extensive documentation for how to create a trait database using the {traits.build} workflow is available in an accompanying online **[book](https://traitecoevo.github.io/traits.build-book/)**. A second GitHub repository, **[traits.build-template](https://traitecoevo.github.io/traits.build-template/)**, hosts a series of template files to launch your team into creating with traits.build.

The traits.build database structure has a documented data standard (data model), that aligns with established ontologies including the **[Extensible Observation Ontology (OBOE)](https://bioportal.bioontology.org/ontologies/OBOE)**, the **[Ecological Trait-data Standard (ETS)](https://github.com/EcologicalTraitData/ETS)**, and **[Darwin Core](https://dwc.tdwg.org/terms/)**.

In addition to AusTraits, two other trait databases for disparate traits and taxonomic groups have been built in the past year, with several others in progress.

A description of the traits.build data model, workflow and R package was published as a data paper in Ecological Informatics in August 2024 and is available at: **[doi: 10.1016/j.ecoinf.2024.102773](https://doi.org/10.1016/j.ecoinf.2024.102773)**.

### APCalign: an R package for aligning and updating names of Australian vascular plants
[{{< figure src="APCalign_hex.png" width="175">}}](https://github.com/traitecoevo/APCalign)
In Australia, the national taxonomic standard for vascular plants is the Australian Plant Census **[(APC)](https://biodiversity.org.au/nsl/services/search/taxonomy)**, supported by a comprehensive list of plant names documented in references, the Australian Plant Names Index **[(APNI)](https://biodiversity.org.au/nsl/services/search/names)**. All plant names within AusTraits are hence aligned with the APC and APNI.

The R code used by AusTraits to align names with the APC and APNI has been generalised into a standalone R package, **[{APCalign}](https://github.com/traitecoevo/APCalign)**, and accompanying ShinyApp that makes this workflow available to all researchers. It corrects typos, standardises syntax (including for phrase names), and updates names to the currently accepted taxon name (per the APC). The core functions within the package allow a user to read in a list of "original names" and output a list of names aligned to the APC.

A description of the APCalign R package was published in the Australian Journal of Botany in May 2024 and is available at: **[doi: 10.1071/BT24014](https://doi.org/10.1071/BT24014)**.