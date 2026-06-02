# AccuFinance — Zero-to-Hero Contributor Guide

> **Audience**: New engineers joining the project. Zero prior knowledge assumed.
> **Goal**: Go from clone to first PR in under an hour.

---

## 1. What This Project Does

**AccuFinance** is a full-stack manufacturing ERP (Enterprise Resource Planning) system for a garment factory called "TEL U ASEGH". It tracks every financial event — from buying fabric to shipping finished clothes — using double-entry accounting.

Think of it as the factory's financial brain: it knows what materials are in stock, what's being made, who owes money, who needs to be paid, and whether the business is profitable.

---

## 2. Prerequisites

### Required Tools

| Tool | Minimum Version | How to Check |
|------|----------------|--------------|
| **Node.js** | 18.x or later | `node --version` |
| **npm** | 9.x or later | `npm --version` |
| **Git** | 2.x | `git --version` |

### Required Accounts

| Service | Purpose | Sign Up |
|---------|---------|---------|
| **Supabase** | PostgreSQL database + authentication | [supabase.com](https://supabase.com) |
| **Upstash Redis** (optional) | Rate limiting | [upstash.com](https://upstash.com) |

### Knowledge Prerequisites

- TypeScript fundamentals (interfaces, enums, async/await)
- React basics (components, hooks, JSX)
- SQL basics (SELECT, INSERT, JOIN)
- Understanding of debit/credit in accounting (helpful but not required)

---

## 3. Environment Setup

### Step 1: Clone and Install

```bash
git clone <repository-url> accufinance
cd accufinance
npm install
```

**Expected output**: `npm install` completes without errors. You'll see something like `added 850 packages in 45s`.

### Step 2: Configure Environment Variables

```bash
cp .env.example .env.local
```

Now open `.env.local` in your editor and fill in these values:

```env
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_key_here
SUPABASE_SECRET_KEY=sb_secret_your_key_here

# NextAuth (REQUIRED)
NEXTAUTH_SECRET=run-openssl-rand-base64-32-to-generate-this
NEXTAUTH_URL=http://localhost:3000
MIDDLEWARE_SECRET=same-as-nextauth-secret

# Upstash Redis (OPTIONAL — rate limiting won't work without it)
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Webhooks (OPTIONAL — only needed for e-commerce integration)
WEBHOOK_SECRET=your-webhook-secret
CRON_SECRET=your-cron-secret
```

**Getting Supabase credentials:**
1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to Project Settings → API
3. Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
4. Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Copy `service_role` secret → `SUPABASE_SECRET_KEY`

**Generating NEXTAUTH_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 3: Set Up the Database

Apply the migrations from `supabase/migrations/` to your Supabase project. You can do this through the Supabase dashboard SQL editor:

1. Go to your Supabase project → SQL Editor
2. Run each `.sql` file from `supabase/migrations/` in order (00001 through 00011)

### Step 4: Create an Admin User

Run the seed script to create an initial admin user:

```bash
npx ts-node scripts/seed-users.ts
```

This creates `admin@zeiega.com` with a default password (check the script for details — change immediately after first login).

### Step 5: Start Development Server

```bash
npm run dev
```

**Expected output:**
```
  ▲ Next.js 14.2.16
  - Local:        http://localhost:3000
  ✓ Ready in 2.3s
```

Open `http://localhost:3000` in your browser. You should see the login page.

### Verification Checklist

- [ ] `http://localhost:3000/auth/login` shows the login form
- [ ] You can log in with the admin credentials
- [ ] Dashboard loads with cards (revenue, expenses, orders)
- [ ] Sidebar navigation shows all modules
- [ ] `http://localhost:3000/api/health` returns `{ "status": "ok" }`

---

## 4. Project Structure

```
accufinance/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, providers, theme)
│   ├── page.tsx                  # Dashboard homepage
│   ├── globals.css               # Global styles + Tailwind
│   │
│   ├── (module pages)/           # One folder per business module
│   │   ├── sales-orders/page.tsx
│   │   ├── work-orders/page.tsx
│   │   ├── inventory/page.tsx
│   │   ├── invoices/page.tsx
│   │   ├── designs/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── ...                   # 28 pages total
│   │
│   ├── api/                      # 85 API route handlers
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── sales-orders/route.ts
│   │   ├── work-orders/route.ts
│   │   ├── reports/
│   │   │   ├── income-statement/route.ts
│   │   │   ├── balance-sheet/route.ts
│   │   │   └── ...               # 16 report types
│   │   └── webhooks/
│   │       ├── order-status/route.ts
│   │       └── return-status/route.ts
│   │
│   └── auth/                     # Auth pages
│       ├── login/page.tsx
│       ├── logout/page.tsx
│       └── error/page.tsx
│
├── components/                   # React components
│   ├── dashboard-layout.tsx      # Main layout with sidebar + nav
│   ├── dashboard-overview.tsx    # Dashboard widgets
│   ├── sales-orders-list.tsx     # Sales order table
│   ├── work-orders-list.tsx      # Work order table
│   ├── inventory-management.tsx  # Inventory CRUD
│   ├── journal-entry-form.tsx    # Manual journal entry form
│   ├── financial-reports.tsx     # Report selector/viewer
│   ├── ...                       # 47 business components
│   │
│   └── ui/                       # 50 shadcn/ui primitives
│       ├── button.tsx            # Styled button
│       ├── dialog.tsx            # Modal dialog
│       ├── table.tsx             # Data table
│       ├── form.tsx              # Form wrapper (react-hook-form)
│       ├── card.tsx              # Card container
│       └── ...                   # See components/ui/ for full list
│
├── lib/                          # Core business logic
│   ├── supabase.ts               # DB client, TABLES constant, query helpers
│   ├── types.ts                  # Shared TypeScript interfaces
│   ├── utils.ts                  # Utility functions (cn, formatCurrency, etc.)
│   ├── logger.ts                 # Console logger wrapper
│   ├── cors.ts                   # CORS configuration
│   ├── actions.ts                # Server actions (deprecated, prefer API routes)
│   │
│   ├── accounting/               # Chart of Accounts
│   │   └── account-types.ts      # CHART_OF_ACCOUNTS, AccountType, ACCOUNT_CODES
│   │
│   ├── auth/                     # Authentication
│   │   ├── auth-options.ts       # next-auth configuration
│   │   ├── user-model.ts         # Re-exports from supabase-auth-service
│   │   ├── auth-helpers.ts       # Server-side auth utilities
│   │   └── index.ts              # Barrel export
│   │
│   ├── services/                 # 25 service modules (all static classes)
│   │   ├── enhanced-accounting-service.ts   # Core: double-entry creation
│   │   ├── financial-statements-service.ts  # Income/Balance/Cash Flow
│   │   ├── sales-accounting-service.ts      # Sales order → journal entries
│   │   ├── inventory-accounting-service.ts  # Stock movements + costing
│   │   ├── manufacturing-accounting-service.ts # WIP + production accounting
│   │   ├── overhead-service.ts             # POHR + overhead allocation
│   │   ├── variance-service.ts             # Variance analysis
│   │   ├── revenue-recognition-service.ts  # IFRS 15 POC
│   │   ├── work-order-service.ts           # Production lifecycle
│   │   ├── design-service.ts               # Garment design CRUD
│   │   ├── pricing-service.ts              # Cost-plus pricing
│   │   ├── purchase-order-service.ts       # Procurement
│   │   ├── vendor-service.ts               # Vendor management
│   │   ├── bom-service.ts                  # Bill of Materials
│   │   ├── budget-service.ts               # Budget planning
│   │   ├── currency-service.ts             # Multi-currency (EGP default)
│   │   ├── fiscal-period-service.ts        # Period management
│   │   ├── fiscal-close-service.ts         # Year-end close
│   │   ├── inventory-layer-service.ts      # FIFO cost layers
│   │   ├── journal-entry-service.ts        # Journal entry queries
│   │   ├── retention-service.ts            # Retention tracking
│   │   ├── size-cost-service.ts            # Multi-size cost management
│   │   ├── work-order-material-service.ts  # Material issuance
│   │   ├── order-item-design-service.ts    # Order-design linking
│   │   └── centralized-accounting-service.ts # Deprecated balance sync
│   │
│   ├── types/                    # Domain types
│   │   └── designs.ts            # Design/BOM type definitions
│   │
│   ├── utils/                    # Utilities
│   │   └── id-generator.ts       # Human-readable ID generation
│   │
│   └── validation/               # Shared Zod schemas
│       ├── schemas.ts            # Request/response validation
│       ├── helpers.ts            # Validation helpers
│       └── index.ts              # Barrel export
│
├── hooks/                        # Custom React hooks
│   ├── use-mobile.ts             # Mobile device detection
│   └── use-toast.ts              # Toast notification hook
│
├── __tests__/                    # Jest test suites
│   ├── services/                 # Service layer tests (6 files)
│   ├── lib/                      # Library tests (1 file)
│   └── validation/               # Schema tests (1 file)
│
├── supabase/migrations/          # Database migrations (11 SQL files)
├── scripts/                      # Utility scripts (seed users, test webhooks)
├── sdk/                          # TypeScript SDK package
├── public/                       # Static assets
│   └── openapi.json              # OpenAPI specification
│
├── middleware.ts                 # Rate limiting, auth, CORS, security headers
├── next.config.mjs               # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
├── jest.config.js                # Jest configuration
├── jest.setup.ts                 # Jest global mocks
├── tailwind.config.ts            # Tailwind CSS configuration
├── components.json               # shadcn/ui configuration
├── .env.example                  # Environment variable template
└── package.json                  # Dependencies and scripts
```

### Where to Find Things

| I need to... | Look in... |
|-------------|------------|
| Add a new page | `app/<module>/page.tsx` |
| Add an API endpoint | `app/api/<resource>/route.ts` |
| Add business logic | `lib/services/<service>.ts` |
| Change an account | `lib/accounting/account-types.ts` |
| Add a UI component | `components/<name>.tsx` |
| Add a shadcn component | `npx shadcn-ui@latest add <name>` |
| Add a database table | `supabase/migrations/` (new SQL file) |
| Add validation | `lib/validation/schemas.ts` |
| Add a test | `__tests__/<layer>/<name>.test.ts` |
| Change navigation labels | `lib/navigation-labels.ts` |
| Change permissions | `lib/supabase-auth-service.ts` → `ROLE_PERMISSIONS` |
| Run a migration | Supabase dashboard → SQL Editor |

---

## 5. Your First Task

Let's walk through adding a simple feature end-to-end: **adding a "notes" field to the Sales Order creation form**.

### Step 1: Understand the Data Flow

```
User fills form → react-hook-form validates (Zod) → POST /api/sales-orders
→ route.ts validates body → SalesAccountingService processes → Supabase INSERT
→ return response → UI shows success toast
```

### Step 2: Add the Database Column

Create a new migration file: `supabase/migrations/00012_add_sales_order_notes.sql`

```sql
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS notes TEXT;
```

Run this in Supabase SQL Editor.

### Step 3: Update the Zod Schema

In `lib/validation/schemas.ts`, find the sales order schema and add:

```typescript
export const createSalesOrderSchema = z.object({
  customerId: z.string().min(1),
  // ... existing fields ...
  notes: z.string().optional(),  // ADD THIS
})
```

### Step 4: Update the Component

In `components/sales-orders-list.tsx` (or the create dialog), find the form and add:

```tsx
<div className="space-y-2">
  <Label htmlFor="notes">Notes</Label>
  <Textarea id="notes" {...register("notes")} placeholder="Optional notes..." />
</div>
```

### Step 5: Test It

```bash
npm run dev
# Navigate to http://localhost:3000/sales-orders
# Create a new sales order with notes
# Verify the notes appear in the order details
```

### Step 6: Run Tests

```bash
npm run test
```

Make sure all 73 tests still pass.

---

## 6. Development Workflow

### Branch Strategy

```
main          ← Production-ready code
  └── feat/*  ← Feature branches (e.g., feat/add-inventory-reports)
  └── fix/*   ← Bug fixes (e.g., fix/journal-entry-validation)
  └── chore/* ← Maintenance (e.g., chore/update-dependencies)
```

### Commit Convention

Follow conventional commits:

```
feat(orders): add notes field to sales order creation
fix(inventory): correct FIFO layer calculation for partial shipments
chore(deps): update next-auth to v4.24.13
```

### PR Process

1. Create a feature branch from `main`
2. Make changes, run `npm run lint` and `npm run test`
3. Push branch and create PR
4. PR description should include:
   - What changed and why
   - Screenshots for UI changes
   - Test results
   - Breaking changes (if any)

### Before Every Commit

```bash
npm run lint    # ESLint — must pass
npm run test    # Jest — all 73 tests must pass
```

---

## 7. Running Tests

### All Tests

```bash
npm run test
```

**Expected output:**
```
Test Suites: 6 passed, 6 total
Tests:       73 passed, 73 total
Time:        12.345 s
```

### Single Test Suite

```bash
npm run test -- --testPathPattern=variance-service
```

### With Coverage

```bash
npm run test -- --coverage
```

This generates a `coverage/` directory with an HTML report.

### How Tests Work

- Tests run in Node environment (no browser)
- The Supabase client is **mocked** globally (`jest.setup.ts` provides the mock)
- Service methods are called directly — no HTTP server
- Tests use `ts-jest` to compile TypeScript

### Writing a Test

Tests live in `__tests__/services/`, `__tests__/lib/`, or `__tests__/validation/`. Example:

```typescript
// __tests__/services/my-new-service.test.ts
import { MyNewService } from "@/lib/services/my-new-service"

describe("MyNewService", () => {
  it("should calculate correctly", () => {
    const result = MyNewService.calculate(10, 20)
    expect(result).toBe(30)
  })
})
```

---

## 8. Debugging Guide

### Common Issues

#### "NEXT_PUBLIC_SUPABASE_URL is not set"

You forgot to copy `.env.example` to `.env.local` or missed a variable.

**Fix**: Check `.env.local` has all required variables. Restart `npm run dev`.

#### "Authentication required" on every API call

Your JWT session expired or the cookie is missing.

**Fix**: Log out and log back in. Clear cookies if needed.

#### "Type error: Cannot find module '@/lib/...'"

TypeScript path alias not resolving.

**Fix**: Check `tsconfig.json` has `"paths": { "@/*": ["./*"] }`. Restart TypeScript server in your editor.

#### Supabase returns empty results

You might be using the wrong Supabase client. The app has two:
- **Anon client** (`getSupabase()`) — limited by RLS policies, used for client reads
- **Service client** (`getServiceSupabase()`) — bypasses RLS, used server-side

If an API route returns empty data, check that the service is using `getServiceSupabase()` not `supabase`.

#### Journal entry won't save

The `createJournalEntry()` method validates that debits = credits. Check your amounts total to the same value.

#### Rate limit hit (429)

You're making too many requests. Wait 60 seconds or check if Redis is configured.

### Useful DevTools

- **React DevTools**: Inspect component state and props
- **Supabase Dashboard**: Run SQL queries directly, inspect table data
- **Browser Network tab**: See API requests and responses
- **Terminal**: Server logs appear in the `npm run dev` terminal

---

## 9. Key Concepts

### Double-Entry Accounting

Every financial transaction affects at least two accounts. Total debits must equal total credits.

```
Example: Customer pays $100 invoice
  DEBIT   1103  Bank - Main Account         $100  (asset increases)
  CREDIT  1110  Accounts Receivable          $100  (asset decreases)
```

In the code, this is enforced by `EnhancedAccountingService.createJournalEntry()` at `lib/services/enhanced-accounting-service.ts:230`.

### Journal Entry Types

The system recognizes these entry types (`lib/services/enhanced-accounting-service.ts:62-95`):

```typescript
enum JournalEntryType {
  MATERIAL_RECEIPT,       // Raw materials received from supplier
  MATERIAL_ISSUE_TO_WIP,  // Materials sent to production
  LABOR_APPLIED,          // Labor costs assigned to work orders
  OVERHEAD_APPLIED,       // Overhead allocated via POHR
  WIP_TO_FINISHED_GOODS,  // Production complete → inventory
  SALES_INVOICE,          // Customer billed
  SALES_COGS,             // Cost of goods recognized
  PAYMENT_RECEIVED,       // Customer payment
  PAYMENT_MADE,           // Supplier payment
  // ... more types
}
```

### POHR (Predetermined Overhead Rate)

Used to allocate indirect factory costs (rent, utilities, maintenance) to each work order. Calculated as:

```
POHR = Estimated Annual Overhead / Estimated Annual Activity Base
```

Applied overhead per work order = POHR × Actual activity (e.g., labor hours).

Handled by `OverheadService` at `lib/services/overhead-service.ts`.

### IFRS 15 Percentage-of-Completion

For long-running MTO orders, revenue is recognized as work progresses, not just at delivery:

```
Revenue = Total Contract Price × (Costs Incurred / Total Estimated Costs)
```

Handled by `RevenueRecognitionService` at `lib/services/revenue-recognition-service.ts`.

### Chart of Accounts Code Ranges

| Range | Category | Example |
|-------|----------|---------|
| 1xxx  | Assets | 1101 Cash, 1201 Raw Materials, 1210 WIP |
| 2xxx  | Liabilities | 2101 Accounts Payable, 2110 VAT Payable |
| 3xxx  | Equity | 3011 Partner Capital, 3100 Retained Earnings |
| 4xxx  | Revenue | 4003 MTO Orders, 4091 Sales Returns |
| 5xxx  | COGS | 5001 Raw Materials Used, 5301 COGS |
| 6xxx  | Expenses | 6001 Office Salaries, 6101 Marketing |
| 7xxx  | Other | Other income/expense |

### WIP Sub-Accounts

Work in Progress is tracked at a granular level:

| Account | Code | Purpose |
|---------|------|---------|
| WIP - Materials | 1710 | Raw materials currently in production |
| WIP - Labor | 1711 | Direct labor costs in production |
| WIP - Overhead | 1712 | Applied overhead in production |
| WIP - Outside Processing | 1713 | Subcontracted work costs |

All roll up to **WIP Control (1210)**.

---

## 10. Code Patterns

### Pattern 1: Adding a New API Endpoint

```typescript
// app/api/my-resource/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/auth-options"
import { MyService } from "@/lib/services/my-service"
import { mySchema } from "@/lib/validation/schemas"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const data = await MyService.getAll()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const validated = mySchema.parse(body)  // Zod validation
    const result = await MyService.create(validated)
    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
```

### Pattern 2: Creating a Service Method

```typescript
// lib/services/my-service.ts
import { db, TABLES, getServiceSupabase } from "../supabase"
import type { MyType } from "../types"

export class MyService {
  static async getAll(): Promise<MyType[]> {
    const client = getServiceSupabase()
    const { data, error } = await client
      .from(TABLES.MY_TABLE)
      .select("*")
      .order("created_at", { ascending: false })

    if (error) throw new Error(`Failed to fetch: ${error.message}`)
    return data || []
  }

  static async create(input: CreateInput): Promise<MyType> {
    const client = getServiceSupabase()
    const { data, error } = await client
      .from(TABLES.MY_TABLE)
      .insert(input)
      .select()
      .single()

    if (error) throw new Error(`Failed to create: ${error.message}`)
    return data
  }
}
```

### Pattern 3: Adding a Page with the Dashboard Layout

```tsx
// app/my-module/page.tsx
"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function MyModulePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">My Module</h1>
        <Card>
          <CardHeader>
            <CardTitle>Data Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Your content here */}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
```

### Pattern 4: Creating a Journal Entry

```typescript
import { EnhancedAccountingService, JournalEntryType } from "@/lib/services/enhanced-accounting-service"

await EnhancedAccountingService.createJournalEntry({
  date: new Date().toISOString(),
  reference: "INV-2025-001",
  description: "Invoice for Order #ORD-001",
  entryType: JournalEntryType.SALES_INVOICE,
  lines: [
    {
      accountCode: "1110",                    // Accounts Receivable
      accountName: "Accounts Receivable - Customers",
      debit: 1000,
      credit: 0,
      customerId: "cust-123",
    },
    {
      accountCode: "4003",                    // Custom MTO Orders
      accountName: "Custom MTO Orders",
      debit: 0,
      credit: 1000,
    },
  ],
  createdBy: "user-456",
})
```

### Pattern 5: Using shadcn/ui Components with react-hook-form

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  quantity: z.number().min(1, "Must be at least 1"),
})

