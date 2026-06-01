export function generateOrderNumber(prefix: "SO" | "INV" | "WO"): string {
  const year = new Date().getFullYear()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${year}-${random}`
}

export function generateWorkOrderNumber(): string {
  return generateOrderNumber("WO")
}

export function generateSalesOrderNumber(): string {
  return generateOrderNumber("SO")
}

export function generateInvoiceNumber(): string {
  return generateOrderNumber("INV")
}
