"use server"

import { EnhancedAccountingService } from "./services/enhanced-accounting-service"

export async function runOrdersJob() {
  try {
    const result = await EnhancedAccountingService.syncWebsiteOrders()
    return {
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error("Orders job error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }
  }
}

export async function runReturnsJob() {
  try {
    const result = await EnhancedAccountingService.syncWebsiteReturns()
    return {
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error("Returns job error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }
  }
}

export async function runInventoryJob() {
  try {
    const result = await EnhancedAccountingService.updateInventoryValuations()
    return {
      success: true,
      updated: result.updated,
      lowStockAlerts: result.lowStockAlerts,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error("Inventory job error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }
  }
}
