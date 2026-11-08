# Speaker Toolkit Frontend

React 18, TypeScript and Vite frontend for the CFP and speaker toolkit. It has two areas, chosen by Cognito group: an admin area for organisers and a speaker area for people submitting talks.

The product name comes from `APP_NAME` in `src/config/app.ts`. Change it there only. `vite.config.ts` also uses it to set the page title.

## Routes

Admin (`src/routes/adminRoutes.tsx`, under `/admin`): events and calendar, speaker directory and detail, CFP list and editor (questions, templates), submissions list and review, bookings, user administration.

Speaker (`src/routes/speakerRoutes.tsx`, under `/speaker`): profile and headshot, open CFPs, submission form, my submissions, my bookings, account deletion.

`RequireRole` guards each area. Users in neither group, or signed out, are sent to the login page.

## Layout

```
src/
├── components/
│   ├── admin/      # Organiser screens
│   ├── speaker/    # Speaker screens
│   ├── common/     # Layout, ConfirmDialog, RequireRole
│   └── __tests__/
├── config/         # app.ts (APP_NAME), env.ts (API_BASE_URL)
├── contexts/       # AuthContext
├── routes/         # adminRoutes, speakerRoutes
├── services/       # api.ts, apiTypes.ts
├── utils/          # roles, question and answer helpers, status helpers
└── aws-config.ts   # Amplify / Cognito configuration
```

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

Set these in `.env.local` (values come from the SAM stack outputs):

| Variable | Description |
|----------|-------------|
| `VITE_USER_POOL_ID` | Cognito user pool ID |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app client ID |
| `VITE_API_ENDPOINT` | API Gateway URL |
| `VITE_AWS_REGION` | AWS region |

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type check (`tsc`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint, fails on warnings |
| `npm test` | Run Jest tests |
| `npm run test:watch` | Jest in watch mode |

## Auth

Sign-in uses Amplify with Cognito. See [README-AUTH.md](README-AUTH.md) for the auth setup. The first admin is created from the CLI, see the root [DEPLOYMENT.md](../DEPLOYMENT.md).

## Hosting

Amplify builds from the root `amplify.yml` (app root `frontend`). `customHttp.yml` sets security headers and `public/_redirects` handles SPA routing.
