---
name: scheduling
description: "Manage calendar and meeting scheduling for interviews and client calls. Check availability via Google Calendar, propose meeting times, and create Cal.com booking links. Use when scheduling interviews, proposing times, or managing calendar."
---

# Calendar & Meeting Scheduling

Manage interview scheduling, client calls, and availability for Guillermo Villegas.

## Availability Defaults

- **Time zone:** Central Time (CT)
- **Preferred hours:** 9:00 AM - 5:00 PM CT, weekdays only
- **No meetings before** 9:00 AM CT or after 6:00 PM CT
- **Buffer between meetings:** 15 minutes minimum
- **Weekend meetings:** Only if explicitly approved by Guillermo

## Default Meeting Durations

| Meeting Type           | Duration | Notes                                  |
| ---------------------- | -------- | -------------------------------------- |
| Intro / discovery call | 15 min   | First contact with recruiter or client |
| Phone screen           | 30 min   | Recruiter or hiring manager screen     |
| Standard interview     | 45 min   | Behavioral, product, or culture fit    |
| Technical interview    | 60 min   | System design, coding, architecture    |
| Panel interview        | 60 min   | Multiple interviewers                  |
| Client kickoff         | 30 min   | Freelance project kickoff              |
| Client check-in        | 15 min   | Weekly or ad-hoc status update         |

## Checking Availability

### Google Calendar (via Browser)

1. Open Google Calendar in the browser
2. Navigate to the target date range
3. Identify open slots that fit the meeting duration + 15-min buffer on each side
4. Avoid overlapping with existing events

### Proposing Times

When proposing times to an external party, always:

1. Offer 3 time slots across 2 different days
2. Format as: "Tuesday, March 4 at 10:00 AM CT" (full day name, date, time, timezone)
3. Include timezone conversion if the other party is in a different zone
4. Confirm Guillermo's approval before sending proposed times

Example response to share:

```
I have a few openings this week:

- Tuesday, March 4 at 10:00 AM CT
- Wednesday, March 5 at 2:00 PM CT
- Thursday, March 6 at 11:00 AM CT

Any of those work for you? Happy to find another time if not.
```

## Cal.com Booking Links

For recurring scheduling needs, create or share Cal.com booking links:

- Use Cal.com to generate a link with available slots
- Set the link to respect Guillermo's calendar availability
- Share the link instead of going back-and-forth on times

When sharing a booking link in an email:

```
To make scheduling easy, feel free to pick a time that works for you: [Cal.com link]
```

## Calendar Invite Best Practices

When creating or suggesting calendar invites:

- Title format: "[Type] - Guillermo Villegas / [Other person] - [Company]"
- Include video link (Zoom, Google Meet, or their preference)
- Add a brief agenda or context in the description
- Set a 10-minute reminder

## Timezone Handling

- Always confirm the other party's timezone before finalizing
- Default assumption: US-based contacts are in their company HQ timezone
- For international contacts, explicitly ask for timezone
- Use 12-hour format with AM/PM and timezone abbreviation (e.g., "2:00 PM CT")

## Conflict Resolution

If a new meeting request conflicts with an existing event:

1. Flag the conflict to Guillermo
2. Propose alternative times that avoid the conflict
3. Never reschedule existing meetings without explicit approval
4. Priority order: active interviews > client calls > networking > informational

## Preparation Reminders

After scheduling an interview or important meeting:

- Trigger the `interview-prep` skill for company research and question preparation
- Set a prep reminder for 1 hour before the meeting
- Ensure talk tracks and STAR stories are ready (see interview-prep references)
