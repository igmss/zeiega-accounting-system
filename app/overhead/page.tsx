"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { OverheadConfigPanel } from "@/components/overhead-config-panel"

export default function OverheadPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Overhead Configuration</h1>
          <p className="text-muted-foreground">Manage overhead allocation rates and cost centers</p>
        </div>
        <OverheadConfigPanel />
      </div>
    </DashboardLayout>
  )
}
