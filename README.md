# Speaker Toolkit

A CFP and speaker toolkit for meetup organisers, built as a serverless app on AWS. Organisers (admins) plan events, run calls for proposals (CFPs), review submissions and book speakers. Speakers keep a profile, submit talks to open CFPs and see their confirmed bookings.

The product name is defined in one place, `APP_NAME` in `frontend/src/config/app.ts`. The page title and UI read it from there.

## Roles

Access is controlled by Cognito groups. Public sign-up only creates `speaker` users (a post-confirmation Lambda adds them to the group). The first `admin` is added once from the CLI, see [DEPLOYMENT.md](DEPLOYMENT.md).

| Role | Can do |
|------|--------|
| `speaker` | Maintain a profile and headshot, browse open CFPs, save drafts and submit talks, edit or withdraw submissions, view confirmed bookings, delete their account |
| `admin` | Everything the organiser side needs: events and calendar, speaker directory, CFPs, submissions review, bookings, user management |

## Features

- **Events and calendar**: create, edit and delete events, shown in a calendar and list view. Deleting an event removes its bookings; CFPs are not tied to events, so they are untouched.
- **Speaker directory**: admins see all speakers, can create speakers on their behalf, upload or remove their headshots, link them to an existing user account, and set an admin-only marker and private notes. Markers and notes are never visible to speakers.
- **CFPs**: open and close CFPs, duplicate them, and build custom questions. A CFP is not linked to an event, and the close date is optional: a CFP with no close date is a standing CFP that stays open until you close it, so you can draw speakers from it for several events. Question sets can be saved as reusable templates and applied to other CFPs.
- **Submissions and review**: speakers can submit several talks per CFP, each rendered from the CFP's question list. Admins review submissions, give private ratings and notes, and set the status. Speakers only see a simplified status.
- **Bookings**: admins book speakers onto events. Warnings are returned when a booking looks risky, for example the speaker is marked "not again". Any accepted submission, from any CFP, can be booked onto any event (the same submission can be booked onto several events). Speakers see confirmed bookings only.
- **Admin and speaker views**: an admin who is also in the `speaker` group gets a header switch between the admin view and the speaker view, so they can open a CFP and fill it out. Admins who signed up through the public form keep the `speaker` group, and promoting a user keeps it.
- **Account deletion**: speakers can delete their account, which removes their profile, headshot, submissions and bookings.

## Architecture

- **Infrastructure**: AWS SAM (`template.yaml`)
- **Auth**: Cognito user pool with `admin` and `speaker` groups, email sign-in, API Gateway Cognito authorizer
- **API**: API Gateway REST API. Admin routes live under `/admin/*`, speaker routes under `/me/*`
- **Compute**: one Lambda (Node.js 22, TypeScript, built with esbuild) per area
- **Data**: DynamoDB, on-demand billing
- **Files**: private S3 bucket for headshots, accessed with presigned URLs only
- **Frontend**: React 18, TypeScript and Vite, hosted on Amplify

### Lambda functions

| Handler (`src/handlers`) | Area |
|---------|------|
| `post-confirmation.ts` | Cognito trigger, adds new users to `speaker` |
| `users.ts` | `/me`, account deletion, admin user management (invite, promote, demote) |
| `events.ts` | Admin event CRUD |
| `speakers-me.ts` | Speaker profile and headshot upload URL |
| `speakers-admin.ts` | Speaker directory, marker, notes, linking, admin headshot upload |
| `cfps.ts` | Admin CFP CRUD, questions, templates, plus open CFP list for speakers |
| `submissions-me.ts` | Speaker submissions (draft, submit, edit, withdraw) |
| `submissions-admin.ts` | Admin review, ratings, status |
| `bookings.ts` | Admin bookings and the speaker's `/me/bookings` |

Speaker-facing functions have no IAM access to the admin-only tables (`SpeakerAdminTable`, `SubmissionReviewsTable`), so private data cannot leak through them.

### DynamoDB tables

Events, Speakers, SpeakerAdmin (marker and notes), Cfps, QuestionTemplates, Submissions, SubmissionReviews (ratings and notes) and Bookings. Table names are passed to the Lambdas as environment variables such as `EVENTS_TABLE` and `SPEAKERS_TABLE` (see the `Globals` section of `template.yaml`).

## Project structure

```
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ src/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ handlers/          # One Lambda handler per area
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ shared/            # Shared types, validation, repositories, AWS clients
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ tests/                 # Backend Jest and fast-check tests
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ frontend/              # React + Vite app (see frontend/README.md)
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ template.yaml          # SAM template
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ amplify.yml            # Amplify build spec for the frontend
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ DEPLOYMENT.md          # Deploy guide
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ package.json           # Backend scripts and dependencies
```

## Local development

Prerequisites: Node.js 22+, AWS CLI configured, AWS SAM CLI.

Backend (run from the repo root):

```bash
npm install
npm run build        # tsc type check / compile
npm test             # Jest
npm run local        # sam local start-api
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in values from your deployed stack
npm run dev                  # http://localhost:3000
```

The frontend needs a deployed Cognito pool and API, because `sam local` does not emulate the Cognito authorizer or DynamoDB. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Environment variables

Backend variables are set by `template.yaml`: the table names listed above, `HEADSHOTS_BUCKET`, `ALLOWED_ORIGIN`, `REGION`, and `USER_POOL_ID` (users and speakers-admin functions only).

Frontend variables (read at build time by Vite):

| Variable | Used for |
|----------|----------|
| `VITE_USER_POOL_ID` | Cognito user pool ID |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app client ID |
| `VITE_API_ENDPOINT` | API Gateway URL, from the `ApiGatewayUrl` stack output |
| `VITE_AWS_REGION` | AWS region |

## Testing

Backend tests use Jest, with fast-check for property-based tests (route authorization, speaker privacy, validation, booking logic) and an infrastructure test that checks `template.yaml`.

```bash
npm test                      # backend
cd frontend && npm test       # frontend (Jest + Testing Library)
cd frontend && npm run lint   # frontend lint
```

## Deploying

```bash
npm run deploy      # sam build && sam deploy
```

The first deploy should use `sam deploy --guided`. Full steps, including the frontend and first-admin bootstrap, are in [DEPLOYMENT.md](DEPLOYMENT.md).

## License

MIT
