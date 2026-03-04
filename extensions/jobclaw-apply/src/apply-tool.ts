import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function stringEnum<T extends string>(values: T[], opts?: { description?: string }) {
  return Type.Unsafe<T>({ type: "string", enum: values, ...opts });
}

// Guillermo's profile data embedded for cover letter/proposal generation
// Source: /Users/g/development/career-claw/gv_resume.pdf
const RESUME_PDF_PATH = "/Users/g/development/career-claw/gv_resume.pdf";

const PROFILE = {
  name: "Guillermo Villegas",
  title: "Product Leader and AI Assisted Engineer",
  subtitle: "AI, SaaS, & B2B Platforms",
  location: "Chicago, IL",
  phone: "(773) 551-1393",
  email: "Guillermo@Levee.Biz",
  portfolio: "GuillermoTheEngineer.vercel.app",
  linkedin: "linkedin.com/in/guillermo-villegas-3080a011b",
  resumePath: RESUME_PDF_PATH,
  yearsExperience: 10,
  education: "B.S. Neurobiology, University of Iowa (2016)",
  summary:
    "Results-driven product leader with 10 years scaling B2B SaaS solutions across IoT, AI, hospitality, FinTech, and emerging technologies. Delivered ~50 repositories, 1M+ lines of code, and ~3000+ commits. Expert in Computer Vision, Google Gemini AI integration, and full-stack AI assisted development.",
  experience: [
    {
      company: "Levee Labs Inc.",
      role: "Co-Founder & Chief Product Officer",
      period: "Sep 2023 - Present",
      highlights: [
        "Built AI-powered B2B SaaS hospitality platform with proprietary computer vision and audio AI winning multiple industry awards in 2025",
        "Delivered +90% gross margin swing over three major initiatives through roadmap prioritization and infrastructure optimization",
        "Led product development for modular management portal enabling facility operations, inspections, ticketing, analytics, and RBAC across multi-property hospitality networks",
        "Owned product strategy for mobile app achieving 60% inspection time reduction during 605-room Marriott pilot",
        "Managed ML infrastructure roadmap including YOLO and transformer based computer vision models with automated FinOps scheduling",
        "Built operational BI platform (Next.js/React/Recharts) with KPI dashboards and executive reporting for multi-location B2B SaaS clients",
      ],
    },
    {
      company: "Axiom Law",
      role: "Technical Product Manager II",
      period: "Mar 2022 - Dec 2023",
      highlights: [
        "Launched Opportunity Feed achieving 75% activation in 30 days, unlocking new revenue streams",
        "Built 50+ executive dashboards driving $100K+ CLV gains through strategic analytics",
        "Streamlined legal ops workflows through automation, reducing reporting overhead by 70%",
      ],
    },
    {
      company: "The Chamberlain Group",
      role: "Product Manager, Emerging Products/Residential Accessories",
      period: "Sep 2020 - Mar 2022",
      highlights: [
        "Drove $250M+ hardware smart-home product portfolio delivering double-digit IRR improvements",
        "Led partnership with Ring achieving +68% IRR transformation from initial -11% baseline",
        "Oversaw roadmap, partnerships, and technical prioritization for access control and connected devices",
      ],
    },
    {
      company: "2U",
      role: "Product Management Instructor",
      period: "Jan 2021 - Apr 2022",
      highlights: [
        "Designed and delivered curriculum for 20+ students, achieving top-quartile ratings",
      ],
    },
  ],
  keyProjects: [
    "Levee - Hospitality Operations B2B SaaS (Management Portal, Mobile Platform, ML Infrastructure, Analytics)",
    "SunrAI & SoCap - Solar Vertical SaaS (Core Platform, AI CRM with Gemini, Mobile Operations)",
    "APACT - Enterprise Trading B2B SaaS (OTC Trading Platform, 6-role RBAC, Compliance Systems)",
  ],
  highlights: [
    "Co-Founder & CPO of Levee Labs - Global Startup Pitch Winner 2025",
    "Built computer vision systems with YOLO/RT-DETR deployed across 10,000+ hotel rooms",
    "Delivered +90% gross margin swing through roadmap prioritization and infrastructure optimization",
    "60% inspection time reduction during Marriott pilot — now deployed across 10,000+ rooms",
    "$250M+ smart-home product portfolio at Chamberlain Group with double-digit IRR improvements",
    "+68% IRR transformation on Ring partnership from -11% baseline",
    "50+ executive dashboards driving $100K+ CLV gains at Axiom Law",
    "Built entire vertical SaaS platforms (solar, trading, hospitality) end-to-end",
  ],
  skills: {
    product: [
      "Product Strategy",
      "Roadmapping",
      "User Research",
      "Feature Prioritization",
      "Cross-functional Leadership",
      "Go-to-Market Strategy",
      "B2B SaaS Metrics",
      "OKRs",
    ],
    technical: [
      "TypeScript",
      "React",
      "Next.js",
      "Node.js",
      "Python",
      "React Native/Expo",
      "Supabase",
      "PostgreSQL",
      "Docker",
      "GCP",
      "Kubernetes",
      "SQL",
      "REST/GraphQL APIs",
      "Claude Code",
    ],
    ai: [
      "LLM Integration",
      "Agentic Workflow Development",
      "Computer Vision (YOLO/RT-DETR)",
      "RAG Systems",
      "LangChain/LangGraph",
      "Google Gemini",
      "Vertex AI",
      "Claude/Anthropic",
      "MLOps",
      "Inference Serving (GCP/Groq)",
      "Fine-Tuning",
    ],
    b2b: [
      "Multi-tenant Platforms",
      "Enterprise Security",
      "Compliance (KYC/AML)",
      "RBAC/IAM",
      "Audit Systems",
      "FinOps",
    ],
  },
  awards: [
    "PhocusWire Global Startup Pitch Award Winner (North America) 2025",
    "PhocusWire Hot 25 Travel Startups for 2025",
    "People's Choice Award at 1871 AI Innovation Lab Pitch Expo",
    "TechOvation AI Award Nominee",
    "Skift 2025 Idea Award Finalist",
    "Chicago Product Management Association Organizer (7+ years)",
    "BuiltInChicago Top 50 Startups to Watch (2018)",
    "Newsweek Top 10 (#7) Online Outdoor Shop (2020) - Catch Co.",
  ],
};

