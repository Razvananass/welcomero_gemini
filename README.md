# welcomeRo — Your first month in Romania, made easier

A web app that helps newcomers in Timișoara (students first) work through their first month of
Romanian paperwork: a personal checklist, plain-language guides, an optional AI assistant,
Romanian phrases and an institutions directory. Languages: English, Română, Français, العربية (RTL), Українська, नेपाली.

**Important:** welcomeRo is an independent information tool, not a government service and not legal advice.
Most procedure details are marked **"Needs confirmation"** on purpose. Always check with the official institution.

## Listen to Romanian phrases
Each helper phrase has "Listen" and "Listen slowly" buttons. They use the browser's built-in speech engine (free, no key,
works offline). The voice is your device's own, so it needs a Romanian voice installed. If none is installed the buttons are
disabled with instructions (Windows: Settings → Time & language → Speech → Add voices → Romanian). Chrome/Edge on Windows
usually work after adding the voice. Not tested on real devices or with a real Romanian voice in this build environment
(a fake speech engine was used to test what gets spoken). Placeholders in [brackets] are skipped, not read aloud.

## Stack and how it works
- React + Vite + TypeScript + Tailwind + React Router. No login, no database.
- **Your answers and progress live in your browser's localStorage.** They never leave the device, do not sync
  between browsers/devices, and disappear if you clear site data (Settings → "Delete my data" does this too).
- Administrative data is in `src/data/*.json` (procedures, institutions, phrases, sources). Edit these files to
  correct or extend content; each item carries a reliability level (`verified | recommended | confirm`) and sources.
- The AI assistant calls `api/chat.ts` (a Vercel serverless function). The API key exists only on the server.

## Run locally
```bash
npm install
npm run dev          # app only; the AI shows "not available" (no API route in plain Vite)
npm test             # logic/data/i18n/API-handler tests
npm run typecheck
npm run build
```
To try the AI locally: `npm i -g vercel`, copy `.env.example` to `.env.local`, fill in the key, run `vercel dev`.

## AI assistant: free option and where the key goes
The assistant works with one of three providers. Set the key for **one** of them (free options are tried first):

| Provider | Cost | Environment variable | Get a key |
|---|---|---|---|
| **Google Gemini** (recommended) | Free tier, no card needed | `GEMINI_API_KEY` | aistudio.google.com → "Get API key" |
| Groq | Free tier | `GROQ_API_KEY` | console.groq.com → API Keys |
| Anthropic | Paid | `ANTHROPIC_API_KEY` | console.anthropic.com |

- **Locally:** put the key in `.env.local` (git-ignored), then run `vercel dev`.
- **On Vercel:** Project → Settings → Environment Variables → add the variable → redeploy.
- Optional: `AI_PROVIDER` (`gemini`, `groq` or `anthropic`) to force one provider when several keys exist; `AI_MODEL` to override the default model (Gemini `gemini-2.5-flash`, Groq `openai/gpt-oss-120b`, Anthropic `claude-sonnet-5-5`). Leave `AI_MODEL` empty unless you know the model name for the provider you use.
- Never prefix the variable with `VITE_` (that would publish the key in the browser).

Free-tier notes (from the providers' own pages, checked on 14 Nov 2026; they change often):
- Gemini: the free tier lists `gemini-2.5-flash` as free of charge, **but Google states free-tier content may be used to improve its products**. welcomeRo sends only what the user types in the assistant (no profile, no saved answers), but tell users not to type personal data such as passport numbers. The paid tier does not use content for training.
- Groq: the free plan has per-organisation limits (sample: about 30 requests/minute, 1,000 requests/day). Check your account's limits page.
- Free tiers can be rate-limited or change at any time. When that happens the app shows a "try again later" message and everything else keeps working.
- Without any key the app works fully; the assistant and the custom-message generator show a clear "not available" message (no fake answers).

## Deploy to Vercel (and get a preview link for every change)
One-time setup:
1. Sign in at vercel.com with your GitHub account.
2. **Add New → Project** → import this repository. Vite is auto-detected; keep the default build settings
   (build command `vite build`, output folder `dist`).
3. Before clicking Deploy, open **Environment Variables** and add the keys from `.env.example` that you use
   (at least `GEMINI_API_KEY`; optionally `ELEVENLABS_API_KEY`, `GROQ_API_KEY`, `AI_PROVIDER`, `AI_MODEL`).
   Tick both **Production** and **Preview** so preview links get the AI too. `.env.example` is not read by Vercel.
4. Click **Deploy**. You get a production URL like `https://<project>.vercel.app`.
5. Google sign-in only: in the Firebase console → Authentication → Settings → **Authorized domains**, add
   `<project>.vercel.app` (preview URLs have their own domains; add those too if you test sign-in on them).

After that, no manual steps:
- Every push to `main` updates the production URL.
- Every other branch and every pull request gets its own preview URL. Vercel posts it as a comment on the PR
  and next to the commit on GitHub. Open it to check your change before merging.
- Changed an environment variable? Redeploy (Deployments → ⋯ → Redeploy) for it to take effect.

`vercel.json` sends every non-`/api` path to `index.html` (so refreshing `/dashboard` works), bundles `src/data`
for the API functions and runs the official-sources check daily at 06:00 UTC.
Note: the endpoint has input limits but **no rate limiting**; add one (e.g. Vercel firewall) before wide public use.

## What still needs a human
- Verify every "Needs confirmation" item on the official pages (IGI, UAV/university offices, ANAF, CNAS, Primăria): documents, fees, deadlines, CNP and tax-number rules, health-insurance rules, opening hours.
- Institution addresses/phones/hours not marked verified are intentionally left empty. Other universities' offices are not listed.
- FR/RO/AR translations are not professionally reviewed (the UI says so); long guide details (documents, steps, warnings) are English-only and flagged as such.
- Data coverage is detailed for international students; other situations get a generic "verify" checklist.

## Testing status (honest)
Run in this build environment: 69 unit tests (checklist rules for profiles A/B/C and all 224 answer combinations, data
integrity, translations, API handler with a fake upstream) and 177 browser checks in headless Chrome
(onboarding validation, persistence, language/RTL, 375px overflow on 11 pages × 4 languages, assistant/helper in
no-key / key / API-missing modes, settings edit/delete, 404). **Not tested:** a real `npm run build` with the real Vite/React Router/Tailwind plugin
(no network here; a compatible esbuild + Tailwind compile was used), real `@types/react` typecheck, the real Vercel runtime,
and real responses from Gemini, Groq or Anthropic (the network was faked; request shapes follow each provider's documented format but were never sent to the real services). Run `npm install && npm run build && npm test` on your machine first.