type FormValues = z.infer<typeof formSchema>

export function MyForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", quantity: 1 },
  })

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/my-resource", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
    const data = await res.json()
    if (data.success) {
      // Handle success
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  )
}
```

---

## 11. Common Pitfalls

### Pitfall 1: Using the Wrong Supabase Client

```typescript
// WRONG — anon client may be blocked by RLS policies
import { supabase } from "@/lib/supabase"
const { data } = await supabase.from("sales_orders").select("*")

// CORRECT — use service client in API routes and services
import { getServiceSupabase } from "@/lib/supabase"
const client = getServiceSupabase()
const { data } = await client.from("sales_orders").select("*")
```

### Pitfall 2: Forgetting to Balance Journal Entries

Every `createJournalEntry()` call must have equal total debits and credits. The method will throw if they don't balance.

```typescript
// WRONG — debits (100) ≠ credits (0)
lines: [
  { accountCode: "1103", debit: 100, credit: 0 },
  { accountCode: "4003", debit: 0, credit: 0 },  // forgot amount!
]

// CORRECT — debits (100) = credits (100)
lines: [
  { accountCode: "1103", debit: 100, credit: 0 },
  { accountCode: "4003", debit: 0, credit: 100 },
]
```

### Pitfall 3: Hard-coding Account Codes

```typescript
// WRONG — magic strings
{ accountCode: "1103", accountName: "Bank", debit: 100, credit: 0 }

