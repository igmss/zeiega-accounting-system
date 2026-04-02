import { DashboardLayout } from "@/components/dashboard-layout"
import { AssetsManagement } from "@/components/assets-management"

export default function AssetsPage() {
    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-balance">Assets</h1>
                    <p className="text-muted-foreground">Manage and track your business fixed assets and equipment</p>
                </div>
                <AssetsManagement />
            </div>
        </DashboardLayout>
    )
}
