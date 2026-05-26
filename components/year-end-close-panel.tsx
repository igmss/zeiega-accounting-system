"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { Lock, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"

export function YearEndClosePanel() {
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ netIncome?: number; entryIds?: string[] } | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const executeClose = async () => {
    if (!confirmed) {
      toast.error("Confirmation required: Check the confirmation box first")
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch("/api/fiscal/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYear }),
      })
      const data = await res.json()
      if (data.success) {
        setResult(data)
        toast.success(`FY${fiscalYear} closed. Net Income: EGP ${data.netIncome?.toLocaleString()}`)
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error("Year-end close failed")
    } finally {
      setLoading(false)
      setConfirmed(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Fiscal Year-End Close
        </CardTitle>
        <CardDescription>
          Execute year-end close: revenue, COGS, and expenses → P&L → Retained Earnings.
          Drawings accounts closed to partner capital. Fiscal year marked as closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Irreversible Action</AlertTitle>
          <AlertDescription>
            Year-end close creates permanent closing entries in the journal. This cannot be undone automatically.
            Ensure all transactions for FY{fiscalYear} are posted and reconciled before proceeding.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label>Fiscal Year to Close</Label>
          <Input
            type="number"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(Number(e.target.value))}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="confirm-close"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="confirm-close" className="text-sm cursor-pointer">
            I confirm all FY{fiscalYear} transactions are posted and reconciled. I understand this cannot be undone.
          </Label>
        </div>

        <Button
          onClick={executeClose}
          disabled={loading || !confirmed}
          variant="destructive"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Closing FY{fiscalYear}...</>
          ) : (
            <><Lock className="h-4 w-4 mr-2" /> Execute Year-End Close FY{fiscalYear}</>
          )}
        </Button>

        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Year-End Close Complete</AlertTitle>
            <AlertDescription>
              <div className="space-y-1 mt-2">
                <div>Net Income: <strong>EGP {result.netIncome?.toLocaleString()}</strong></div>
                <div>Closing entries created: <strong>{result.entryIds?.length || 0}</strong></div>
                <div className="text-xs text-muted-foreground mt-2">
                  Entry IDs: {result.entryIds?.join(", ")}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="text-sm text-muted-foreground border-t pt-4">
          <p className="font-medium mb-2">What happens during year-end close:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Revenue accounts (4xxx) → Current Year P&L (3200)</li>
            <li>COGS accounts (5xxx) → Current Year P&L (3200)</li>
            <li>Expense accounts (6xxx) → Current Year P&L (3200)</li>
            <li>Other income/expense (7xxx) → Current Year P&L (3200)</li>
            <li>Current Year P&L (3200) → Retained Earnings (3100)</li>
            <li>Partner Drawings (3021-3023) → Partner Capital (3011-3013)</li>
            <li>Fiscal year marked as closed</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  )
}
