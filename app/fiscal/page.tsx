"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { YearEndClosePanel } from "@/components/year-end-close-panel"

export default function FiscalPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Fiscal Close</h1>
          <p className="text-muted-foreground">Close fiscal periods and generate closing entries</p>
        </div>
        <YearEndClosePanel />
      </div>
    </DashboardLayout>
  )
}