// CORRECT — use ACCOUNT_CODES
import { ACCOUNT_CODES } from "@/lib/accounting/account-types"
{ accountCode: ACCOUNT_CODES.BANK_MAIN, accountName: "Bank - Main Account", debit: 100, credit: 0 }
```

### Pitfall 4: Not Using the TABLES Constant

```typescript
// WRONG — string table name
.from("sales_orders")

// CORRECT — type-safe constant
.from(TABLES.SALES_ORDERS)
```

### Pitfall 5: Client-side Financial Calculations

Financial data must be derived server-side from journal entries. Never calculate account balances or report figures in React components.

```typescript
// WRONG — calculating balance on client
const balance = journalLines.reduce((sum, l) => sum + l.debit - l.credit, 0)

// CORRECT — fetch pre-calculated data from API
const { data } = await fetch("/api/reports/trial-balance").then(r => r.json())
```

### Pitfall 6: Skipping Zod Validation

API routes must validate request bodies. Never trust client input:

```typescript
// WRONG — no validation
const body = await request.json()
await MyService.create(body)

// CORRECT — Zod validation before processing
const body = await request.json()
const validated = mySchema.parse(body)  // throws ZodError if invalid
await MyService.create(validated)
```

### Pitfall 7: Missing Service Role Key

If `SUPABASE_SECRET_KEY` is not set, `getServiceSupabase()` throws at startup. This MUST be in `.env.local`, not just `.env.example`.

---

## 12. Where to Get Help

### Project Documentation

| Resource | Location |
|----------|----------|
| README | `README.md` |
| Architecture Guide | `CLAUDE.md` |
| Principal Onboarding | `wiki/principal-onboarding.md` |
| This Guide | `wiki/contributor-guide.md` |
| API Docs | `http://localhost:3000/api-docs` or `public/openapi.json` |
| Feature Docs | Root `.md` files (e.g., `WEBHOOK_INTEGRATION.md`, `DESIGN_MANAGEMENT_SYSTEM.md`) |

