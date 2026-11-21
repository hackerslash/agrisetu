<div align="center">

<img src="apps/web/app/icon.svg" alt="AgriSetu logo" width="96">

# AgriSetu

Voice-first group buying of farm inputs for Indian farmers.

[![Release](https://img.shields.io/github/v/release/hackerslash/agrisetu?style=flat-square)](https://github.com/hackerslash/agrisetu/releases/latest)
[![Deploy](https://img.shields.io/github/actions/workflow/status/hackerslash/agrisetu/deploy-main.yml?branch=main&style=flat-square&label=deploy)](https://github.com/hackerslash/agrisetu/actions/workflows/deploy-main.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Flutter](https://img.shields.io/badge/Flutter-02569B?style=flat-square&logo=flutter&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white)

[Website](https://agrisetu.carrd.co/) · [Android APK](https://github.com/hackerslash/agrisetu/releases/latest)

</div>

Farmers place orders for seeds, fertiliser and other inputs by speaking in their own language. AgriSetu pools nearby orders for the same product into clusters, vendors bid on each cluster, and members vote on a bid, pay, and track delivery. The monorepo holds the farmer app (Flutter), the vendor portal (Next.js) and the shared API (Express + Prisma).

## Features

- Voice ordering with automatic language detection across 11 Indian languages (AWS Transcribe), LLM order parsing, and spoken clarification prompts (Translate + Polly)
- Inline editing of the detected product, quantity and unit before confirming
- Cluster lifecycle: forming, voting, payment, processing, dispatch, delivery, completion
- Vendor bidding and farmer voting per cluster, with ratings after delivery
- Vendor portal with gigs, orders, payments, analytics and document verification
- Phone OTP login (Fast2SMS) and push notifications (Firebase)
- Admin area for vendor approval

## Project structure

- `apps/mobile` - Flutter app for farmers
- `apps/web` - Next.js vendor portal and admin area
- `apps/api` - Express + Prisma API (PostgreSQL), WebSocket voice streaming
- `packages/api-client`, `packages/ui` - shared API client and UI components
- `packages/eslint-config`, `packages/typescript-config` - shared tooling config
- `infra/nginx` - reverse proxy config

## Quick start

Requires Node.js 18+, PostgreSQL, and Flutter for the mobile app.

```sh
npm install
npm run db:generate
npm run db:migrate
npm run dev:all        # API + vendor portal
npm run dev:mobile     # Flutter app in Chrome
```

Create the first admin account with `npm run bootstrap:superadmin --workspace=apps/api` (reads `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD`).

Other scripts: `npm run build`, `npm run lint`, `npm run check-types`, `npm run mobile:test`, `npm run mobile:build:android`.

## Configuration

The API reads these from its environment (`apps/api`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Token signing secret |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Transcribe, Translate, Polly, S3 |
| `MANIFEST_API_KEY` | LLM used to parse voice orders |
| `AWS_TRANSCRIBE_BUCKET`, `AWS_VENDOR_DOCS_BUCKET`, `AWS_FARMER_PROFILE_BUCKET` | S3 buckets |
| `FAST2SMS_API_KEY`, `FAST2SMS_SENDER_ID`, `FAST2SMS_MESSAGE_ID` | OTP SMS |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH` | Push notifications |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins (localhost is allowed outside production) |
| `PORT` | API port |

The mobile app takes its API URL at build time: `npm run dev:app` reads `API_BASE_URL` from `apps/mobile/.env`.

## Deployment

Pushes to `main` run `.github/workflows/deploy-main.yml`, which builds the API and portal on the server over SSH, runs Prisma migrations, restarts the services and health-checks them. Android APKs are attached to [GitHub releases](https://github.com/hackerslash/agrisetu/releases).