export function createApplyTool(_api: OpenClawPluginApi) {
  return {
    name: "jobclaw-apply",
    label: "CareerClaw Apply",
    description:
      "Generate tailored cover letters for job applications and proposals for freelance gigs. " +
      "Uses Guillermo's profile data to create personalized, natural-sounding content. " +
      "Returns the generated text for review before submission.",
    parameters: Type.Object({
      action: stringEnum(["generate_cover_letter", "generate_proposal", "tailor_resume_summary"], {
        description: "What to generate.",
      }),
      job_title: Type.String({ description: "The job title or project title." }),
      company: Type.String({ description: "Company or client name." }),
      description: Type.String({ description: "Job description or project requirements." }),
      tone: Type.Optional(
        stringEnum(["confident", "conversational", "professional", "technical"], {
          description: "Tone of the output. Default: confident.",
        }),
      ),
      platform: Type.Optional(
        stringEnum(["linkedin", "upwork", "fiverr", "indeed", "direct"], {
          description: "Platform this is for, affects format.",
        }),
      ),
      budget: Type.Optional(Type.String({ description: "Budget range for freelance proposals." })),
      hiring_manager: Type.Optional(Type.String({ description: "Hiring manager name if known." })),
    }),

    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = params.action as string;
      const jobTitle = params.job_title as string;
      const company = params.company as string;
      const description = params.description as string;
      const tone = (params.tone as string) || "confident";
      const platform = (params.platform as string) || "linkedin";
      const budget = params.budget as string | undefined;
      const hiringManager = params.hiring_manager as string | undefined;

      switch (action) {
        case "generate_cover_letter":
          return jsonResult(
            generateCoverLetter(jobTitle, company, description, tone, hiringManager),
          );

        case "generate_proposal":
          return jsonResult(
            generateProposal(jobTitle, company, description, tone, platform, budget),
          );

        case "tailor_resume_summary":
          return jsonResult(tailorResumeSummary(jobTitle, company, description));

        default:
          return jsonResult({ error: `Unknown action: ${action}` });
      }
    },
  };
}

