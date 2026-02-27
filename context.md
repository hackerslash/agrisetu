# AgriSetu — Project Context

AgriSetu is an **agricultural collective-buying platform for rural Indian farmers**. Farmers pool demand for agricultural inputs (seeds, fertilizers, pesticides) into "clusters," vendors bid on those clusters, farmers vote, and the winning vendor fulfills the bulk order — enabling 10–25% cost savings through collective purchasing power.

---

## Monorepo Structure

```
agrisetu/                          — Turborepo monorepo (npm workspaces)
├── apps/
│   ├── api/                       — Node.js/Express REST API (port 3001)
│   ├── web/                       — Next.js 16 vendor web portal (port 3000)
│   ├── mobile/                    — Flutter farmer mobile app (iOS/Android)
│   └── docs/                      — Minimal docs app (Turborepo default)
└── packages/
    ├── api-client/                — Shared TypeScript axios API client (used by web)
    ├── ui/                        — Shared React component primitives
    ├── eslint-config/             — Shared ESLint config
    └── typescript-config/         — Shared tsconfig presets
```

**Key scripts (root):**

- `npm run dev` — start all apps
- `npm run dev:api` — API only
- `npm run dev:web` — vendor web only
- `npm run dev:mobile` — Flutter app
- `npm run db:*` — Prisma commands (delegated to `apps/api`)

---

## API Backend (`apps/api/`)

**Stack:** Node.js ≥18, Express 4, TypeScript, Prisma ORM, PostgreSQL, JWT (30-day), bcryptjs, zod

**Environment (`.env`):**

```
DATABASE_URL="postgresql://agrisetu:agrisetu_dev@localhost:5432/agrisetu"
JWT_SECRET="agrisetu_secret_dev"
PORT=3001
```

**Source layout:**

```
apps/api/src/
├── index.ts              — App entry, middleware, route registration
├── routes/
│   ├── auth.ts           — Farmer & vendor auth routes
│   ├── farmer.ts         — All farmer-facing protected routes
│   └── vendor.ts         — All vendor-facing protected routes
├── middleware/
│   └── auth.ts           — JWT auth + role guards (authenticate, requireFarmer, requireVendor)
├── lib/
│   ├── jwt.ts            — signToken / verifyToken
│   ├── prisma.ts         — Singleton PrismaClient
│   └── response.ts       — success() / error() response helpers
└── services/
    └── cluster.ts        — autoAssignCluster + checkAndTransitionPayment
```

**Auth:**

- Farmers: phone + OTP (mock OTP hardcoded as `"123456"`)
- Vendors: email + bcrypt password, 3-step registration wizard
- JWT token role: `{ id, role: "farmer" | "vendor" }`

**Endpoints summary:**

| Prefix                  | Router             | Protection        |
| ----------------------- | ------------------ | ----------------- |
| `/api/v1/auth/farmer/*` | `routes/auth.ts`   | None / Farmer JWT |
| `/api/v1/auth/vendor/*` | `routes/auth.ts`   | None / Vendor JWT |
| `/api/v1/farmer/*`      | `routes/farmer.ts` | Farmer JWT        |
| `/api/v1/vendor/*`      | `routes/vendor.ts` | Vendor JWT        |
| `GET /health`           | inline             | None              |

**Farmer routes (`/api/v1/farmer/`):**

- `GET/PATCH /profile`
- `POST /orders` — creates order, auto-assigns to cluster
- `GET /orders`, `GET /orders/:id`
- `GET /clusters`, `GET /clusters/:id`
- `POST /clusters/:id/join`
- `POST /clusters/:id/vote`
- `POST /payments/initiate`, `POST /payments/confirm`, `GET /payments`
- `GET /delivery/:clusterId`, `POST /delivery/:clusterId/confirm`
- `POST /ratings`
- `GET /mandi-prices` — mock commodity prices
- `GET /dashboard`

**Vendor routes (`/api/v1/vendor/`):**

