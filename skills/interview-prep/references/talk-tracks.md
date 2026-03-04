# Talk Tracks

Prepared 45-90 second narratives for key projects and themes. Deliver conversationally, not recited.

---

## Levee -- The Full Arc

**Use when:** "Tell me about your current work" or "What are you most proud of?"

**Duration:** 60-90 seconds

I co-founded Levee to solve a real problem I kept seeing in hospitality -- property inspections were painfully manual. Teams were walking around with clipboards, taking photos, and writing reports by hand. We built an AI platform that automates this entire workflow.

The core is a computer vision system I led from concept to production. We trained YOLO and RT-DETR models specifically for hotel environments, and we hit 92%+ accuracy for detecting cleanliness issues, missing amenities, and maintenance problems. On the product side, I designed a mobile app with offline-first architecture so inspectors can work even in basement conference rooms with no WiFi.

Our first big validation was a Marriott pilot where we cut inspection time by 60%. That success unlocked broader scale — we're now deployed across 10,000+ hotel rooms — and led to multiple industry awards this year: PhocusWire's Global Startup Pitch, HITEC's $25K AI competition, and a Skift Idea Award nomination.

What I'm most proud of is the business model. By automating GPU scheduling and running inference only during active hours, we operate at around 90% gross margins on the ML infrastructure.

---

## SunrAI -- Vertical SaaS from Zero

**Use when:** "Tell me about building something from scratch" or "Architecture experience?"

**Duration:** 45-60 seconds

I built a complete vertical SaaS platform for solar companies -- from an empty repository to a multi-tenant system serving real customers. The problem was that small and mid-size solar companies were stitching together 5 or 6 different tools for CRM, project management, operations, and field work.

I designed the architecture on Supabase with PostgreSQL Row Level Security for clean tenant isolation. Then I built four applications: the main AI-powered CRM that generates proposals using Google Gemini and satellite imagery, an enterprise admin dashboard with real-time cost tracking, a marketing site, and a React Native mobile app for field technicians that works offline.

The result was 70% faster workflows, sub-2-second page loads, and over a million dollars in transactions processed through the platform. It's a good example of how I think about product -- start with the user's pain, architect for scale, and ship fast without cutting corners on fundamentals like data isolation and reliability.

---

## APACT -- Enterprise Compliance

**Use when:** "Enterprise experience?" or "How do you handle compliance/security?"

**Duration:** 45 seconds

APACT is an enterprise OTC trading platform I built for energy commodity brokers. The interesting challenge was designing for institutional requirements -- 6-role RBAC, full audit trails, KYC/AML compliance, and regulatory reporting.

I built 46 API endpoints covering the complete trade lifecycle from initiation through settlement and audit. The system handles real-time analytics and enterprise security requirements while keeping the UX clean enough that traders actually want to use it.

It taught me a lot about building for regulated industries where every action needs to be traceable and every permission boundary needs to be airtight.

---

## Personal Philosophy

**Use when:** "How would you describe your approach?" or "What makes you different?"

**Duration:** 30-45 seconds

I sit at the intersection of product strategy and hands-on engineering. I've led product at companies managing $250M+ portfolios, and I've also personally written millions of lines of production code. I don't think those should be separate disciplines.

When I'm evaluating a product direction, I'm simultaneously thinking about the architecture implications. When I'm deep in code, I'm thinking about whether this feature is actually moving the right metrics. That duality lets me move fast without accumulating the kind of technical debt that slows teams down later.

My recent output backs this up -- 3.28 million lines of code in 2025, 132 projects, while also leading product strategy and winning multiple industry awards. I ship at an unusual pace because I don't have a hand-off gap between strategy and execution.

---

## Delivery Tips

- Start with the punchline if the interviewer seems impatient: "We cut inspection time by 60% at a 605-room Marriott" then fill in the how
- Pause briefly after stating a metric to let it land
- If asked a follow-up, go deeper on the technical or business details rather than repeating the narrative
- Adapt the emphasis based on the role: more technical detail for engineering interviews, more business context for PM interviews, more team/leadership for management interviews
- Keep a conversational pace -- these are stories, not presentations
