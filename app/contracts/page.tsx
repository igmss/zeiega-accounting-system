"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { IFRS15ContractDashboard } from "@/components/ifrs15-contract-dashboard"

export default function ContractsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">IFRS 15 Contracts</h1>
          <p className="text-muted-foreground">Revenue recognition under IFRS 15 / ASC 606</p>
        </div>
        <IFRS15ContractDashboard />
      </div>
    </DashboardLayout>
  )
}
