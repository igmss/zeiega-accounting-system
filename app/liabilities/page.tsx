import { DashboardLayout } from "@/components/dashboard-layout"
import { LiabilitiesManagement } from "@/components/liabilities-management"

export default function LiabilitiesPage() {
    return (
        <DashboardLayout>
        <div className="container mx-auto py-10">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Liability Management</h1>
                    <p className="text-muted-foreground">Manage loans, payables, and other liabilities.</p>
                </div>
            </div>

            <LiabilitiesManagement />
        </div>
        </DashboardLayout>
    )
}
