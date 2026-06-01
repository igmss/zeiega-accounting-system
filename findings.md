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

## Journal Entry Table
Stored in Supabase `journal_entries` table.
Structure: { id, date, type, reference_doc, entries (JSONB), total_debits, total_credits }

## Supabase Tables
customers, chart_of_accounts, journal_entries, journal_entry_lines,
sales_orders, work_orders, inventory_items, inventory_movements, invoices,
payments, assets, designs, bom, vendors, purchase_orders, fiscal_years,
fiscal_periods, manual_orders, inventory_layers, scrap_records, rework_orders,
change_orders, retention_schedules, budget_lines, account_balances,
overhead_config, standard_costs, contracts, revenue_recognition,
exchange_rates, orders, returns, products, website_users, erp_user_profiles
