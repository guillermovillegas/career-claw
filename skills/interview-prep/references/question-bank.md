# Question Bank

Common interview questions with tailored answers for Guillermo Villegas. Answers are frameworks -- adapt the specific details to the company and role.

---

## General Questions

### "Tell me about yourself" (60-second version)

I'm a product leader and engineer with 10 years of experience building B2B SaaS across AI, IoT, hospitality, and fintech. Right now I'm co-founder and CPO at Levee, where we built an AI-powered inspection platform for hotels -- computer vision, mobile apps, the full stack. We just won several industry awards including PhocusWire's Global Startup Pitch.

Before that, I was a Technical PM at Axiom Law where I launched features that drove 75% activation in 30 days, and at Chamberlain Group where I managed a $250M+ smart home portfolio and turned a failing product line from -11% to +68% IRR through a Ring partnership.

I'm looking for a role where I can combine product strategy with hands-on technical execution -- ideally at a company working on [something relevant to this specific company].

---

### "Why are you looking for a new role?"

Levee is in a strong position and I'm proud of what we've built. I'm exploring opportunities because I want to apply what I've learned -- shipping production AI, building from zero to multi-tenant scale, leading product strategy -- at a larger scale. I'm drawn to [Company] specifically because [reference something specific about them].

---

### "What's your biggest technical achievement?"

The computer vision system at Levee. We built an end-to-end CV pipeline for hotel room inspections -- from dataset creation through model training (YOLO and RT-DETR) to production inference. The hard part wasn't just hitting 92%+ accuracy; it was doing it in a way that made business sense. I designed an automated GCE scheduling system that runs GPU instances only during active inspection hours, which got us to around 90% gross margins on ML infrastructure. Most startups burn cash on always-on ML -- we made it profitable from day one.

---

### "How do you prioritize features?"

I use a combination of impact and effort scoring, but the real work is in defining impact correctly. I start with the business objective -- what metric are we trying to move? Then I look at three things: how many users does this affect, how frequently, and how severely. I weight that against effort, factoring in technical risk and dependencies.

At Axiom Law, this framework is how we identified the Opportunity Feed -- it wasn't the most requested feature, but it had the highest potential impact on activation and revenue per user. We were right: 75% activation in 30 days.

I also maintain a strong bias toward shipping and learning over analysis paralysis. If two options are close, I'll pick the one we can ship faster and measure.

---

### "Tell me about a time you failed"

At Chamberlain, I initially underestimated how much the smart home accessory portfolio was struggling. I spent the first couple months trying to optimize the existing product positioning before realizing the fundamentals were broken at -11% IRR. The lesson was to challenge assumptions earlier -- I should have done a deeper financial analysis on day one instead of accepting the status quo.

Once I recalibrated, I found the Ring partnership opportunity and turned it around to +68% IRR. But I could have gotten there faster if I'd been more aggressive about questioning the baseline.

---

### "How do you work with engineering teams?"

I'm an engineer myself, so I speak the language natively. I write code daily and I've shipped millions of lines of production TypeScript, Python, and SQL. This means I can write specs that engineers actually find useful -- I include data models, API contracts, and edge cases, not just user stories.

In practice, I work best when I'm embedded with the team, not sending requirements over a wall. At Levee, I'm building alongside the engineers. At Axiom, I joined architecture reviews and contributed to technical decisions. Engineers appreciate that I understand the tradeoffs and don't ask for "simple changes" that are actually six weeks of work.

---

### "What's your experience with AI/ML?"

Deep and hands-on. At Levee, I led the computer vision pipeline from scratch -- dataset creation, model selection (YOLO, RT-DETR), training, and production deployment on GCP. I also designed the inference APIs and the automated infrastructure scheduling.

Beyond CV, I've integrated LLMs into multiple products. At SunrAI, I built an AI CRM that uses Google Gemini to generate solar proposals from satellite imagery. I've worked with RAG pipelines, LangChain/LangGraph, and prompt engineering across GPT, Gemini, and Claude.

I'm not a pure ML researcher, but I can go from "we need AI to do X" to a production system that actually works and makes money.

---

## Product-Specific Questions

### "How do you define success for a product?"

Success is a combination of user adoption, business impact, and technical sustainability. I define 2-3 primary metrics before building anything and track them relentlessly. At Axiom, it was activation rate and CLV. At Levee, it's inspection time reduction, accuracy, and gross margin. If we're not moving those numbers, the feature isn't working regardless of how much users say they like it.

---

### "How do you handle disagreements with stakeholders?"

Data first. I bring the evidence -- user research, metrics, competitive analysis -- and present the tradeoffs honestly. I've found that most disagreements come from different assumptions about the problem, not the solution. So I try to align on the problem definition before debating solutions.

If we still disagree, I'll defer to the stakeholder's judgment if it's their domain, or I'll propose a small experiment to test the hypothesis. At Chamberlain, the leadership team was skeptical of the Ring partnership. I built a financial model showing the potential IRR swing and proposed a limited pilot. The data spoke for itself.

---

### "Walk me through a product you'd build for us"

(Framework -- adapt to specific company)

1. Start with their current product and a specific gap or opportunity I observed
2. Describe the user pain and how I'd validate it (who I'd talk to, what data I'd look at)
3. Sketch a high-level solution with 2-3 key capabilities
4. Describe the technical approach at a high level (stack, architecture patterns)
5. Define 2-3 success metrics
6. Propose a timeline with milestones

---

## Technical Questions

### "Design a multi-tenant SaaS system"

I've built this multiple times, so I'll walk through the real architecture I used for SunrAI. Tenant isolation via PostgreSQL Row Level Security -- every table has a tenant_id column with RLS policies enforced at the database level. This means even if application code has a bug, data can't leak between tenants.

Authentication through Supabase Auth, with tenant_id embedded in the JWT claims. API layer checks both the auth token and the RLS policy. For performance, I use connection pooling and add tenant-scoped indexes on high-traffic tables.

The key decisions: RLS vs. separate schemas vs. separate databases. RLS is the right choice for most SaaS up to thousands of tenants. Separate schemas when you need per-tenant customization. Separate databases only when regulatory requirements demand it.

---

### "How do you handle offline-first architecture?"

Built this for SunrAI Mobile. The pattern: local SQLite database on the device with a sync engine that reconciles with the server when connectivity returns. Key design decisions:

1. Conflict resolution strategy -- last-write-wins for most fields, merge for additive fields
2. Queue-based sync -- mutations are queued locally and replayed in order
3. Optimistic UI -- show changes immediately, reconcile in background
4. Periodic background sync when online
5. Clear UX indicators for sync status so users know if they're working with stale data

---

## Questions to Ask Them

Have 2-3 of these ready. Pick based on the interviewer's role:

**For hiring managers:**

- What does success look like for this role in the first 90 days?
- What's the biggest challenge the team is facing right now?
- How does the team make product decisions?

**For engineers:**

- What does your deployment process look like?
- What's the hardest technical problem you've solved recently?
- How do you handle technical debt?

**For executives:**

- Where do you see the product in 2 years?
- What's the company's biggest risk right now?
- How do you think about build vs. buy for core capabilities?

**For recruiters:**

- What's the interview process from here?
- What's the team composition?
- What's the timeline for making a decision?
