#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

PORTFOLIO_IMAGES="/Users/g/development/personal-portfolio/public/images"

echo "=== CareerClaw Profile Setup ==="
echo ""

# Check for portfolio images
if [ ! -d "$PORTFOLIO_IMAGES" ]; then
  echo "ERROR: Portfolio images not found at $PORTFOLIO_IMAGES"
  exit 1
fi

echo "Portfolio images found. Available screenshots:"
echo "  Levee: levee-1.png, Levee-2.png through Levee-5.png"
echo "  SunrAI: sunrai-1.png through sunrai-5.png"
echo "  APACT: apact1.png through apact4.png"
echo "  Screenshotter: screenshotter-1.png through screenshotter-3.png"
echo ""

# Upwork profile setup
echo "[Upwork] Setting up profile..."
openclaw_agent --message "$(cat <<PROMPT
Set up Guillermo's Upwork profile using browser automation.

Reference: skills/profile-manager/references/upwork-profile-guide.md

Steps:
1. Navigate to upwork.com/freelancers/settings/profile
2. Set headline: "AI-Powered Platform Developer | Next.js/React/TypeScript | Computer Vision | Award-Winning Product Leader"
3. Set overview from the upwork-profile-guide.md (3 paragraphs)
4. Add top 15 skills: React, Next.js, TypeScript, Node.js, AI/ML, Computer Vision, Supabase, PostgreSQL, Python, Full-Stack Development, Product Management, React Native, Tailwind CSS, Docker, GCP
5. Set hourly rate: \$175/hr
6. Set availability: 20-30 hours/week
7. Add portfolio items with screenshots from $PORTFOLIO_IMAGES:
   - Levee AI Platform (levee-1.png, Levee-2.png, Levee-3.png)
   - SunrAI Solar CRM (sunrai-1.png, sunrai-2.png, sunrai-3.png)
   - APACT Trading Platform (apact1.png, apact2.png, apact3.png)
   - Screenshotter (screenshotter-1.png, screenshotter-2.png)
   - GitHub 2025: link to github.com/guillermovillegas
8. Add portfolio link: GuillermoTheEngineer.vercel.app
9. Add GitHub link: github.com/guillermovillegas

Report what was updated and any fields that need manual attention.
PROMPT
)" 2>&1 || echo "  Upwork profile setup completed (check agent output)"

echo ""

# Fiverr gig setup
echo "[Fiverr] Setting up gigs..."
openclaw_agent --message "$(cat <<PROMPT
Set up Guillermo's Fiverr gigs using browser automation.

Reference: skills/profile-manager/references/fiverr-gig-guide.md

Create 3 gigs:

Gig 1: AI-Powered Web Application
- Basic \$500 (3 pages), Standard \$1500 (8 pages), Premium \$3500 (15 pages)
- Gallery: $PORTFOLIO_IMAGES/levee-1.png, $PORTFOLIO_IMAGES/sunrai-1.png

Gig 2: Full-Stack SaaS Platform
- Basic \$1000 (1 module), Standard \$3000 (3 modules), Premium \$7000 (full)
- Gallery: $PORTFOLIO_IMAGES/apact1.png, $PORTFOLIO_IMAGES/sunrai-admin-1.png

Gig 3: AI/ML Feature Integration
- Basic \$750 (1 integration), Standard \$2000 (3), Premium \$5000 (custom)
- Gallery: $PORTFOLIO_IMAGES/Levee-2.png, $PORTFOLIO_IMAGES/screenshotter-1.png

For each gig: set title, description, pricing tiers, tags, FAQ, and gallery images per the fiverr-gig-guide.md.

Report what was created and any steps that need manual attention.
PROMPT
)" 2>&1 || echo "  Fiverr gig setup completed (check agent output)"

echo ""
echo "=== Profile Setup Complete ==="
echo "Review profiles manually at:"
echo "  Upwork: upwork.com/freelancers/~your-id"
echo "  Fiverr: fiverr.com/your-username"
