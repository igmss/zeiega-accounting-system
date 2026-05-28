# AccuFinance SDK

Type-safe JavaScript/TypeScript SDK for the AccuFinance ERP API.

```bash
npm install @zeiega/accufinance-sdk
```

## Quick Start

```ts
import { createAccuFinanceClient } from "@zeiega/accufinance-sdk"

const api = createAccuFinanceClient({
  baseUrl: "https://your-instance.vercel.app",
  apiKey: "your-admin-token",
})

// Full autocomplete on every endpoint, method, body, and response
const { data, error } = await api.GET("/api/dashboard")
console.log(data?.kpiData)

const customers = await api.GET("/api/customers", {
  params: { query: { limit: 5 } },
})

const { data: pnl } = await api.GET("/api/reports/profit-loss", {
  params: { query: { from: "2026-01-01", to: "2026-05-28" } },
})

// Create a journal entry (double-entry accounting)
await api.POST("/api/journal-entries", {
  body: {
    date: "2026-05-28",
    memo: "Office supplies",
    entries: [
      { account_id: "6001", account_name: "Office Supplies", description: "Pens", debit: 50, credit: 0 },
      { account_id: "1101", account_name: "Cash", description: "Pens", debit: 0, credit: 50 },
    ],
  },
})
```

## Features

- **Full type safety** — autocomplete for every endpoint, parameter, body, and response
- **Tree-shakeable** — only imports what you use
- **Runtime agnostic** — works in Node.js, Deno, Bun, and browsers
- **Zero config** — just provide your API key

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `baseUrl` | `string` (**required**) | Your AccuFinance API server URL |
| `apiKey` | `string` (**required**) | Admin token from API_SECRET or API_ADMIN_TOKENS |

## Token Types

| Scope | Env Var | Access |
|-------|---------|--------|
| Admin | `API_SECRET` or `API_ADMIN_TOKENS` | Full read/write |
| Read-only | `API_READ_TOKENS` | GET requests only (403 on writes) |

Generate a secure token:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then set it in Vercel: **Settings → Environment Variables**

## Domain Changes

If your domain changes, update the `baseUrl` in your SDK config. The OpenAPI spec at `/openapi.json` auto-detects the server URL at runtime.

## Available Endpoints

| Domain | Endpoints |
|--------|----------|
| Dashboard | `GET /api/dashboard` |
| Customers | `GET/POST/PUT/DELETE /api/customers` |
| Inventory | `GET/POST/PUT/DELETE /api/inventory`, `/adjust`, `/sync-balances`, `/items` |
| Sales | `GET/POST/PUT /api/sales-orders`, `/sync` |
| Invoices | `GET/POST /api/invoices` |
| Payments | `GET/POST /api/payments` |
| Work Orders | 15+ endpoints: issue materials, complete, profitability, cost updates |
| Designs | 10+ endpoints with multi-size costing, material requirements |
| BOM | `GET/POST/PUT/DELETE /api/bom` |
| Vendors | `GET/POST/PUT/DELETE /api/vendors` |
| Purchase Orders | `GET/POST /api/purchase-orders`, actions via PUT |
| Accounting | Chart of accounts, journal entries, expenses, assets, liabilities, VAT |
| Reports | P&L, Balance Sheet, Cash Flow, Trial Balance, AR Aging, COGM, VAT |
| Overhead | POHR config and allocation |
| Contracts | IFRS 15 revenue recognition |
| Webhooks | Order status, return status |

Full spec: [openapi.json](https://zeiega-accounting-system.vercel.app/openapi.json)

## Regenerate Types

```bash
npm run generate-types
```
