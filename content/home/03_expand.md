---
widget: blank

# Activate this widget? true/false
active: true

# This file represents a page section.
headless: true

# Order that this section appears on the page.
weight: 15
color: white
title: Enhancing and Expanding AusTraits
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

### Growing AusTraits into a national data asset
The AusTraits project received <ins>**[investment](https://doi.org/10.47486/DP720)**</ins> from 2021-2023 from the Australian Research Data Commons [(ARDC)](https://ardc.edu.au). The ARDC is funded by the National Collaborative Research Infrastructure Strategy [(NCRIS)](https://www.education.gov.au/ncris). The investment, together with co-investment from our 19 partner institutions, will expand AusTraits' data coverage and enhance data quality, allowing AusTraits to emerge as a national data asset. The AusTraits <ins>**[core team](#04_team)**</ins> and broader <ins>**[team of ARDC partners](team_subpage/)**</ins> are jointly working on a collection of work packages to achieve this goal.

[{{< figure src="ARDC-NCRIS.png" width="500">}}](https://ardc.edu.au)

### Contributing new data to AusTraits
To contribute trait data to AusTraits, please <ins>**[contact](#08_contact)**</ins> us. Briefly, we require your data contribution as a spreadsheet in conjunction with accompanying metadata.

A <ins>**[vignette](http://traitecoevo.github.io/austraits.build/articles/adding_data.html)**</ins> offers a detailed glance at the data entry process, with introductory sections on ideal submission formats near the top of the article.

We also accept any legacy datasets, either from your archives or transcribed from published data sources.

### Formalising vocabulary
The AusTraits team held a series of workshops from 2021-2023 to review and more fully document trait definitions and allowable trait values (*terms* for categorical variables and *ranges* for continuous variables) used to build AusTraits. Our three <ins>**[workshops](post/workshop1/)**</ins> have, respectively, reviewed 29 trait definitions associated with seeds and germination, 49 trait definitions associated with plant growth form and leaf morphology, and 35 traits associated with fire response and plant regeneration. An additional 114 traits have been reviewed by 1-2 subject experts. These are predominately traits related to plant physiology or floral structure.

### Establishing the AusTraits Plant Dictionary, APD
The trait definitions used to map data within AusTraits have been developed into a formal vocabular, the [APD](https://w3id.org/APD). The APD extends the core information required by the AusTraits workflow and releases all trait definitions in both machine-readable RDF representations and human-friendly outputs (html, PDF, and word docuemnt). The pipeline that builds AusTraits requires each trait to have defined units (for numeric traits) and either explicitly allowed (and defined) values (for categorical traits) or an allowed range (for numeric traits). The APD also includes references for traits, links to other trait databases and thesaurus providing data or definitions for the same trait concept, keywords, and hierarchical categories for easy data searching. The APD will shortly be discoverable through the ARDC's Research Vocabulary Australia [portal](https://vocabs.ardc.edu.au/).

### Transforming taxonomic descriptions into trait data tables
Taxonomic descriptions for most of Australia's 30,000+ plant species are available in online floras maintained by state and national herbaria. One of our initiatives has been to use algorithms to extract key trait data from these paragraphs of information, providing an easy-to-search, tabular formulation of the taxonomic descriptions. This effort has led to the extraction of 570,000 distinct trait values across 36 traits.

### Enhanced access options
The AusTraits team has developed a project API along the distribution of AusTraits data to other biodiversity platforms, including the Atlas of Living Australia (ALA), EcoCommons, and the Flora of Australia. ALA's taxon pages each have a traits tab offering a [summary](https://bie.ala.org.au/species/https://id.biodiversity.org.au/node/apni/2912814#ausTraits) of the AusTraits' trait data for that taxon and a link to download that taxon's raw data from AusTraits. The ALA traits tabs are visited about 2000 times a day.

### Converting the AusTraits workflow into a standalone R package, traits.build
Prompted by interest from other research groups to use the AusTraits pipeline to aggregate databases for other taxonomic groups or different clusters of traits, the R code underlying AusTraits is being developed into a standalone R package, traits.build. The necessary changes have forced us to look hard at aspects of the database tables and more carefully align our database structure with established ontologies including the <ins>**[Extensible Observation Ontology (OBOE)](https://bioportal.bioontology.org/ontologies/OBOE)**</ins>, the <ins>**[Ecological Trait-data Standard (ETS)](https://github.com/EcologicalTraitData/ETS)**</ins>, and <ins>**[Darwin Core](https://dwc.tdwg.org/terms/)**</ins>