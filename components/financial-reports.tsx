"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, Calendar, Download } from "lucide-react"
import { ProfitLossReport } from "./profit-loss-report"
import { BalanceSheetReport } from "./balance-sheet-report"
import { InventoryValuationReport } from "./inventory-valuation-report"
import { JobProfitabilityReport } from "./job-profitability-report"
import { CashFlowReport } from "./cash-flow-report"
import { ARAgingReport } from "./ar-aging-report"
import { TaxVATReport } from "./tax-vat-report"
import { COGMReport } from "./cogm-report"
import { TrialBalanceReport } from "./trial-balance-report"
import { GeneralLedgerReport } from "./general-ledger-report"
import { VarianceReport } from "./variance-report"
import { APAgingReport } from "./ap-aging-report"
import { DepreciationReport } from "./depreciation-report"
import { PartnerCapitalReport } from "./partner-capital-report"
import { SalesByCustomerReport, MaterialConsumptionReport } from "./sales-material-reports"

function getToday(): string {
  const d = new Date()
  return d.toISOString().split("T")[0]
}

function getDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400000)
  return d.toISOString().split("T")[0]
}

function getMonthStart(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().split("T")[0]
}

function getYearStart(): string {
  return `${new Date().getFullYear()}-01-01`
}

function getQuarterStart(): string {
  const d = new Date()
  const m = Math.floor(d.getMonth() / 3) * 3
  d.setMonth(m, 1)
  return d.toISOString().split("T")[0]
}

function computePeriod(period: string): { from: string; to: string } {
  const today = getToday()
  switch (period) {
    case "daily": return { from: today, to: today }
    case "weekly": return { from: getDaysAgo(7), to: today }
    case "monthly": return { from: getMonthStart(), to: today }
    case "quarterly": return { from: getQuarterStart(), to: today }
    case "yearly": return { from: getYearStart(), to: today }
    default: return { from: getMonthStart(), to: today }
  }
}

export function FinancialReports() {
  const [dateRange, setDateRange] = useState(() => computePeriod("monthly"))
  const [reportPeriod, setReportPeriod] = useState("monthly")
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeDateRange, setActiveDateRange] = useState(dateRange)

  function handlePeriodChange(period: string) {
    setReportPeriod(period)
    if (period !== "custom") {
      const computed = computePeriod(period)
      setDateRange(computed)
      setActiveDateRange(computed)
      setRefreshKey(k => k + 1)
    }
  }

  function handleGenerate() {
    setActiveDateRange({ ...dateRange })
    setRefreshKey(k => k + 1)
  }

  const quickPresets = [
    { label: "Today", from: getToday(), to: getToday() },
    { label: "Last 7D", from: getDaysAgo(7), to: getToday() },
    { label: "Last 30D", from: getDaysAgo(30), to: getToday() },
    { label: "This Month", from: getMonthStart(), to: getToday() },
    { label: "This Year", from: getYearStart(), to: getToday() },
  ]

  return (
    <div className="space-y-6">
      {/* Quick Presets */}
      <div className="flex flex-wrap gap-2">
        {quickPresets.map(p => (
          <Button
            key={p.label}
            variant="outline"
            size="sm"
            onClick={() => {
              setDateRange({ from: p.from, to: p.to })
              setReportPeriod("custom")
              setActiveDateRange({ from: p.from, to: p.to })
              setRefreshKey(k => k + 1)
            }}
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            {p.label}
          </Button>
        ))}
      </div>

      {/* Report Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Financial Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period">Report Period</Label>
              <Select value={reportPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from-date">From Date</Label>
              <Input
                id="from-date"
                type="date"
                value={dateRange.from}
                onChange={(e) => { setDateRange(p => ({ ...p, from: e.target.value })); setReportPeriod("custom") }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-date">To Date</Label>
              <Input
                id="to-date"
                type="date"
                value={dateRange.to}
                onChange={(e) => { setDateRange(p => ({ ...p, to: e.target.value })); setReportPeriod("custom") }}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button className="flex-1" onClick={handleGenerate}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Generate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Tabs */}
      <Tabs defaultValue="profit-loss" className="space-y-4">
        <div className="space-y-2">
          <TabsList className="grid w-full grid-cols-5 *:cursor-pointer">
            <TabsTrigger value="profit-loss">P&L</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
            <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
            <TabsTrigger value="general-ledger">General Ledger</TabsTrigger>
            <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          </TabsList>
          <TabsList className="grid w-full grid-cols-5 *:cursor-pointer">
            <TabsTrigger value="cogm">COGM</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="ar-aging">AR Aging</TabsTrigger>
            <TabsTrigger value="tax-vat">Tax/VAT</TabsTrigger>
            <TabsTrigger value="job-profitability">Job Profit</TabsTrigger>
          </TabsList>
          <TabsList className="grid w-full grid-cols-2 *:cursor-pointer">
            <TabsTrigger value="variance">Variance Analysis</TabsTrigger>
            <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          </TabsList>
          <TabsList className="grid w-full grid-cols-5 *:cursor-pointer">
            <TabsTrigger value="ap-aging">AP Aging</TabsTrigger>
            <TabsTrigger value="depreciation">Depreciation</TabsTrigger>
            <TabsTrigger value="partner-capital">Partner Capital</TabsTrigger>
            <TabsTrigger value="sales-by-customer">Sales/Customer</TabsTrigger>
            <TabsTrigger value="material-consumption">Materials</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profit-loss">
          <ProfitLossReport key={`pl-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="balance-sheet">
          <BalanceSheetReport key={`bs-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="trial-balance">
          <TrialBalanceReport key={`tb-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="general-ledger">
          <GeneralLedgerReport key={`gl-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="cash-flow">
          <CashFlowReport key={`cf-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="cogm">
          <COGMReport key={`cogm-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryValuationReport key={`inv-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="ar-aging">
          <ARAgingReport key={`ar-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="tax-vat">
          <TaxVATReport key={`vat-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="job-profitability">
          <JobProfitabilityReport key={`jp-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="variance">
          <VarianceReport key={`var-${refreshKey}`} />
        </TabsContent>
        <TabsContent value="income-statement">
          <ProfitLossReport key={`is-${refreshKey}`} dateRange={activeDateRange} />
        </TabsContent>
        <TabsContent value="ap-aging">
          <APAgingReport />
        </TabsContent>
        <TabsContent value="depreciation">
          <DepreciationReport />
        </TabsContent>
        <TabsContent value="partner-capital">
          <PartnerCapitalReport />
        </TabsContent>
        <TabsContent value="sales-by-customer">
          <SalesByCustomerReport />
        </TabsContent>
        <TabsContent value="material-consumption">
          <MaterialConsumptionReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}
