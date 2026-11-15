# WelcomeRO — Your first month in Romania, made easier

WelcomeRO helps international students, workers, people seeking protection, and other newcomers in Timișoara turn Romanian paperwork into a personal, ordered checklist. It combines plain-language guides, document preparation, appointment kits, institution details, Romanian communication tools, and optional AI assistance.

WelcomeRO is an independent information tool, not a government service or a substitute for qualified legal advice. Each administrative item distinguishes source-supported information, practical recommendations, and details that depend on the person’s case.

## Main user journey

1. Choose a language and describe your situation.
2. Receive a checklist matched to citizenship, accommodation, work stage, or protection stage.
3. Open the recommended next step and prepare its documents.
4. Use the appointment kit and Romanian phrases at the office.
5. Record progress and continue to the next step.

A fictional sample student journey is available from the landing page for demonstrations. It requires no account.

## Languages

English, Română, Français, العربية (RTL), Українська, and नेपाली. The interface and guide summaries are translated. Some detailed administrative content is English-first and can be translated in the app; critical translations still need review by fluent speakers.

## Stack and data

- React, Vite, TypeScript, Tailwind CSS, and React Router.
- The app works without an account and stores profile answers, progress, document readiness, and planning dates in browser storage.
- Optional Google sign-in synchronizes that workspace through Firebase and Firestore.
- Administrative content is stored in `src/data/*.json`. Facts carry a reliability level and claim-specific source IDs.
- AI requests go through `api/chat.ts`; provider keys remain server-side.
- Source reachability and content fingerprints are checked by `.github/workflows/source-monitor.yml`. The workflow proposes a review PR; it never changes procedure advice automatically.

## Run locally

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

`npm run dev` starts the local application server, including the API handlers. AI and cloud features require their corresponding environment configuration.

## Environment variables

Copy `.env.example` to `.env.local` and add only the services you intend to use. Never commit real service keys or prefix them with `VITE_`.

| Service | Variable | Notes |
|---|---|---|
| Google Gemini | `GEMINI_API_KEY` | Recommended AI provider; default model is `gemini-3.8-flash` |
| Groq | `GROQ_API_KEY` | Text-only fallback unless configured explicitly |
| Anthropic | `ANTHROPIC_API_KEY` | Supports text and images |
| ElevenLabs | `ELEVENLABS_API_KEY` | Optional Romanian speech; browser speech remains available |

`AI_PROVIDER` can be `gemini`, `groq`, or `anthropic`. Provider-specific model variables (`GEMINI_MODEL`, `GROQ_MODEL`) are safer than the shared `AI_MODEL` when several providers are configured.

The API has request-size validation, timeouts, and a best-effort per-instance limiter. Before large public traffic, also configure provider budgets and a durable platform-level rate limit.

## Administrative sources

The source registry is `src/data/sources.json`. It includes Romanian government and university pages, EU sources, UNHCR, LOGS, and recognized specialist sources such as AIDA where appropriate.

Run the source checker with:

```bash
npm run sources:check
```

The checker records URL reachability and a content fingerprint in `src/data/source-status.json`. A changed fingerprint means that a person must inspect the source and affected guide. It does not automatically rewrite the guide or feed an unreviewed change to the AI.

After a qualified reviewer has checked every reported change and updated affected content, accept the new fingerprints with:

```bash
npm run sources:accept
```

The scheduled GitHub workflow opens a review PR when source status changes, providing a durable and auditable history without relying on temporary serverless storage.

## Deploy to Vercel

1. Import this repository into Vercel as a Vite project.
2. Add the required variables from `.env.example` under Project → Settings → Environment Variables.
3. Enable variables for Production and Preview as appropriate, then deploy.
4. If Google sign-in is enabled, add the production and preview hostnames to Firebase Authentication → Authorized domains.
5. Deploy `firestore.rules` before enabling cloud synchronization.

`vercel.json` provides SPA routing, API data bundling, request-duration limits, and browser security headers. Each push to `main` updates production; feature branches and pull requests receive previews when Vercel is connected.

## Testing status

The committed test runner is `tests/run.ts`. It covers checklist matching, profile validation and backward compatibility, administrative-data integrity, translations, planning, document readiness, source allowlisting, and mocked API behavior.

This repository does not currently contain a committed end-to-end browser suite. Before a public launch, run the production build and perform real-device checks for mobile layouts, Arabic RTL, camera upload, microphone access, Romanian speech, printing, Firebase authentication, and configured AI providers.

## Human review still required

Software checks cannot certify Romanian administrative guidance. Before presenting the content as professionally reviewed:

- Ask a qualified NGO adviser, university international-office employee, or immigration specialist to review eligibility, mandatory documents, deadlines, fees, and office details.
- Record the reviewer and date for each guide.
- Have fluent speakers review high-risk translations.
- Test the main journeys with students, workers, and people at different protection stages.

Contact: [welcomero.contact@gmail.com](mailto:welcomero.contact@gmail.com)
