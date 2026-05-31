"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"

export function DepreciationReport() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch("/api/reports/depreciation-schedule").then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false)) }, [])
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>
  if (!data?.schedule?.length) return <div className="p-8 text-center text-muted-foreground">No fixed assets found.</div>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{formatCurrency(data.summary.totalCost)}</div><div className="text-sm text-muted-foreground">Total Asset Cost</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{formatCurrency(data.summary.totalAccumDep)}</div><div className="text-sm text-muted-foreground">Accum. Depreciation</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{formatCurrency(data.summary.totalNBV)}</div><div className="text-sm text-muted-foreground">Net Book Value</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Depreciation Schedule</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Category</TableHead><TableHead>Cost</TableHead><TableHead>Useful Life</TableHead><TableHead>Annual Dep</TableHead><TableHead>Accum Dep</TableHead><TableHead>NBV</TableHead></TableRow></TableHeader>
          <TableBody>{data.schedule.map((a: any) => <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell>{a.category}</TableCell><TableCell>{formatCurrency(a.purchase_cost)}</TableCell><TableCell>{a.useful_life}y</TableCell><TableCell>{formatCurrency(a.annual_depreciation)}</TableCell><TableCell>{formatCurrency(a.accumulated_depreciation)}</TableCell><TableCell>{formatCurrency(a.net_book_value)}</TableCell></TableRow>)}</TableBody></Table>
      </CardContent></Card>
    </div>
  )
}
