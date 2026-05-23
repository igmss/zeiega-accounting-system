# Findings: MTO/ETO Accounting System Audit

## Key Files
- `lib/services/enhanced-accounting-service.ts` (1583 lines) - Core accounting engine
- `lib/accounting/account-types.ts` (1747 lines) - Complete COA with 100+ accounts
- `lib/services/financial-statements-service.ts` (507 lines) - FS generation
- `lib/services/work-order-service.ts` (472 lines) - Production management
- `lib/services/design-service.ts` (540 lines) - Design catalog
- `lib/services/bom-service.ts` (386 lines) - BOM management
- `lib/types.ts` (152 lines) - Core interfaces
- `lib/validation/schemas.ts` (223 lines) - Zod schemas

## Data Flow
Website Orders → Webhook → Sales Orders → Work Orders → Material/Labor/OH → WIP → Finished Goods → Sales → COGS

## Account Code Mapping
- Cash/Bank: 1101-1107
- Receivables: 1110-1121
- Inventory: 1201-1240
- WIP: 1210 + 1710-1712 (children)
- Finished Goods: 1220
- Fixed Assets: 1301-1307
- Acc Dep: 1351-1354, 1491
- AP: 2101-2102
- Customer Deposits: 2105
- VAT: 2110-2112
- Wages Payable: 2120
- Accrued: 2140
- Tax Payable: 2130
- Loans: 2201, 2210
- Partner Capital: 3011-3013
- Drawings: 3021-3023
- Retained Earnings: 3100
- Current Year P&L: 3200
- Revenue: 4001-4020
- Contra Revenue: 4090-4091
- COGS: 5001-5008, 5301
- OpEx: 6001-6208
- Other: 7001-7003

## COGS Account Note
5001 = Raw Materials Used (component)
5301 = Cost of Goods Sold (aggregate, the one that should be used for sales entries)

## Journal Entry Collection
Stored in `acc_journal_entries` with `account_ids` array for indexing.
Structure: { id, date, type, reference_doc, entries[], account_ids[], total_debits, total_credits }

## Firestore Collections (all prefixed acc_):
acc_customers, acc_chart_of_accounts, acc_journal_entries, acc_sales_orders,
acc_work_orders, acc_inventory_items, acc_inventory_movements, acc_invoices,
acc_payments, acc_assets, acc_designs, acc_bom, acc_vendors,
acc_purchase_orders, acc_fiscal_years, acc_fiscal_periods, acc_manual_orders