- `GET/PATCH /profile`, `PATCH /profile/password`
- `GET/POST /gigs`, `PATCH/DELETE /gigs/:id`
- `GET /clusters`, `POST /clusters/:id/bid`
- `GET /bids`
- `GET /orders`, `GET /orders/:id`
- `PATCH /orders/:id/accept`, `POST /orders/:id/reject`
- `PATCH /orders/:id/dispatch`, `PATCH /orders/:id/deliver`
- `GET /payments`, `GET /payments/summary`
- `GET /analytics`

**Key business logic (`services/cluster.ts`):**

- `autoAssignCluster()` — finds/creates a FORMING cluster by (cropName, unit, district); transitions to VOTING when `currentQuantity >= targetQuantity` (default 1000)
- `checkAndTransitionPayment()` — when all cluster members have paid, transitions cluster to DISPATCHED and creates a 5-step Delivery record
- **Voting** — when all members vote, winning bid (most votes) wins; cluster → PAYMENT

**Database models (PostgreSQL + Prisma):**

| Model            | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `Farmer`         | Farmer accounts (phone unique)                        |
| `Vendor`         | Vendor accounts (email unique, bcrypt password)       |
| `VendorDocument` | KYC docs (PAN, GST, QUALITY_CERT)                     |
| `Gig`            | Vendor product listings (DRAFT/PUBLISHED/CLOSED)      |
| `Order`          | Individual farmer orders (8 status values)            |
| `Cluster`        | Collective buying groups (6 status values)            |
| `ClusterMember`  | Farmer ↔ Cluster membership (hasPaid, quantity)       |
| `VendorBid`      | Vendor bids on clusters (votes count)                 |
| `VendorVote`     | One vote per farmer per cluster (unique constraint)   |
| `Payment`        | UPI payment records (PENDING/SUCCESS/FAILED/REFUNDED) |
| `Delivery`       | Delivery tracking (5-step JSON, confirmedAt)          |
| `Rating`         | Post-delivery ratings (1–5 stars, tags[], comment)    |

**Cluster status flow:** `FORMING → VOTING → PAYMENT → DISPATCHED → COMPLETED / FAILED`

---

## Vendor Web Portal (`apps/web/`)

**Stack:** Next.js 16 (App Router), React 19, TypeScript, TailwindCSS v4, TanStack Query v5, react-hook-form + zod, Recharts, lucide-react, `@repo/api-client`

**Environment (`.env.local`):**

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

**App Router pages:**

```
app/
├── layout.tsx                — Root layout (fonts, QueryClientProvider)
├── page.tsx                  — Redirects to /dashboard or /login
├── login/                    — Email + password login
├── register/                 — 3-step vendor registration wizard
├── dashboard/                — Metrics, revenue chart, recent/urgent orders
├── gigs/                     — CRUD gig management (tabbed by status)
├── orders/                   — Order fulfillment (accept/reject/dispatch/deliver)
│   └── [id]/                 — Order detail + cluster members + actions
├── payments/                 — Escrow summary + payment table
├── analytics/                — Period-filtered revenue/product charts + ratings
└── settings/                 — Business profile, documents, password, notifications
```

**Components:**

```
components/
├── Providers.tsx             — TanStack QueryClientProvider (staleTime 30s)
├── layout/
│   ├── AppLayout.tsx         — Sidebar + TopBar shell
│   ├── Sidebar.tsx           — Nav links + vendor name badge
│   └── TopBar.tsx            — Page title + notifications
└── ui/
    ├── Card.tsx              — MetricCard component
    └── StatusBadge.tsx       — Color-coded status pill
```

**Auth:** JWT stored in `localStorage`. Axios interceptor attaches `Bearer` token. 401 response redirects to `/login`.

---

## Farmer Mobile App (`apps/mobile/`)

**Stack:** Flutter/Dart SDK ^3.5.0, Riverpod 2.x (state), go_router (navigation), Dio (HTTP), FlutterSecureStorage (JWT), google_fonts, shimmer, pinput

**API base URL:** `http://192.168.0.103:3001/api/v1` (LAN device). Commented alternatives: `10.0.2.2` (Android emulator), `localhost` (iOS simulator).

**Source layout:**

