# FitMentor 💪

![FitMentor Hero Banner](./public/landing.png)

FitMentor is a Hebrew, RTL fitness application with a React frontend and an AWS serverless backend. It creates personalized workout plans, stores workout logs, calculates progress analytics, and provides an AI coaching chat.

## Architecture

- React 19, Vite 8, DOMPurify, and Chart.js 4
- API Gateway REST endpoints backed by Node.js 20 AWS Lambda functions
- Cognito User Pools for registration, login, password recovery, and authorization
- DynamoDB as the only source for plans, chat history, training logs, progress, and admin metrics
- OpenRouter calling only `deepseek/deepseek-v4-flash-0731`

The public `/API` route handles Cognito authentication actions. `/Admin`, `/Dashboard`, `/Progress`, and `/TrainingLog` require a valid Cognito token. User identity and Admin membership are derived from API Gateway's verified Cognito claims, never from request payload fields.

AI calls have no mock, static, alternate-model, or local-data fallback. If DeepSeek is unavailable or returns an invalid response, the request ends in an error and the failure state is stored for asynchronous plan generation.

## Main features

- Strict AI workout-plan generation with exactly three exercises per requested day
- Required sets, repetitions, rest, three descending numeric weights, technique, and progression guidance
- Server-side HTML sanitization and contract validation, plus client-side sanitization before rendering
- DynamoDB-backed AI chat sessions with strict JSON responses and validated plan updates
- AWS-backed workout logging, personal records, progress charts, and insights
- Cognito group-protected Admin dashboard with real AWS metrics and account blocking

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` by default. The deployed API URL is the frontend default. To use another stack, create a root `.env.local` file:

```env
VITE_API_BASE_URL=https://your-api-id.execute-api.your-region.amazonaws.com/prod
```

Useful verification commands:

```bash
npm test
npm run lint
npm run build
npm audit
```

## Backend deployment

The authoritative AWS SAM project is in `projects/fitmentor/backend`. Install each Lambda directory's dependencies through SAM, then build and deploy:

```bash
cd projects/fitmentor/backend
sam build
sam deploy --guided --parameter-overrides OpenRouterApiKey=YOUR_OPENROUTER_KEY
```

The `OpenRouterApiKey` parameter is marked `NoEcho` and is exposed only to the Dashboard Lambda. Generated `packaged.yaml` files and Lambda ZIP bundles are ignored by Git.

## Repository structure

```text
├── public/                         Static assets
├── src/                            Authoritative React frontend
│   ├── api/fitmentorApi.js         Authenticated AWS API client
│   └── pages/                      Dashboard, log, progress, and admin views
├── tests/                          Backend security and AI-contract tests
├── projects/fitmentor/backend/     Authoritative AWS SAM backend
│   ├── src/                        Lambda handlers
│   └── template.yaml               Infrastructure and Cognito authorization
├── package.json
└── vite.config.js
```

## Production frontend build

```bash
npm run build
```

The production output is written to `dist/` for static hosting.

Developed by [Or Sadof](https://github.com/OrSadof).
