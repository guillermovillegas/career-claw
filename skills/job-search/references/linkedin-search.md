# LinkedIn Job Search Reference

## URL Patterns

Base search URL:

```
https://www.linkedin.com/jobs/search/?keywords=QUERY&location=LOCATION&FILTERS
```

### Filter Codes

| Parameter        | Code     | Values                                                                                           |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Time posted      | `f_TPR`  | `r86400` (24h), `r604800` (week), `r2592000` (month)                                             |
| Experience level | `f_E`    | `2` (entry), `3` (associate), `4` (mid-senior), `5` (director), `6` (executive)                  |
| Remote type      | `f_WT`   | `1` (on-site), `2` (remote), `3` (hybrid)                                                        |
| Easy Apply       | `f_AL`   | `true`                                                                                           |
| Salary range     | `f_SB2`  | `4` ($80K+), `5` ($100K+), `6` ($120K+), `7` ($140K+), `8` ($160K+), `9` ($180K+), `10` ($200K+) |
| Job type         | `f_JT`   | `F` (full-time), `C` (contract), `P` (part-time), `T` (temporary)                                |
| Sort by          | `sortBy` | `R` (relevant), `DD` (date)                                                                      |

### Example Searches for Guillermo

AI Product Manager, Remote, Senior+, Past Week:

```
linkedin.com/jobs/search/?keywords=AI%20Product%20Manager&location=United%20States&f_TPR=r604800&f_E=4%2C5&f_WT=2
```

Senior Full-Stack Engineer, Chicago or Remote, $180K+:

```
linkedin.com/jobs/search/?keywords=Senior%20Full-Stack%20Engineer%20React%20TypeScript&location=Chicago%2C%20Illinois&f_TPR=r604800&f_E=4&f_SB2=9&f_WT=2%2C3
```

Founding Engineer, Remote:

```
linkedin.com/jobs/search/?keywords=Founding%20Engineer&location=United%20States&f_TPR=r604800&f_WT=2&sortBy=DD
```

## Login Check

Before searching, verify login status:

1. Navigate to `linkedin.com`
2. Check if profile avatar/menu is visible in the top navbar
3. If not logged in, navigate to `linkedin.com/login` and authenticate
4. After login, proceed to job search

## Extracting Job Cards

On the search results page, job listings appear as cards in the left panel. For each card:

1. **Title:** The main heading link text
2. **Company:** Text below the title
3. **Location:** Text below company, includes remote badge if applicable
4. **Salary:** Shown below location when available (not all listings include salary)
5. **Date posted:** Relative time (e.g., "2 days ago") below the metadata
6. **Easy Apply badge:** Green badge indicates streamlined application
7. **Job URL:** The href on the title link, format `linkedin.com/jobs/view/JOB_ID`

## Full Job Description

Click a job card to load the full description in the right panel. Extract:

1. **Full description text** (requirements, responsibilities, qualifications)
2. **Skills listed** in the "Skills" section
3. **Company size and industry** from the company info block
4. **Applicant count** (e.g., "47 applicants" or "Be among the first 25 applicants")
5. **Seniority level, employment type, job function, industries** from the detail chips

## Pagination

- Results load 25 per page
- Scroll down or click "Show more" to load additional results
- URL parameter `start=25` loads page 2, `start=50` loads page 3, etc.
- Check up to 3 pages (75 results) per search query
