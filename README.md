# AgriSetu

AgriSetu is a monorepo for a farmer and vendor commerce platform. It includes a farmer mobile app, a vendor web dashboard, and a shared backend API.

## Apps

- `apps/mobile`: Flutter app for farmers
- `apps/web`: Next.js dashboard for vendors
- `apps/api`: Express + Prisma backend

## Packages

- `packages/api-client`: shared API client
- `packages/ui`: shared UI components
- `packages/eslint-config`: shared lint config
- `packages/typescript-config`: shared TypeScript config

## Common commands

```sh
npm install
npm run dev:all
npm run dev:mobile
npm run build
npm run lint
npm run check-types
```

## Database

```sh
npm run db:generate
npm run db:migrate
```

## Mobile

```sh
npm run mobile:get
npm run mobile:test
npm run mobile:build:android
```

## Notes

- Node.js `18+` is required.
- Flutter is required for mobile development.
- Configure environment variables for API, database, storage, and notifications before running the full stack.