function generateCoverLetter(
  jobTitle: string,
  company: string,
  description: string,
  tone: string,
  hiringManager?: string,
) {
  // Extract key requirements from job description
  const requirements = extractKeyRequirements(description);
  const matchedHighlights = matchHighlights(requirements);
  const matchedSkills = matchSkills(requirements);

  const greeting = hiringManager ? `Hi ${hiringManager},` : "Hi there,";

  const toneGuide = {
    confident:
      "Write with authority. Lead with strongest achievements. Use active voice throughout.",
    conversational:
      "Write like messaging a smart colleague. Casual but competent. Short sentences.",
    professional: "Structured and polished. Business-appropriate. Measured confidence.",
    technical:
      "Lead with tech stack match. Include specific tools and metrics. Architecture-aware.",
  };

  return {
    type: "cover_letter",
    platform: "job_application",
    prompt_for_agent: `Write a cover letter for ${PROFILE.name} applying to ${jobTitle} at ${company}.

TONE: ${toneGuide[tone as keyof typeof toneGuide] || toneGuide.confident}

GREETING: ${greeting}

BEST MATCHING HIGHLIGHTS (pick 1-2):
${matchedHighlights
  .slice(0, 3)
  .map((h) => `- ${h}`)
  .join("\n")}

JOB FIT:
${requirements.join(", ")}

FORMAT — STRICT:
- 3-5 sentences. Two short paragraphs max. 100-160 words total.
- Paragraph 1 (2-3 sentences): Open with one hard metric or achievement directly relevant to this role. Then connect it to ${company} — name something specific about their product, team, or challenge. Make the connection concrete, not generic.
- Paragraph 2 (1-2 sentences): One more supporting proof point OR a brief statement of what you'd bring to this specific role. Close with a professional single sentence — no fluff, no call-to-action clichés.
- Sign off: Guillermo Villegas

BANNED WORDS — never use any of these:
"excited", "passionate", "thrilled", "love to", "would love", "hope to", "looking forward",
"leverage", "synergy", "ecosystem", "innovative", "cutting-edge", "best-in-class", "world-class",
"dynamic", "fast-paced", "rockstar", "ninja", "guru", "thought leader", "disruptive",
"Lmk", "let me know", "feel free", "don't hesitate", "reach out", "circle back",
"hit the ground running", "move the needle", "take ownership", "deep dive",
"I believe", "I feel", "I think", "I am writing to", "please find attached",
"fit", "fit well", "great fit", "perfect fit", any exclamation points.

ALWAYS: Active voice. Past tense for achievements. Specific numbers. Name the company and role explicitly.

EXAMPLE STYLE (do not copy — write fresh):
"Hi [name],

At Levee I shipped a computer vision system to 92%+ accuracy across 10,000+ hotel rooms, cutting inspection time 60% during a Marriott pilot. ${company}'s work on [specific product/challenge] is the same class of problem — production AI with measurable ops impact.

I've also built the full-stack SaaS layer: multi-tenant portals, real-time analytics, and RBAC in Next.js/Supabase at scale. Happy to share specifics on either front.

Guillermo Villegas"`,
    matched_highlights: matchedHighlights,
    matched_skills: matchedSkills,
    requirements_detected: requirements,
    resume_path: RESUME_PDF_PATH,
    resume_filename: "Guillermo_Villegas_Resume.pdf",
  };
}

function generateProposal(
  projectTitle: string,
  clientName: string,
  description: string,
  tone: string,
  platform: string,
  budget?: string,
) {
  const requirements = extractKeyRequirements(description);
  const matchedHighlights = matchHighlights(requirements);
  const matchedSkills = matchSkills(requirements);

  const platformGuide: Record<string, string> = {
    upwork:
      "Upwork format: Start with understanding their problem. Keep under 300 words. End with a question. No generic intros.",
    fiverr:
      "Fiverr format: Brief and punchy. Show you read their request. Include timeline estimate. Under 200 words.",
    direct:
      "Direct pitch: Professional email format. Include portfolio link. Propose concrete next steps.",
  };

  return {
    type: "proposal",
    platform,
    prompt_for_agent: `Generate a freelance proposal from ${PROFILE.name} for the project "${projectTitle}" from ${clientName}.

PLATFORM: ${platform}
FORMAT: ${platformGuide[platform] || platformGuide.direct}

TONE: ${tone}
${budget ? `BUDGET: ${budget}` : ""}

MATCHED PROFILE HIGHLIGHTS (use 1-2 most relevant):
${matchedHighlights.map((h) => `- ${h}`).join("\n")}

MATCHED SKILLS:
${matchedSkills.join(", ")}

STRUCTURE:
1. Opening (1-2 sentences): Show understanding of their specific problem
2. Relevant experience (1-2 sentences): Most relevant project with metric
3. Approach (2-3 bullet points): Concrete steps you'd take
4. Timeline + rate context
5. Closing question to start dialogue

CONSTRAINTS:
- ${platform === "fiverr" ? "Under 200 words" : "Under 300 words"}
- Open with their problem, not your intro
- Include exactly 1 relevant portfolio link: ${PROFILE.portfolio}
- End with a specific question about their project
- Natural tone - like messaging a smart colleague
- Hourly rate: $150-250 depending on scope

PORTFOLIO: ${PROFILE.portfolio}`,
    matched_highlights: matchedHighlights,
    matched_skills: matchedSkills,
    requirements_detected: requirements,
  };
}

