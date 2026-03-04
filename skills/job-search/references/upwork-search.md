# Upwork Job Search Reference

## URL Patterns

Base search URL:

```
https://www.upwork.com/nx/search/jobs/?q=QUERY&sort=recency
```

### Query Parameters

| Parameter          | Description       | Example Values                                       |
| ------------------ | ----------------- | ---------------------------------------------------- |
| `q`                | Search query      | `react next.js`, `ai integration`, `computer vision` |
| `sort`             | Sort order        | `recency` (newest), `relevance` (default)            |
| `category2_uid`    | Category filter   | See category codes below                             |
| `t`                | Job type          | `0` (hourly), `1` (fixed-price)                      |
| `amount`           | Budget range      | `100-500`, `500-1000`, `1000-5000`, `5000-`          |
| `client_hires`     | Client hire range | `1-9`, `10-`                                         |
| `payment_verified` | Verified payment  | `1`                                                  |
| `proposals`        | Proposal range    | `0-4`, `5-9`, `10-14`, `15-19`                       |
| `duration_v3`      | Project length    | `weeks`, `months`, `semester` (6+ months)            |

### Category Codes for Guillermo

- Web Development: `531770282584862721`
- AI & Machine Learning: `531770282589057033`
- Software Development: `531770282580668419`
- Product Management: `531770282584862736`

### Example Searches

React/Next.js Development:

```
upwork.com/nx/search/jobs/?q=react%20next.js%20typescript&sort=recency&payment_verified=1&proposals=0-4
```

AI/ML Integration:

```
upwork.com/nx/search/jobs/?q=ai%20integration%20llm&sort=recency&category2_uid=531770282589057033&payment_verified=1
```

Computer Vision Projects:

```
upwork.com/nx/search/jobs/?q=computer%20vision%20yolo&sort=recency&payment_verified=1
```

Full-Stack SaaS:

```
upwork.com/nx/search/jobs/?q=full%20stack%20saas%20supabase&sort=recency&payment_verified=1
```

MVP/Prototype:

```
upwork.com/nx/search/jobs/?q=mvp%20prototype%20web%20app&sort=recency&amount=5000-&payment_verified=1
```

## Competition Analysis

Low competition indicators (prefer these):

- Proposals: 0-4 (best), 5-9 (good)
- Job posted within last 24 hours
- Client has hired before and has good feedback
- Payment method verified
- Clear requirements with realistic budget

High competition indicators (deprioritize):

- Proposals: 20+ (likely saturated)
- Vague requirements
- Budget under $500 for substantial work
- New client with no hire history

## Extracting Job Listings

For each job card on the results page:

1. **Title:** Main heading link
2. **Description snippet:** First 2-3 lines of the job description
3. **Budget:** Fixed-price amount or hourly range
4. **Client info:** Country, hire rate, total spent, feedback score
5. **Skills tags:** Listed below the description
6. **Proposals count:** Number of freelancers who have already applied
7. **Posted time:** Relative time since posting
8. **Job URL:** Click through to get the full URL

## Full Job Details

Click into a listing to get:

1. Complete job description
2. Required skills and expertise level
3. Activity on the listing (proposals, last viewed, interviewing count)
4. Client history (jobs posted, hire rate, total spent, average hourly rate paid)
5. Preferred qualifications

## Key Skills to Search For

Primary (highest match for Guillermo):

- React, Next.js, TypeScript, Node.js
- AI/ML, LLM integration, Computer Vision
- Supabase, PostgreSQL, Firebase
- Full-stack development, SaaS
- Product strategy, technical consulting

Secondary:

- Python, Docker, GCP, Kubernetes
- React Native, Expo, mobile development
- Tailwind CSS, Recharts, data visualization
- API design, system architecture
