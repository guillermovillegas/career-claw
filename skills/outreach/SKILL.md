---
name: outreach
description: "Compose and send professional emails for job outreach, follow-ups, networking, and cold pitches. Uses browser automation to send via Gmail (guillermo.villegas.applies@gmail.com). Use for reaching out to recruiters, following up on applications, cold-emailing potential clients, or networking."
---

# Email Outreach & Follow-ups

Compose and send natural-sounding professional emails using Gmail via browser automation.

## Email Account

- From: guillermo.villegas.applies@gmail.com
- Display Name: Guillermo Villegas
- Send via: Gmail web interface using the browser tool

## Composition Guidelines

### Tone

- Conversational and direct, never corporate-speak
- Write like a real person, not a template
- Short paragraphs (2-3 sentences max)
- Total email: 100-200 words for outreach, 50-100 for follow-ups
- Reference something specific about the recipient or company

### What to Avoid

- Generic openers ("I hope this email finds you well")
- Long-winded introductions
- Overuse of buzzwords
- Sounding desperate or overly eager
- Bullet-point lists of skills (save for the resume)

## Email Types

### Initial Outreach (Recruiter/Hiring Manager)

Subject: [Specific role/topic] - [Short hook]

Structure:

1. One sentence: why you're reaching out (reference specific role or company initiative)
2. One sentence: your most relevant credential
3. One sentence: specific value you'd bring
4. CTA: suggest a brief call or ask a question

### Follow-up (After Application, Day 3)

Subject: Re: [Original subject] or Following up on [Role] at [Company]

Structure:

1. Brief reminder of application
2. One new piece of value (recent achievement, relevant article, etc.)
3. Reiterate interest
4. Soft CTA

### Second Follow-up (Day 7)

Structure:

1. Acknowledge they're busy
2. Brief restatement of fit
3. Offer to answer questions
4. Close gracefully

### Final Follow-up (Day 14)

Structure:

1. Very brief
2. "Wanted to check in one last time"
3. Leave door open for future
4. No pressure

### Cold Pitch to Potential Client

Subject: [Their specific pain point] - Quick idea

Structure:

1. Reference something specific about their business
2. Identify a problem you can solve
3. Brief proof (1 metric from similar work)
4. CTA: 15-min call

### Thank You (After Interview)

Subject: Great speaking with you - [Topic discussed]

Structure:

1. Thank them for their time
2. Reference specific topic from conversation
3. Reiterate enthusiasm
4. Brief next step mention

## Detailed References

- **Ready-to-customize templates:** See [references/email-templates.md](references/email-templates.md) for outreach, follow-up, networking, and pitch templates
- **Follow-up sequences with timing:** See [references/follow-up-sequences.md](references/follow-up-sequences.md) for multi-step follow-up cadences

## Sending Process

1. Compose email text
2. Present draft to Guillermo for approval
3. After approval, send via Gmail browser automation:

### Gmail Compose Workflow

```
Step 1: Navigate to Gmail
  browser:navigate targetUrl="https://mail.google.com"

Step 2: Take snapshot to find compose button
  browser:snapshot snapshotFormat="ai" refs="aria"

Step 3: Click "Compose" button
  browser:act request={ kind: "click", ref: <compose_button_ref> }

Step 4: Take snapshot to find form fields
  browser:snapshot snapshotFormat="ai" refs="aria"

Step 5: Fill the compose form
  browser:act request={
    kind: "fill",
    fields: [
      { ref: <to_field_ref>, value: "recipient@example.com" },
      { ref: <subject_field_ref>, value: "Subject Line" },
      { ref: <body_field_ref>, value: "Email body here" }
    ]
  }

Step 6: Take snapshot to verify content before sending
  browser:snapshot snapshotFormat="ai"

Step 7: Click Send (ONLY after Guillermo approves)
  browser:act request={ kind: "click", ref: <send_button_ref> }

Step 8: Wait for confirmation
  browser:act request={ kind: "wait", textGone: "Sending" }
```

### Important

- ALWAYS show the draft to Guillermo and get explicit approval before clicking Send
- If Gmail is not logged in, navigate to login and let Guillermo enter credentials
- After sending, log the email in the jobclaw tracker

## Rate Limits

- Max 20 outreach emails per day
- Space emails 5+ minutes apart
- Track all sent emails in jobclaw tracker

## Follow-up Automation

After sending initial outreach, create follow-up reminders:

- Day 3: First follow-up
- Day 7: Second follow-up (if no response)
- Day 14: Final follow-up (if no response)

Check tracker for overdue follow-ups daily.
