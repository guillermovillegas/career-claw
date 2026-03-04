# jobclaw-apply

CareerClaw content generation extension for OpenClaw. Generates tailored cover letters, freelance proposals, and resume summaries using Guillermo's embedded profile data.

## Tool

- **Name:** `jobclaw-apply`
- **Label:** CareerClaw Apply

## Actions

| Action                  | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `generate_cover_letter` | Create a tailored cover letter for a job application (<350 words) |
| `generate_proposal`     | Create a freelance proposal for Upwork/Fiverr/direct (<300 words) |
| `tailor_resume_summary` | Generate a role-specific 2-3 sentence resume summary              |

## Parameters

```typescript
{
  action: string,          // One of the actions above
  job_title: string,       // Job or project title
  company: string,         // Company or client name
  description: string,     // Job description or project requirements
  tone?: string,           // "confident" | "conversational" | "professional" | "technical"
  platform?: string,       // "linkedin" | "upwork" | "fiverr" | "indeed" | "direct"
  budget?: string,         // Budget range (proposals only)
  hiring_manager?: string  // Name if known (cover letters only)
}
```

## How It Works

1. Extracts key requirements from the job/project description
2. Matches against Guillermo's profile highlights, skills, and awards
3. Returns a structured prompt with matched context for the agent to generate final content
4. Agent uses the prompt + context to produce natural, personalized output

## Tone Options

- **confident** - Authority, strongest achievements first, active voice
- **conversational** - Casual but competent, short sentences
- **professional** - Structured, polished, business-appropriate
- **technical** - Tech stack match, specific tools and metrics

## Platform Formats

- **upwork** - Under 300 words, start with their problem, end with a question
- **fiverr** - Under 200 words, brief and punchy, include timeline
- **direct** - Professional email, portfolio link, concrete next steps
- **linkedin/indeed** - Standard cover letter format
