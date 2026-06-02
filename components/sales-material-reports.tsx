"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"

export function SalesByCustomerReport({ dateRange }: { dateRange?: { from: string; to: string } }) {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true)
  useEffect(() => {
    const query = dateRange ? `?from=${dateRange.from}&to=${dateRange.to}` : ""
    fetch(`/api/reports/sales-by-customer${query}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dateRange])
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>
  if (!data?.customers?.length) return <div className="p-8 text-center text-muted-foreground">No sales data found.</div>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{formatCurrency(data.summary.totalRevenue)}</div><div className="text-sm text-muted-foreground">Total Revenue</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{data.summary.customerCount}</div><div className="text-sm text-muted-foreground">Customers</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.totalPaid)}</div><div className="text-sm text-muted-foreground">Paid</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-600">{formatCurrency(data.summary.totalUnpaid)}</div><div className="text-sm text-muted-foreground">Unpaid</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Sales by Customer</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Orders</TableHead><TableHead>Revenue</TableHead><TableHead>Paid</TableHead><TableHead>Unpaid</TableHead></TableRow></TableHeader>
          <TableBody>{data.customers.map((c: any) => <TableRow key={c.customer_id}><TableCell className="font-medium">{c.customer_name}</TableCell><TableCell>{c.order_count}</TableCell><TableCell>{formatCurrency(c.total_revenue)}</TableCell><TableCell className="text-green-600">{formatCurrency(c.paid)}</TableCell><TableCell className="text-red-600">{formatCurrency(c.unpaid)}</TableCell></TableRow>)}</TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

export function MaterialConsumptionReport({ dateRange }: { dateRange?: { from: string; to: string } }) {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true)
  useEffect(() => {
    const query = dateRange ? `?from=${dateRange.from}&to=${dateRange.to}` : ""
    fetch(`/api/reports/material-consumption${query}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dateRange])
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>
  if (!data?.items?.length) return <div className="p-8 text-center text-muted-foreground">No material consumption data found.</div>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{formatCurrency(data.summary.totalCost)}</div><div className="text-sm text-muted-foreground">Total Cost</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{data.summary.totalQuantity}</div><div className="text-sm text-muted-foreground">Total Quantity</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{data.summary.workOrdersWithConsumption}</div><div className="text-sm text-muted-foreground">Items Tracked</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Material Consumption</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Qty Used</TableHead><TableHead>Total Cost</TableHead><TableHead>Avg Cost/Unit</TableHead><TableHead>WOs</TableHead></TableRow></TableHeader>
          <TableBody>{data.items.map((m: any) => <TableRow key={m.material_id}><TableCell className="font-medium">{m.material_name}</TableCell><TableCell>{m.total_quantity}</TableCell><TableCell>{formatCurrency(m.total_cost)}</TableCell><TableCell>{formatCurrency(m.avg_cost_per_unit)}</TableCell><TableCell>{m.work_orders_count}</TableCell></TableRow>)}</TableBody></Table>
      </CardContent></Card>
    </div>
  )
}
