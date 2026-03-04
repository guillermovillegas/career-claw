---
name: job-search
description: "Search for job postings and freelance opportunities across LinkedIn, Greenhouse, Upwork, Fiverr, and Indeed. Use when looking for new jobs, gigs, or freelance projects matching Guillermo's profile. Supports filtering by skills, location, remote preference, salary range, and platform."
---

# Job Search

**PRIORITY: Full-time roles. Freelance is secondary.** Always search full-time first. Only search freelance platforms after full-time search is complete.

Search for opportunities across multiple platforms using browser automation.

## Prerequisites

- Browser tool available
- Reference `guillermo-profile` skill for matching criteria

## Platform Search Instructions

### LinkedIn Jobs

1. Navigate to `linkedin.com/jobs`
2. Use search bar with keywords (e.g., "AI Product Manager", "Senior Full-Stack Engineer React")
3. Apply filters: Location (Chicago or Remote), Experience Level (Senior, Lead), Date Posted (Past Week)
4. For each result, extract: title, company, location, salary (if shown), **date posted**, job URL
5. **Skip listings older than 14 days** -- stale postings waste effort
6. Score each job 0-100 based on skill match with Guillermo's profile

See [references/linkedin-search.md](references/linkedin-search.md) for URL patterns, filter codes, and extraction details.

### Upwork Projects

1. Navigate to `upwork.com/nx/search/jobs`
2. Search by category: Web Development, AI/ML, Product Management
3. Filter: Fixed-price or Hourly, Budget range, Client history, Skills match
4. For each result, extract: title, description, budget, client info, skills required, proposals count
5. Prioritize: fewer proposals, verified payment, good client history

See [references/upwork-search.md](references/upwork-search.md) for search URLs, category filters, and competition analysis.

### Fiverr Buyer Requests

1. Navigate to `fiverr.com/users/[username]/seller_dashboard/briefs`
2. Review available buyer requests matching skills
3. For each: extract requirements, budget, deadline, buyer info

See [references/fiverr-search.md](references/fiverr-search.md) for navigation details and filtering tips.

### Greenhouse Job Boards

Many top companies (Stripe, Notion, Figma, Anthropic, etc.) use Greenhouse. Search via LinkedIn or Google with `site:boards.greenhouse.io` or `site:job-boards.greenhouse.io`.

1. Search Google: `site:boards.greenhouse.io "Product Manager" OR "Forward Deployed Engineer" OR "AI Engineer" remote`
2. Also try: `site:boards.greenhouse.io "Technical Program Manager" OR "Solutions Engineer" AI`
3. For each result, navigate to the Greenhouse posting and extract: title, company, location, description, requirements
4. Score each 0-100 per criteria below
5. These are almost always full-time roles (+10 bonus)

### Indeed

1. Navigate to `indeed.com`
2. Search with keywords + location (Chicago, IL or Remote)
3. Filter: salary range ($150K+), job type (Full-time, Part-time, Contract), date posted (Last 7 days)
4. Extract: title, company, location, salary, **date posted**, description snippet, job URL
5. **Skip listings older than 14 days**

## Rate Limits

- Max 20 searches per hour across all platforms
- Wait 3-5 seconds between page navigations
- Respect platform terms of service

## Scoring Criteria

Score jobs 0-100 based on:

| Factor          | Weight | Description                                      |
| --------------- | ------ | ------------------------------------------------ |
| Skill match     | 40%    | How well required skills match Guillermo's stack |
| Seniority match | 20%    | Senior/Lead/Principal/VP level preferred         |
| Industry fit    | 15%    | AI, SaaS, B2B, hospitality tech, fintech, solar  |
| Compensation    | 15%    | Target $180K+ full-time, $150+/hr freelance      |
| Remote/location | 10%    | Remote or Chicago preferred                      |

**Full-time bonus:** Add +10 points to any full-time role's final score. This ensures full-time always ranks above equivalent freelance matches.

**Part-time/Contract:** Also acceptable. Add +5 points for part-time or contract roles. These are preferable to freelance gig work.

**Staleness penalty:** Subtract 10 points for listings older than 7 days. Skip entirely if older than 14 days.

### Skill Match Tiers

- **90-100:** Core stack match (Next.js, React, TypeScript, AI/ML, Computer Vision, Supabase, Product Management)
- **70-89:** Adjacent stack (Python, Node.js, GCP, Docker, Kubernetes, mobile/React Native)
- **50-69:** Partial overlap (other JS frameworks, cloud platforms, general PM roles)
- **Below 50:** Weak match, skip unless compensation or seniority is exceptional

### Priority Keywords

**Primary (PM/Leadership roles - highest priority):** "VP Product", "VP of Product", "Head of Product", "Director of Product", "Director Product Management", "Group Product Manager", "Staff Product Manager", "Senior Product Manager AI", "Technical Product Manager", "AI Product Manager", "Technical Program Manager"

**Note:** Guillermo is overqualified for standard PM roles. Target Group PM+, Director+, VP, Head of Product, or Staff PM at larger companies. At smaller orgs / startups, any senior PM title works.

**Secondary (engineer roles that fit):** "Forward Deployed Engineer", "AI-Assisted Engineer", "Vibe Coder", "AI Engineer", "Solutions Engineer", "Founding Engineer", "Staff Engineer AI", "Prompt Engineer", "AI Developer Relations"

**Freelance:** "Next.js developer", "React expert", "AI integration", "Computer Vision", "SaaS platform", "MVP development", "Supabase", "TypeScript"

## After Searching

- Track top results using the jobclaw tracker tool
- Present ranked results with match scores to Guillermo for review
- Include direct links to each posting
- Flag any expiring listings (closing within 48 hours)
