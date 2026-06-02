"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/utils"

export function PartnerCapitalReport({ dateRange }: { dateRange?: { from: string; to: string } }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const query = dateRange ? `?from=${dateRange.from}&to=${dateRange.to}` : ""
    fetch(`/api/reports/partner-capital${query}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dateRange])
  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>
  if (!data?.partners?.length) return <div className="p-8 text-center text-muted-foreground">No partner data found.</div>

  return (
    <div className="space-y-6">
      <Card><CardHeader><CardTitle>Partner Capital Statement — {data.summary.period}</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Share %</TableHead><TableHead>Opening Balance</TableHead><TableHead>Profit Share</TableHead><TableHead>Drawings</TableHead><TableHead>Closing Balance</TableHead></TableRow></TableHeader>
          <TableBody>{data.partners.map((p: any) => <TableRow key={p.partner}><TableCell className="font-medium">{p.partner}</TableCell><TableCell>{p.share_percent}%</TableCell><TableCell>{formatCurrency(p.opening_balance)}</TableCell><TableCell className="text-green-600">{formatCurrency(p.profit_share)}</TableCell><TableCell className="text-red-600">{formatCurrency(p.drawings)}</TableCell><TableCell className="font-bold">{formatCurrency(p.closing_balance)}</TableCell></TableRow>)}</TableBody></Table>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>Total Opening: {formatCurrency(data.summary.totalOpeningCapital)}</div>
          <div>Total Profit: {formatCurrency(data.summary.totalProfitShare)}</div>
          <div>Total Drawings: {formatCurrency(data.summary.totalDrawings)}</div>
          <div>Total Closing: {formatCurrency(data.summary.totalClosingCapital)}</div>
        </div>
      </CardContent></Card>
    </div>
  )
}
