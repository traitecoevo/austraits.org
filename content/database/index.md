---
title: AusTraits database - structure and contents

pagewidth: 100%
---

## Stucture of Austraits Database

AusTraits is a relational database, with 11 elements.


austraits

 |—— traits – central table of trait values for each observation

 |—— sites – table of site values

 |—— contexts – table of contextual properties

 |—— methods – table of dataset and trait methods

 |—— taxonomic_updates – taxonomic updates required for dataset

 |—— contributors – table of dataset contributors

 |—— excluded_data – table of trait values that have been excluded from AusTraits

 |—— taxa – details on each taxon in AusTraits

 |—— definitions – relational (nested) lists of definitions for each trait in AusTraits and other terminology employed

 |—— sources – list of references for all AusTraits contributions

 |—— build_info – R build information, including packages used


The elements traits, sites, contexts, methods, taxonomic_updates, contributors, and excluded_data store trait data and associated metadata. Columns in the primary traits table link to each of the ancillary tables.

{{< figure src="austraitsdatabase.png" caption="Linkages between the AusTraits tables storing different data components" width="20000">}}

The element definitions contains definitions for each trait and trait value (range of numeric values or list of categorical values) allowable in AusTraits, **[definitions vigette](http://traitecoevo.github.io/austraits.build/articles/Trait_definitions.html)**, as well as definitions and allowable parameters for all metadata associated with each AusTraits study. Details of these are **[here](http://traitecoevo.github.io/austraits.build/articles/austraits_structure.html)**

