import { NextResponse } from "next/server"
import { EnhancedAccountingService } from "@/lib/services/enhanced-accounting-service"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get dashboard data
    const [kpiData, monthlyRevenue, topCustomers, recentOrders, inventoryAlerts, workOrderStatus] = await Promise.all([
      EnhancedAccountingService.getKPIData(),
      EnhancedAccountingService.getMonthlyRevenue(),
      EnhancedAccountingService.getTopCustomers(),
      EnhancedAccountingService.getRecentOrders(),
      EnhancedAccountingService.getInventoryAlerts(),
      EnhancedAccountingService.getWorkOrderStatus(),
    ])
    
    return NextResponse.json({
      kpiData,
      monthlyRevenue,
      topCustomers,
      recentOrders,
      inventoryAlerts,
      workOrderStatus
    })
  } catch (error) {
    console.error("Error fetching dashboard data:", error)
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    )
  }
}
