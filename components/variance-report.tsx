"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { BarChart3, TrendingDown, TrendingUp, Minus } from "lucide-react"

interface VarianceData {
  workOrderId: string
  materialPriceVariance: number
  materialUsageVariance: number
  totalMaterialVariance: number
  laborRateVariance: number
  laborEfficiencyVariance: number
  totalLaborVariance: number
  vohSpendingVariance: number
  vohEfficiencyVariance: number
  fohBudgetVariance: number
  fohVolumeVariance: number
  totalVOHVariance: number
  totalFOHVariance: number
  totalVariance: number
  isFavorable: boolean
}

function VarianceRow({ label, amount }: { label: string; amount: number }) {
  const absAmount = Math.abs(amount)
  const isFav = amount < 0
  const isZero = Math.abs(amount) < 0.01

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${isZero ? "text-muted-foreground" : isFav ? "text-green-600" : "text-red-600"}`}>
          {isFav ? "(F) " : isZero ? "" : "(U) "}
          EGP {absAmount.toLocaleString()}
        </span>
        {isZero ? <Minus className="h-4 w-4 text-muted-foreground" /> :
         isFav ? <TrendingDown className="h-4 w-4 text-green-600" /> :
                  <TrendingUp className="h-4 w-4 text-red-600" />}
      </div>
    </div>
  )
}

export function VarianceReport() {
  const [workOrderId, setWorkOrderId] = useState("")
  const [designId, setDesignId] = useState("")
  const [variance, setVariance] = useState<VarianceData | null>(null)
  const [loading, setLoading] = useState(false)

  // Standard cost form
  const [standard, setStandard] = useState({
    dmQuantity: "4.5",
    dmPrice: "20",
    dlHours: "2",
    dlRate: "75",
    vohRate: "15",
    budgetedFOH: "200000",
    budgetedActivity: "25000",
  })

  const analyzeVariance = async () => {
    if (!workOrderId) {
      toast({ title: "Missing work order", description: "Enter a work order ID", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/variance/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, designId }),
      })
      const data = await res.json()
      if (data.success) {
        setVariance(data.variance)
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to analyze variances", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const saveStandardCost = async () => {
    if (!designId) {
      toast({ title: "Missing design", description: "Enter a design ID", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/variance/standard-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId,
          designName: "",
          standardDMQuantity: Number(standard.dmQuantity),
          standardDMPrice: Number(standard.dmPrice),
          standardDMCost: Number(standard.dmQuantity) * Number(standard.dmPrice),
          standardDLHours: Number(standard.dlHours),
          standardDLRate: Number(standard.dlRate),
          standardDLCost: Number(standard.dlHours) * Number(standard.dlRate),
          standardVOHRate: Number(standard.vohRate),
          standardVOHCost: Number(standard.vohRate) * Number(standard.dlHours),
          budgetedFOH: Number(standard.budgetedFOH),
          budgetedActivity: Number(standard.budgetedActivity),
          standardFOHRate: Number(standard.budgetedFOH) / Number(standard.budgetedActivity),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: "Standard costs saved", description: `Design: ${designId}` })
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to save standard costs", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const closeVarianceAccounts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/variance/close", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        toast({ title: "Variances closed", description: `EGP ${data.totalClosed} closed to COGS` })
      }
    } catch {
      toast({ title: "Error", description: "Failed to close variances", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Standard Cost Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Standard Cost Configuration
          </CardTitle>
          <CardDescription>Set standard costs per design for variance comparison</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Design ID</Label>
              <Input value={designId} onChange={e => setDesignId(e.target.value)} placeholder="D001" />
            </div>
            <div className="space-y-2">
              <Label>Std DM Quantity/Unit</Label>
              <Input value={standard.dmQuantity} onChange={e => setStandard(s => ({ ...s, dmQuantity: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Std DM Price (EGP)</Label>
              <Input value={standard.dmPrice} onChange={e => setStandard(s => ({ ...s, dmPrice: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Std DL Hours/Unit</Label>
              <Input value={standard.dlHours} onChange={e => setStandard(s => ({ ...s, dlHours: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Std DL Rate (EGP/hr)</Label>
              <Input value={standard.dlRate} onChange={e => setStandard(s => ({ ...s, dlRate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Std VOH Rate (EGP/DLH)</Label>
              <Input value={standard.vohRate} onChange={e => setStandard(s => ({ ...s, vohRate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Budgeted FOH (annual EGP)</Label>
              <Input value={standard.budgetedFOH} onChange={e => setStandard(s => ({ ...s, budgetedFOH: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Budgeted Activity (DLH)</Label>
              <Input value={standard.budgetedActivity} onChange={e => setStandard(s => ({ ...s, budgetedActivity: e.target.value }))} />
            </div>
          </div>
          <Button onClick={saveStandardCost} disabled={loading}>
            Save Standard Costs
          </Button>
        </CardContent>
      </Card>

      {/* Variance Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Variance Analysis per Work Order</CardTitle>
          <CardDescription>Compare actual job costs against standard costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="space-y-2 flex-1">
              <Label>Work Order ID</Label>
              <Input value={workOrderId} onChange={e => setWorkOrderId(e.target.value)} placeholder="WO-..." />
            </div>
            <Button onClick={analyzeVariance} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze Variances"}
            </Button>
          </div>

          {variance && (
            <div className="space-y-4">
              {/* Summary Badge */}
              <div className="flex items-center gap-2">
                <Badge variant={variance.isFavorable ? "default" : "destructive"} className="text-sm px-3 py-1">
                  {variance.isFavorable ? "FAVORABLE" : "UNFAVORABLE"}
                </Badge>
                <span className="text-lg font-bold">
                  Total: EGP {Math.abs(variance.totalVariance).toLocaleString()}
                </span>
              </div>

              {/* Material Variances */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Material Variances</CardTitle>
                </CardHeader>
                <CardContent>
                  <VarianceRow label="Price Variance" amount={variance.materialPriceVariance} />
                  <VarianceRow label="Usage Variance" amount={variance.materialUsageVariance} />
                  <div className="border-t mt-2 pt-2 font-semibold">
                    <VarianceRow label="Total Material" amount={variance.totalMaterialVariance} />
                  </div>
                </CardContent>
              </Card>

              {/* Labor Variances */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Labor Variances</CardTitle>
                </CardHeader>
                <CardContent>
                  <VarianceRow label="Rate Variance" amount={variance.laborRateVariance} />
                  <VarianceRow label="Efficiency Variance" amount={variance.laborEfficiencyVariance} />
                  <div className="border-t mt-2 pt-2 font-semibold">
                    <VarianceRow label="Total Labor" amount={variance.totalLaborVariance} />
                  </div>
                </CardContent>
              </Card>

              {/* Overhead Variances */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Overhead Variances (4-Way)</CardTitle>
                </CardHeader>
                <CardContent>
                  <VarianceRow label="VOH Spending" amount={variance.vohSpendingVariance} />
                  <VarianceRow label="VOH Efficiency" amount={variance.vohEfficiencyVariance} />
                  <VarianceRow label="FOH Budget" amount={variance.fohBudgetVariance} />
                  <VarianceRow label="FOH Volume" amount={variance.fohVolumeVariance} />
                  <div className="border-t mt-2 pt-2">
                    <VarianceRow label="Total VOH" amount={variance.totalVOHVariance} />
                    <VarianceRow label="Total FOH" amount={variance.totalFOHVariance} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="border-t pt-4">
            <Button onClick={closeVarianceAccounts} variant="outline" disabled={loading}>
              Close Variance Accounts to COGS (Period-End)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
