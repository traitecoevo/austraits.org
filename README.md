# Website for AusTraits built using HUGO via blogdown

### Install `blogdown` and HUGO in R Studio 

```r
# install blogdown
install.packages("blogdown")
library(blogdown) 

# install HUGO
blogdown::install_hugo()
```
### Build the site locally

Set the website folder as the working directory

```r
blogdown::serve_site()

# To stop the server
blogdown::stop_server()
```