### Code Navigation

- **Chart of Accounts**: `lib/accounting/account-types.ts`
- **All table names**: `lib/supabase.ts` → `TABLES` constant
- **Database schema**: `supabase/migrations/` (run in order)
- **Test examples**: `__tests__/services/*.test.ts`

### Communication

- Team chat: [your-team-channel]
- Issue tracker: GitHub Issues
- Documentation requests: Create an issue with label `documentation`

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **AccuFinance** | The name of this ERP system |
| **API route** | A server-side endpoint at `app/api/*/route.ts` |
| **App Router** | Next.js 14's file-based routing system (`app/` directory) |
| **BOM** | Bill of Materials — list of materials needed for a garment design |
| **Chart of Accounts** | The master list of all financial accounts (95 accounts in this system) |
| **COGM** | Cost of Goods Manufactured — total production cost of completed goods |
| **COGS** | Cost of Goods Sold — cost recognized when product is shipped/sold |
| **Contra account** | An account that reduces another account (e.g., Accumulated Depreciation reduces Fixed Assets) |
| **Credit** | Right side of a journal entry; increases liabilities, equity, revenue |
| **Debit** | Left side of a journal entry; increases assets, expenses |
| **Double-entry** | Every transaction affects at least two accounts; debits must equal credits |
| **ERP** | Enterprise Resource Planning — integrated business management software |
| **FIFO** | First-In, First-Out — inventory costing method |
| **IFRS 15** | International accounting standard for revenue recognition |
| **Journal Entry** | A record of a financial transaction with debits and credits |
| **MTO** | Make-to-Order — producing goods only after receiving a customer order |
| **POHR** | Predetermined Overhead Rate — used to allocate indirect costs to products |
| **RBAC** | Role-Based Access Control — permissions based on user role |
| **RLS** | Row-Level Security — PostgreSQL feature for per-row access control |
| **Service role** | Supabase key that bypasses RLS (used server-side only) |
| **TEL U ASEGH** | The garment factory using this system (Arabic: "تل الأصيغ") |
| **WIP** | Work in Progress — partially completed goods in production |
| **Zod** | TypeScript-first schema validation library |

