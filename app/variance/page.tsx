"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { VarianceReport } from "@/components/variance-report"

export default function VariancePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Variance Analysis</h1>
          <p className="text-muted-foreground">Analyze material, labor, and overhead variances</p>
        </div>
        <VarianceReport />
      </div>
    </DashboardLayout>
  )
}
