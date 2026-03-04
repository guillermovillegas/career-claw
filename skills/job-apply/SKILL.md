---
name: job-apply
description: "Apply to jobs and submit freelance proposals. Generates tailored cover letters for full-time roles and proposals for Upwork/Fiverr gigs. Uses browser automation to fill application forms. Always reference guillermo-profile for personalization. Track all applications via jobclaw tracker."
---

# Job Application & Proposal Submission

## Prerequisites

- Reference `guillermo-profile` for all personalization
- Browser tool for form submission
- jobclaw tracker tool for tracking

## Cover Letter Generation

CRITICAL: All generated content must be EXTREMELY SHORT to avoid sounding like AI.

When generating cover letters:

1. 2-3 sentences MAXIMUM, under 75 words total
2. Sound like a quick note from a busy person, not a formal letter
3. One specific metric, zero fluff
4. No "I am writing to express my interest" - just get to the point
5. Write like you're texting a friend who happens to be hiring
6. Misspell nothing but use casual punctuation, contractions, lowercase ok
7. NEVER use phrases like "I am excited" / "I would love" / "I am passionate"

### Cover Letter Format

Just 2-3 lines. Example:

"Hey - saw the AI eng role. I built CV systems at 92%+ accuracy for hotel chains at Levee (we won PhocusWire's global pitch). Next.js/React/Python stack, 10yr shipping B2B SaaS. Happy to chat."

That's it. No more.

See [references/cover-letter-templates.md](references/cover-letter-templates.md) for role-specific templates (AI/ML, Product Manager, Full-Stack, Startup/Founding).

## Upwork Proposal Generation

When writing Upwork/Fiverr proposals:

1. 3-4 sentences MAX, under 100 words
2. First sentence: show you read their post (reference specific detail)
3. Second sentence: most relevant thing you built + one metric
4. Third sentence: how you'd approach it or timeline
5. End with one question
6. NO bullet lists, NO "dear sir", NO corporate speak
7. Sound like a DM, not a cover letter

### Proposal Format

Example:

"Your dashboard project sounds like what I built for SunrAI - multi-tenant analytics with real-time data, Supabase + Next.js. Shipped it in 3 weeks. I'd start with the data model and auth, then build out the visualizations. What's your timeline looking like?"

Short. Human. Done.

See [references/proposal-templates.md](references/proposal-templates.md) for project-type-specific Upwork/Fiverr templates.

## Application Submission

### LinkedIn Easy Apply

1. Click "Easy Apply" button
2. Fill form fields using profile data from `guillermo-profile`
3. Upload resume if prompted (use latest version)
4. Add cover letter if field is available
5. Review all fields before submitting
6. Submit and note the confirmation

### LinkedIn Standard Apply

1. Click "Apply" to go to company's application page
2. Fill in personal details from `guillermo-profile`
3. Upload resume
4. Paste generated cover letter into the appropriate field
5. Answer any screening questions honestly using profile data
6. Review and submit

### Upwork Proposal Submission

1. Click "Submit a Proposal" on the job listing
2. Set bid amount based on:
   - Hourly: $150-250/hr depending on project complexity
   - Fixed-price: estimate hours at $175/hr, then apply 15% buffer
3. Paste generated proposal into the cover letter field
4. Attach 1-2 relevant portfolio items
5. Answer any additional screening questions
6. Submit

### Fiverr Offer Submission

1. Navigate to the buyer request
2. Select the most relevant active gig to attach
3. Set offer price and delivery time
4. Paste tailored proposal
5. Submit

## Rate Limits

- Max 25 applications per day across all platforms
- Max 5 per hour to maintain quality
- Track all submissions in jobclaw tracker

## After Applying

For every application or proposal submitted:

1. Log in tracker: company, role, platform, date, cover letter/proposal text, job URL
2. Set follow-up reminder for 3 business days
3. For Upwork: check for client messages within 24 hours
4. For LinkedIn: monitor for interview requests within the week
