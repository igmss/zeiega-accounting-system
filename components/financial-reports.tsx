"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, TrendingUp } from "lucide-react"
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

export function FinancialReports() {
  const [dateRange, setDateRange] = useState({
    from: "2025-01-01",
    to: "2025-01-31",
  })
  const [reportPeriod, setReportPeriod] = useState("monthly")

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Financial Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period">Report Period</Label>
              <Select value={reportPeriod} onValueChange={setReportPeriod}>
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
                onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-date">To Date</Label>
              <Input
                id="to-date"
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
              />
            </div>

            <div className="flex items-end">
              <Button className="w-full">
                <TrendingUp className="h-4 w-4 mr-2" />
                Generate Reports
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Tabs - Three Rows */}
      <Tabs defaultValue="profit-loss" className="space-y-4">
        <div className="space-y-2">
          {/* Row 1 - Core Financial Statements */}
          <TabsList className="grid w-full grid-cols-5 *:cursor-pointer">
            <TabsTrigger value="profit-loss">P&L</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
            <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
            <TabsTrigger value="general-ledger">General Ledger</TabsTrigger>
            <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          </TabsList>
          {/* Row 2 - Operational Reports */}
          <TabsList className="grid w-full grid-cols-5 *:cursor-pointer">
            <TabsTrigger value="cogm">COGM</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="ar-aging">AR Aging</TabsTrigger>
            <TabsTrigger value="tax-vat">Tax/VAT</TabsTrigger>
            <TabsTrigger value="job-profitability">Job Profit</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profit-loss">
          <ProfitLossReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="balance-sheet">
          <BalanceSheetReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="trial-balance">
          <TrialBalanceReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="general-ledger">
          <GeneralLedgerReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="cash-flow">
          <CashFlowReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="cogm">
          <COGMReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="inventory">
          <InventoryValuationReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="ar-aging">
          <ARAgingReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="tax-vat">
          <TaxVATReport dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="job-profitability">
          <JobProfitabilityReport dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