---

## 14. Quick Reference Card

### Commands

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build
npm run lint             # Run ESLint
npm run test             # Run all tests (73 tests)
npm run test -- --testPathPattern=name   # Run specific test suite
npm run test -- --coverage              # With coverage report
npx shadcn-ui@latest add button         # Add a shadcn/ui component
```

### Key Files

```
lib/accounting/account-types.ts   # All accounts + account codes
lib/supabase.ts                   # DB client + TABLES constant
lib/supabase-auth-service.ts      # User model + permissions
lib/validation/schemas.ts         # Zod validation schemas
lib/services/enhanced-accounting-service.ts  # Core accounting logic
middleware.ts                     # Auth + rate limiting + security
```

### Account Code Quick Reference

| Code | Account | Normal Balance |
|------|---------|---------------|
| 1101 | Cash on Hand | Debit |
| 1103 | Bank - Main | Debit |
| 1110 | Accounts Receivable | Debit |
| 1201 | Raw Materials - Fabric | Debit |
| 1210 | WIP - Control | Debit |
| 1220 | Finished Goods | Debit |
| 2101 | Accounts Payable | Credit |
| 2110 | VAT Payable | Credit |
| 3011 | Capital - Ahmed (60%) | Credit |
| 3100 | Retained Earnings | Credit |
| 4003 | Custom MTO Orders | Credit |
| 5001 | Raw Materials Used | Debit |
| 5004 | Manufacturing Overhead | Debit |
| 5301 | Cost of Goods Sold | Debit |

### Key Imports

```typescript
// Database
import { db, TABLES, getServiceSupabase, getSupabase, batchInsert } from "@/lib/supabase"

// Accounts
import { CHART_OF_ACCOUNTS, ACCOUNT_CODES, AccountType, getAccountName } from "@/lib/accounting/account-types"

// Auth
import { hasPermission, UserRole } from "@/lib/auth/user-model"
import { authOptions } from "@/lib/auth/auth-options"
import { getServerSession } from "next-auth"

// Services
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"
import { FinancialStatementsService } from "@/lib/services/financial-statements-service"

// UI
import { cn, formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DashboardLayout } from "@/components/dashboard-layout"

// Validation
import { someSchema } from "@/lib/validation/schemas"
```

### New Feature Checklist

- [ ] Database migration created (`supabase/migrations/`)
- [ ] Zod schema updated (`lib/validation/schemas.ts`)
- [ ] Service method added (`lib/services/my-service.ts`)
- [ ] API route created/updated (`app/api/my-resource/route.ts`)
- [ ] Page/component updated (`app/my-module/page.tsx`, `components/my-component.tsx`)
- [ ] `TABLES` constant updated if new table (`lib/supabase.ts`)
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (73 tests)
- [ ] Manual testing completed on `localhost:3000`
