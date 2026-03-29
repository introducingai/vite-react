# introducing.life

**The agentic internet, profiled daily.**

A daily digest and editorial intelligence layer for agent launches, tools, and infrastructure. Sharp takes on what's genuinely new versus what's repackaged noise.

Live at [introducing.life](https://introducing.life)

---

## What it does

- **Digest** — one featured launch per day, editorially profiled with novelty score, hook, what's missing, and an honest take
- **Monitor** — autonomous source sweep across GitHub Trending, Hacker News, Reddit, and X (when configured)
- **Launch** — paste your repo or idea, get a full launch post, X thread, normie rewrite, and positioning package
- **Gut-check** — market reality check before you ship: competition map, failure modes, missing proof
- **Bull** — paste any "Introducing X" post and score whether it's genuinely new, solid execution, repackaged, or vaporware
- **Submit** — builders submit their own launches for editorial review
- **Review** — operator queue to approve, reject, or feature submissions
- **Archive** — full filterable index of everything profiled

---

## Stack

- **Frontend** — React + Vite, deployed on Vercel
- **Backend** — Vercel serverless functions (`/api`)
- **Database** — Supabase (shared archive, submissions, audit logs)
- **Rate limiting** — Upstash Redis
- **AI providers** — Anthropic (Claude), OpenAI, Google, Grok, Ollama
- **Auth** — Session-based operator login with role system (viewer / moderator / editor / admin)
- **DNS** — introducing.life via Hostinger → Vercel

---

## Deploy

### 1. Clone and push to GitHub

```bash
git clone https://github.com/introducingai/vite-react
cd vite-react
```

### 2. Connect to Vercel

Import the repo at vercel.com. Vercel auto-detects Vite and deploys.

### 3. Set environment variables in Vercel

```env
# AI
ANTHROPIC_API_KEY=

# Operator auth
AUTH_SESSION_SECRET=        # long random string, 32+ chars
OPERATOR_EMAIL=
OPERATOR_PASSWORD=

# Database
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Origins
ALLOWED_ORIGINS=https://introducing.life,https://www.introducing.life

# X API (optional — requires Basic plan at developer.twitter.com)
X_BEARER_TOKEN=
```

### 4. Run Supabase schema

In your Supabase project → SQL Editor, run `supabase/schema.sql`.

### 5. Add DNS records in Hostinger

```
A     @      76.76.21.21
CNAME www    cname.vercel-dns.com
TXT   @      v=spf1 -all
TXT   _dmarc v=DMARC1; p=reject; adkim=s; aspf=s; pct=100
```

---

## Operator access

Sign in via the ⚙ settings panel on the live site using the email and password set in your Vercel env vars. Operator session gives access to the Review queue and archive writes.

See `SECURITY-PRODUCTION.md` for the full auth and security setup.

---

## Local development

```bash
cp .env.example .env
# fill in your keys
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173)

---

## License

MIT
