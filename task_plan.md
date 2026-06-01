# Task Plan: MTO/ETO Accounting System Fixes

## Goal
Fix all identified bugs and implement missing accounting features without breaking existing functionality.

## Status: COMPLETED

All critical bugs fixed, 5 new services created, zero TypeScript errors.

## Phases

### Phase 1: Critical Bug Fixes ✅
- ✅ B1: Fix COGS account code (5001 → 5301)
- ✅ B2: Fix recordLaborApplied liability account
- ✅ B3: Remove WIP Opening phantom entry
- ✅ B4: Fix trial balance normal balance logic
- ✅ B5: Add date filter to getAccountBalance
- ✅ B6: Cash flow statement reviewed (acceptable)
- ✅ B7: Fix Work Order ID collision
- ✅ B8: WIP→FG auto-transfer on sale
- ✅ Fix hardcoded account codes in route
- ✅ Fix unbalanced journal entries in route

### Phase 2: Overhead System ✅
- ✅ POHR configuration model
- ✅ POHR calculation service
- ✅ Apply OH to work orders
- ✅ Over/under-applied OH disposition

### Phase 3: Variance Analysis ✅
- ✅ Standard cost model
- ✅ Material price/usage variance
- ✅ Labor rate/efficiency variance
- ✅ 4-way overhead variance
- ✅ Variance journal entries

### Phase 4: IFRS 15 Over-Time Revenue ✅
- ✅ Contract entity model
- ✅ Cost-to-cost POC calculation
- ✅ Contract asset/liability tracking
- ✅ Milestone billing vs. revenue separation
- ✅ Advance payment handling
- ✅ Onerous contract provisions

### Phase 5: Pricing & Contribution Margin ✅
- ✅ Cost-plus pricing
- ✅ Contribution margin analysis
- ✅ Break-even analysis
- ✅ Special order decision framework
- ✅ Make-vs-buy analysis
- ✅ Throughput accounting

### Phase 6: Fiscal Year-End Close ✅
- ✅ Close revenue/COGS/expenses to P&L
- ✅ Close P&L to Retained Earnings
- ✅ Close drawings to partner capital
- ✅ Mark fiscal year as closed

## Decisions Log
| Decision | Rationale |
|----------|-----------|
| Migrated from Firestore to Supabase PostgreSQL | Completed — `lib/firebase.ts` removed, `lib/supabase.ts` is now the sole DB access layer |
| Fix bugs before adding features | Stability first |
| Preserve backward compatibility | No breaking API changes |
| COGS → 5301 (Cost of Goods Sold) | 5001 was Raw Materials Used — component, not aggregate |
| WIP Opening no longer creates JE | Phantom entries violated IAS 2 |
| Labor credits Wages Payable (2120) | Previously credited Accrued (2140) |
| Material variance accounts: 5101, 5102 | New temporary accounts for variance tracking |

## Files Modified
1. `lib/services/enhanced-accounting-service.ts` — B1-B8 fixes
2. `__tests__/services/enhanced-accounting-service.test.ts` — Test updates
3. `app/api/work-orders/update-materials/route.ts` — Hardcoded accounts + unbalanced entries

## Files Created
1. `lib/services/overhead-service.ts` — POHR system
2. `lib/services/variance-service.ts` — Variance analysis
3. `lib/services/revenue-recognition-service.ts` — IFRS 15 + Onerous contracts
4. `lib/services/fiscal-close-service.ts` — Year-end close
5. `lib/services/pricing-service.ts` — Pricing & CM analysis
