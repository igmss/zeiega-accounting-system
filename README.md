# AccuFinance

Manufacturing ERP system for Make-to-Order (MTO) garment production — "TEL U ASEGH".

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.9 (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | next-auth v4 (Credentials + JWT, 6 roles) |
| Database | Supabase PostgreSQL |
| Rate Limiting | Upstash Redis |
| Charts | Recharts |
| Validation | Zod + react-hook-form |
| Testing | Jest + ts-jest |

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in .env.local with your Supabase and Upstash credentials

# Run development server
npm run dev
# Open http://localhost:3000
```

## Environment Variables

See `.env.example` for the full list. Required:
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (optional, for rate limiting)

## Features

- **Job-Order Costing** — WIP tracking, material/labor/overhead cost accumulation
- **Overhead Allocation** — POHR calculation, absorption reporting, variance disposal
- **Variance Analysis** — 4-way overhead, material price/usage, labor rate/efficiency
- **IFRS 15 / ASC 606** — Percentage-of-completion revenue recognition, contract assets/liabilities
- **Financial Reports** — Balance Sheet, P&L, Cash Flow, Trial Balance, AR Aging, COGM, VAT
- **Inventory Management** — Raw materials, WIP, finished goods, movements tracking
- **Work Orders** — Production lifecycle, material issuance, labor application
- **Sales Orders** — Webhook integration with external website
- **Purchase Orders** — Vendor management, procurement workflow
- **Design Management** — Multi-size garment designs with BOM
- **Multi-Currency** — EGP default with currency conversion
- **Role-Based Access** — admin, accountant, warehouse, sales, production, viewer

## Scripts

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
npm run test     # Jest test suite (73 tests)
```

## Project Structure

```
app/               # Next.js App Router pages & API routes
  api/             # 34 API endpoints
components/        # React components (business + shadcn/ui)
  ui/              # 50+ shadcn/ui primitives
lib/               # Core business logic
  accounting/      # Chart of Accounts (60+ accounts)
  auth/            # Authentication (6 roles)
  services/        # 18 service modules
  types/           # TypeScript interfaces
  validation/      # Zod schemas
hooks/             # Custom React hooks
scripts/           # Utility scripts
__tests__/         # Jest test suites (6 files)
```

## Testing

```bash
npm run test                    # Run all tests
npm run test -- --coverage     # With coverage report
```

Coverage thresholds: 50% branches, functions, lines, statements.
