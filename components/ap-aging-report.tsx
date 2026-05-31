"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"

export function APAgingReport() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetch("/api/reports/ap-aging").then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false)) }, [])

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading AP Aging...</div>
  if (!data?.vendors?.length) return <div className="p-8 text-center text-muted-foreground">No payables found.</div>

  const agingLabels: Record<string, string> = { current: "Current", "1_30": "1-30 Days", "31_60": "31-60 Days", "61_90": "61-90 Days", "90plus": "90+ Days" }
  const agingColors: Record<string, string> = { current: "default", "1_30": "secondary", "31_60": "outline", "61_90": "destructive", "90plus": "destructive" }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        {Object.entries(agingLabels).map(([key, label]) => (
          <Card key={key}><CardContent className="pt-4"><div className="text-2xl font-bold">{formatCurrency(data.summary[key] || 0)}</div><div className="text-sm text-muted-foreground">{label}</div></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Accounts Payable Details</CardTitle></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>PO</TableHead><TableHead>Amount</TableHead><TableHead>Due Date</TableHead><TableHead>Days Overdue</TableHead><TableHead>Aging</TableHead></TableRow></TableHeader>
          <TableBody>{data.vendors.map((v: any) => <TableRow key={v.po_id}><TableCell className="font-medium">{v.vendor_name}</TableCell><TableCell className="font-mono text-xs">{v.po_id}</TableCell><TableCell>{formatCurrency(v.amount)}</TableCell><TableCell>{v.due_date}</TableCell><TableCell>{v.days_overdue}</TableCell><TableCell><Badge variant={agingColors[v.aging] as any}>{agingLabels[v.aging]}</Badge></TableCell></TableRow>)}</TableBody></Table>
        </CardContent>
      </Card>
    </div>
  )
}
