import { DashboardLayout } from "@/components/dashboard-layout"
import { ApiDocsContent } from "@/components/api-docs-content"

export default function ApiDocsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-balance">API Documentation</h1>
          <p className="text-muted-foreground">
            Complete reference for the AccuFinance REST API
          </p>
        </div>
        <ApiDocsContent />
      </div>
    </DashboardLayout>
  )
}
