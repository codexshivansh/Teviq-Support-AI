# Teviq Support AI Documentation

This `docs/` folder is the complete technical handover package for Teviq Support AI.

It covers:

- Product overview.
- Architecture.
- System flows.
- Codebase guide.
- Developer onboarding.
- API documentation.
- Environment variables.
- Deployment and release process.
- Security model.
- Storage model.
- Third-party services.
- Debugging and troubleshooting.
- Technical debt and roadmap.

## Quick Start

Read these first:

1. [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. [SYSTEM_FLOW.md](./SYSTEM_FLOW.md)
4. [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md)
5. [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md)

## Tech Stack

| Area | Stack |
| --- | --- |
| Backend | Node.js, Express, CommonJS |
| Dashboard | React, Vite, TailwindCSS, Framer Motion, Recharts |
| Widget | Plain HTML/CSS/JS |
| Website | React, Vite, TailwindCSS, React Router |
| Auth | Clerk |
| AI | Gemini primary, Groq fallback |
| Storage MVP | Local JSON files and uploads |
| Deployment | Render + Vercel/static hosting |

## Installation

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Dashboard:

```bash
cd dashboard
npm install
cp .env.example .env
npm run dev
```

Website:

```bash
cd "/Users/shivanshgupta/Documents/teviq site"
npm install
npm run dev
```

Widget:

```bash
cd widget
python3 -m http.server 8080
```

## Build

Dashboard:

```bash
cd dashboard
npm run build
```

Website:

```bash
cd "/Users/shivanshgupta/Documents/teviq site"
npm run build
```

Backend has no compile step.

## Deployment

See:

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [DEPLOYMENT_SOP.md](./DEPLOYMENT_SOP.md)
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md)

## Troubleshooting

Start with:

- [DEBUGGING_GUIDE.md](./DEBUGGING_GUIDE.md)
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

Common areas:

- CORS.
- Clerk JWT.
- 401/403 dashboard API errors.
- Knowledge upload/indexing.
- Widget embed.
- Vercel/Render deploy settings.

## Do Not Commit

Never commit:

- `.env`
- Real API keys.
- Real Clerk secrets.
- Customer documents.
- Production uploads.
- Production chat logs.
- Real customer order exports.

