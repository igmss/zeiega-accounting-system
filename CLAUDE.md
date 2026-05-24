# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Run all Jest tests (73 tests across 6 suites)
npm run test -- --coverage          # With coverage report (50% thresholds)
npm run test -- --testPathPattern=overhead  # Run a single test file by pattern
```

## Architecture Overview

**AccuFinance** is a Next.js 14 App Router manufacturing ERP for a garment company ("TEL U ASEGH") specialising in Make-to-Order (MTO) production.

### Data Layer

- **Firebase Firestore** via Admin SDK (`lib/firebase.ts`). All collection names use an `acc_` prefix (e.g. `acc_journal_entries`, `acc_sales_orders`). Two external collections share the same database without the prefix: `orders` (website orders) and `products`.
- There is **no ORM**. All DB access goes through service classes in `lib/services/` that import `{ db, COLLECTIONS }` from `lib/firebase.ts`.
- Account balances are **not cached**. Financial reports derive balances live from journal entries by scanning `COLLECTIONS.JOURNAL_ENTRIES` filtered by `account_ids` array-contains. `CentralizedAccountingService.syncAccountBalance` is deprecated.

### Chart of Accounts

The authoritative account definitions live entirely in `lib/accounting/account-types.ts` as the `CHART_OF_ACCOUNTS` constant (static TypeScript, not Firestore). Account codes follow a numeric scheme:

| Range | Category |
|-------|----------|
| 1xxx  | Assets (cash 1101–1107, AR 1110–1121, inventory 1201–1230, fixed assets 1301–1307) |
| 2xxx  | Liabilities (payables 2101–2160, loans 2201–2210) |
| 3xxx  | Equity (partner capitals 3011/3012/3013 at 60%/25%/15%, retained earnings 3100) |
| 4xxx  | Revenue (sales 4001–4012, contra-revenue 4090–4091) |
| 5xxx  | COGS (materials 5001, labor 5002, overhead 5004–5008, COGS summary 5301) |
| 6xxx  | Operating expenses |
| 7xxx  | Other income/expense |

Use `ACCOUNT_CODES` (also in `account-types.ts`) for named constant lookups instead of hard-coding strings. WIP sub-accounts are 1710 (materials), 1711 (labor), 1712 (overhead).

### Service Layer (`lib/services/`)

Each module is a static class:

- **`EnhancedAccountingService`** — core double-entry journal entry creation; all financial events (material receipt, WIP transfer, COGS recognition, invoicing, payment) call this.
- **`FinancialStatementsService`** — derives Income Statement, Balance Sheet, Cash Flow by aggregating journal entries live.
- **`OverheadService`** — POHR calculation and overhead allocation to work orders.
- **`VarianceService`** — 4-way overhead variance, material price/usage, labor rate/efficiency variances.
- **`RevenueRecognitionService`** — IFRS 15 / ASC 606 percentage-of-completion.
- **`WorkOrderService`** — work order lifecycle; integrates with `DesignService` for cost estimation.
- **`DesignService`** — garment design CRUD with multi-size BOM.
- **`PricingService`** — cost-plus pricing from design BOM.
- **`FiscalPeriodService`** / **`FiscalCloseService`** — period management and year-end close.

### Authentication & Middleware

- `next-auth` v4 with Credentials provider. JWT sessions. 6 roles: `admin`, `accountant`, `warehouse`, `sales`, `production`, `viewer` (defined in `lib/auth/user-model.ts`).
- Users are stored in Firestore `users` collection, not a static file.
- `middleware.ts` runs on every non-static request: rate limiting (Upstash Redis, 100 req/60s sliding window), JWT auth check, CORS, security headers. `/api/webhooks` and `/api/health` are public; all other `/api/*` routes are protected.

### API Routes (`app/api/`)

34 endpoints as Next.js route handlers. Each folder has a `route.ts`. Webhooks (`/api/webhooks`) have their own secret-based auth and are the integration point for the external e-commerce website sending orders.

### Frontend

- Pages under `app/` use the App Router. Most module pages wrap their content in a `<DashboardLayout>` component from `components/dashboard-layout.tsx`.
- Business UI components are in `components/` (not in `components/ui/`). `components/ui/` contains shadcn/ui primitives only.
- Zod schemas in `lib/validation/` are shared between forms (`react-hook-form` + `@hookform/resolvers/zod`) and API route validation.

### Testing

Tests live in `__tests__/services/` and `__tests__/validation/`. They use `ts-jest` and run in the Node environment. Firebase is mocked in tests — do not import `lib/firebase.ts` directly in test files.

Run a single test suite:
```bash
npm run test -- --testPathPattern=variance-service
```
