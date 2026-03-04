# STAR Stories

Prepared Situation-Task-Action-Result stories from Guillermo Villegas's experience. Each story is designed to be delivered in 60-90 seconds.

---

## 1. Leading Under Pressure -- Levee Marriott Pilot

**Best for:** Leadership, delivering under pressure, cross-functional collaboration, stakeholder management

**Situation:** Levee had landed a pilot with a Marriott property -- our first major hotel chain customer. The property needed a working inspection system that combined a mobile app with real-time computer vision, and the timeline was tight. The stakes were high because success would unlock the broader Marriott relationship and broader scale (we're now at 10,000+ rooms).

**Task:** As CPO, I owned the end-to-end delivery. I needed to coordinate our engineering team, ML engineers, and hotel operations staff to ship a production-ready system that field inspectors could actually use on property.

**Action:** I led the cross-functional team through an aggressive sprint. I designed the mobile app with an offline-first architecture so inspectors wouldn't lose work in areas with poor WiFi. I worked directly with our ML team to deploy YOLO-based object detection models optimized for hotel room conditions. I embedded with the hotel operations team during the first week to catch usability issues in real time and iterated daily.

**Result:** We achieved a 60% reduction in inspection time compared to their legacy manual process. The pilot succeeded and led to an ongoing partnership. This project also became the case study that helped us win the PhocusWire Global Startup Pitch Award and the HITEC $25K AI competition.

---

## 2. Technical Innovation -- Levee Computer Vision

**Best for:** Technical depth, AI/ML, problem-solving, infrastructure decisions

**Situation:** Hotels needed automated quality checks for room inspections, but existing computer vision solutions weren't built for the hospitality environment -- variable lighting, cluttered rooms, and hundreds of object categories specific to hotel operations.

**Task:** I needed to build an accurate, cost-effective CV system that could identify cleanliness issues, missing amenities, and maintenance problems in hotel rooms at production scale.

**Action:** I led the technical approach, training YOLO and RT-DETR models on hospitality-specific datasets. I built Flask-based inference APIs for real-time processing and designed an automated GCE scheduling system that spun up GPU instances only during active inspection hours to control costs. I also built the data pipeline for continuous model improvement using inspector feedback loops.

**Result:** We hit 92%+ accuracy across our target object categories. The ML infrastructure runs at approximately 90% gross margins thanks to the automated scheduling. The system processes thousands of images daily across active properties and continues to improve through the feedback loop.

---

## 3. Business Impact -- Chamberlain Ring Partnership

**Best for:** Business acumen, partnership management, turning around underperforming products, ROI

**Situation:** At Chamberlain Group, our smart home accessory product line was underperforming with a -11% IRR. Leadership was evaluating whether to continue investing in the category or wind it down.

**Task:** As Product Manager for Emerging Products, I was responsible for finding a path to profitability for the smart home accessory portfolio, which was part of a $250M+ product family.

**Action:** I identified Ring as a high-leverage partnership opportunity and led the technical integration and market strategy. I negotiated the partnership terms, coordinated cross-functional teams on the technical integration, and developed a go-to-market approach that leveraged Ring's ecosystem for distribution while positioning our products as premium accessories.

**Result:** The Ring partnership transformed the product economics from -11% IRR to +68% IRR -- a swing of nearly 80 percentage points. This saved the product line from potential sunsetting and generated multi-million dollar revenue impact. It became one of the highest-ROI initiatives in the Emerging Products group.

---

## 4. Product Strategy -- Axiom Law Opportunity Feed

**Best for:** Product sense, data-driven development, revenue growth, activation metrics

**Situation:** At Axiom Law, a legal services platform connecting companies with experienced lawyers, we had a large base of qualified legal professionals on the platform but limited ways to proactively match them with opportunities. Revenue growth was flattening.

**Task:** I needed to design and launch a new feature that would create engagement loops between available lawyers and incoming opportunities, unlocking new revenue streams from the existing platform.

**Action:** I led the discovery process, analyzing usage patterns and interviewing both sides of the marketplace. I designed the Opportunity Feed feature using data-driven prioritization -- matching lawyer expertise, availability, and preferences with incoming engagements. I built 50+ executive dashboards to track performance and worked closely with engineering to ship iteratively with weekly releases.

**Result:** The Opportunity Feed achieved 75% activation within 30 days of launch -- well above our 50% target. It unlocked new revenue streams from the existing user base and drove $100K+ in CLV gains. The dashboards I built also reduced reporting overhead by 70%, freeing the operations team to focus on client relationships.

---

## 5. Scaling -- SunrAI Multi-Tenant Platform

**Best for:** Architecture, scaling, full-stack engineering, AI integration, building from zero

**Situation:** Multiple solar companies needed an affordable, integrated platform for CRM, operations, and project management. Existing solutions were either too expensive, too generic, or required stitching together 5+ tools. There was a clear gap for a vertical SaaS solution.

**Task:** I needed to build a complete multi-tenant SaaS platform from scratch -- CRM, operations management, admin dashboard, and field mobile app -- that could serve multiple solar companies with proper data isolation and AI-powered features.

**Action:** I architected the entire system on Supabase with PostgreSQL Row Level Security for tenant isolation. I built the AI CRM using Google Gemini integration for automated proposal generation from satellite imagery. I developed four applications: the main CRM, an enterprise admin dashboard with real-time AI cost tracking, a marketing site, and a React Native mobile app with offline-first architecture for field technicians.

**Result:** The platform achieved 70% faster workflows compared to the manual processes it replaced. It serves multiple solar companies with clean tenant isolation and sub-2-second page loads. The system includes 204 React components and over 15,000 lines of server actions, processing $1M+ in transactions through the Figure API integration.

---

## Story Selection Guide

| Question Theme              | Primary Story                    | Backup Story                      |
| --------------------------- | -------------------------------- | --------------------------------- |
| Leadership / managing teams | #1 Marriott Pilot                | #3 Ring Partnership               |
| Technical challenge         | #2 Computer Vision               | #5 SunrAI Platform                |
| Business impact / ROI       | #3 Ring Partnership              | #4 Opportunity Feed               |
| Product sense / strategy    | #4 Opportunity Feed              | #1 Marriott Pilot                 |
| Building from scratch       | #5 SunrAI Platform               | #2 Computer Vision                |
| Failure / learning          | Adapt #3 (before the turnaround) | Adapt #1 (early pilot challenges) |
| Working with stakeholders   | #1 Marriott Pilot                | #4 Opportunity Feed               |
| Data-driven decisions       | #4 Opportunity Feed              | #2 Computer Vision                |
| AI / ML experience          | #2 Computer Vision               | #5 SunrAI Platform                |