function tailorResumeSummary(jobTitle: string, company: string, description: string) {
  const requirements = extractKeyRequirements(description);
  const matchedSkills = matchSkills(requirements);

  return {
    type: "resume_summary",
    prompt_for_agent: `Tailor ${PROFILE.name}'s resume summary for ${jobTitle} at ${company}.

CURRENT SUMMARY:
Results-driven product leader with ${PROFILE.yearsExperience} years scaling B2B SaaS solutions across IoT, AI, hospitality, FinTech, and emerging technologies.

REQUIREMENTS TO ADDRESS:
${requirements.join(", ")}

MATCHING SKILLS:
${matchedSkills.join(", ")}

Generate a 2-3 sentence tailored summary that leads with the most relevant experience for this role.`,
    matched_skills: matchedSkills,
  };
}

// Simple keyword extraction from job description
function extractKeyRequirements(description: string): string[] {
  const desc = description.toLowerCase();
  const keywords: string[] = [];

  const skillMap: Record<string, string> = {
    react: "React",
    "next.js": "Next.js",
    nextjs: "Next.js",
    typescript: "TypeScript",
    "node.js": "Node.js",
    nodejs: "Node.js",
    python: "Python",
    supabase: "Supabase",
    postgres: "PostgreSQL",
    "machine learning": "Machine Learning",
    "computer vision": "Computer Vision",
    ai: "AI/ML",
    "artificial intelligence": "AI/ML",
    llm: "LLM",
    "product manager": "Product Management",
    "product management": "Product Management",
    b2b: "B2B SaaS",
    saas: "SaaS",
    agile: "Agile",
    kubernetes: "Kubernetes",
    docker: "Docker",
    gcp: "GCP",
    aws: "AWS",
    "full-stack": "Full-Stack",
    "full stack": "Full-Stack",
    mobile: "Mobile Development",
    "react native": "React Native",
    "rest api": "REST APIs",
    graphql: "GraphQL",
    sql: "SQL",
    fintech: "FinTech",
    hospitality: "Hospitality Tech",
    iot: "IoT",
    "real-time": "Real-time Systems",
    rbac: "RBAC/IAM",
    compliance: "Compliance",
    startup: "Startup Experience",
    leadership: "Technical Leadership",
    roadmap: "Roadmapping",
    strategy: "Product Strategy",
  };

  for (const [keyword, label] of Object.entries(skillMap)) {
    if (desc.includes(keyword) && !keywords.includes(label)) {
      keywords.push(label);
    }
  }

  return keywords.length > 0 ? keywords : ["General Software Engineering"];
}

function matchHighlights(requirements: string[]): string[] {
  const reqLower = requirements.map((r) => r.toLowerCase());
  const scored = PROFILE.highlights.map((h) => {
    const hLower = h.toLowerCase();
    let score = 0;
    for (const req of reqLower) {
      if (hLower.includes(req.toLowerCase().split("/")[0] ?? "")) score += 2;
      if (hLower.includes("ai") && req.includes("ai")) score += 1;
      if (hLower.includes("product") && req.includes("product")) score += 1;
      if (hLower.includes("saas") && req.includes("saas")) score += 1;
    }
    return { highlight: h, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map((s) => s.highlight);
}

function matchSkills(requirements: string[]): string[] {
  const allSkills = [...PROFILE.skills.product, ...PROFILE.skills.technical, ...PROFILE.skills.ai];
  const reqLower = requirements.map((r) => r.toLowerCase());

  return allSkills.filter((skill) =>
    reqLower.some(
      (req) =>
        skill.toLowerCase().includes(req.split("/")[0]?.toLowerCase() ?? "") ||
        req.toLowerCase().includes(skill.split("/")[0]?.toLowerCase() ?? ""),
    ),
  );
}