```
lib/
├── main.dart                        — App entry, ProviderScope, portrait lock
├── core/
│   ├── api/api_client.dart          — Singleton Dio client, JWT interceptor, all API methods
│   ├── constants/app_constants.dart — Base URL, storage keys, UPI apps, languages, rating tags
│   ├── models/
│   │   ├── farmer_model.dart        — Farmer model + profileCompleteness
│   │   └── order_model.dart         — Order, Cluster, VendorBid, Payment, Delivery, Rating, TrackingStep
│   ├── providers/auth_provider.dart — AuthNotifier (AsyncNotifier), AuthState
│   └── utils/router.dart            — GoRouter config, redirect guards, all named routes
├── features/
│   ├── auth/screens/                — landing, phone_login, otp_verify, onboarding
│   ├── home/screens/                — home dashboard (stats, clusters, mandi prices)
│   ├── orders/screens/              — order_history, order_details
│   ├── clusters/screens/            — available_clusters, cluster_detail, cluster_empty
│   ├── payment/screens/             — payment (UPI + countdown), payment_confirmed, payment_failed
│   ├── delivery/screens/            — delivery_tracking (5-step), order_delivered (rating)
│   ├── profile/screens/             — profile (view/edit, language, logout)
│   └── voice/screens/               — voice_order (mocked speech-to-order)
└── shared/
    ├── theme/app_theme.dart         — AppColors, AppTextStyles, AppTheme.light
    └── widgets/                     — main_scaffold (bottom nav), app_button, app_header,
                                       progress_bar, status_badge
```

**Navigation (GoRouter):** ShellRoute with persistent bottom nav. Redirect guards:

- Unauthenticated → `/landing`
- Authenticated + no profile → `/onboarding`
- Authenticated + complete profile → `/home`

**State management (Riverpod):**

- `authProvider` — `AsyncNotifierProvider<AuthNotifier, AuthState>`, persists farmer JSON to SharedPreferences
- `currentFarmerProvider` — `Provider<Farmer?>` derived from authProvider
- `apiClientProvider` — singleton Dio client
- Feature-level `FutureProvider`s defined inline in screens

**Languages supported:** Hindi, Kannada, Tamil, Bengali, Telugu, English (stored in SharedPreferences)

**Voice order:** Currently mocked — shows microphone UI with pulse animation, hardcoded Hindi transcription, extracted order fields. Real STT/NLP not yet implemented.

---

## Shared Package: `@repo/api-client`

Typed axios API client used by the vendor web app.

```
packages/api-client/src/
├── client.ts      — Singleton axios instance, configureApiClient(), 401 redirect
├── types.ts       — Full TypeScript interfaces mirroring Prisma schema
└── api/
    ├── auth.ts    — registerStep1/2/3, login, getMe
    ├── vendor.ts  — All vendor API methods
    └── farmer.ts  — Farmer API methods
```

Exports: `authApi`, `vendorApi`, `farmerApi` (named exports from `src/index.ts`).

---

## End-to-End Flow

```
Farmer Mobile (Flutter)               Vendor Web (Next.js)
       │                                     │
  Dio + JWT                         axios + JWT (localStorage)
       │                                     │
  /api/v1/farmer/*               /api/v1/vendor/*
  /api/v1/auth/farmer/*          /api/v1/auth/vendor/*
       │                                     │
       └──────────── Express API (3001) ─────┘
                           │
                      Prisma ORM
                           │
                      PostgreSQL
```

1. Farmer places order → `autoAssignCluster` puts them into a FORMING cluster
2. Vendor views matching clusters → places a bid → cluster → VOTING
3. Farmers vote → winning vendor selected → cluster → PAYMENT
4. Farmers pay via UPI → all paid → Delivery record created → cluster → DISPATCHED
5. Vendor dispatches → tracking steps updated → farmers see "In Transit"
6. Farmer confirms delivery → cluster → COMPLETED → escrow released to vendor
7. Farmer rates vendor → vendor analytics updated

---

## Visual Identity (both apps)

| Token              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| Primary color      | `#2C5F2D` (dark green)                                  |
| Background         | `#F7F5F0` (warm off-white)                              |
| Heading font       | Plus Jakarta Sans                                       |
| Body font          | Inter                                                   |
| Status terminology | FORMING, VOTING, PAYMENT, DISPATCHED, COMPLETED, FAILED |
