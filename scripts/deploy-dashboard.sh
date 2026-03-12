#!/usr/bin/env bash
# Deploy the dashboard to Vercel (production)
# Temporarily swaps .vercel/project.json to use the dashboard project
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cp .vercel/project.json .vercel/project.json.bak
cp apps/dashboard/.vercel/project.json .vercel/project.json

cleanup() { mv .vercel/project.json.bak .vercel/project.json 2>/dev/null || true; }
trap cleanup EXIT

npx vercel --prod --yes "$@"
