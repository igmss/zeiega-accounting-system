import { DashboardLayout } from "@/components/dashboard-layout"
import { ExpensesManagement } from "@/components/expenses-management"

export default function ExpensesPage() {
    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-balance">Expenses</h1>
                    <p className="text-muted-foreground">Manage and track your business expenses</p>
                </div>
                <ExpensesManagement />
            </div>
        </DashboardLayout>
    )
}
