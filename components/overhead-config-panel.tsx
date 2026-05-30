"use client"

import { useState, useEffect } from "react"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Calculator, RotateCcw, TrendingUp } from "lucide-react"

type AllocationBase = "DLH" | "MH" | "DL_COST" | "UNITS" | "MATERIAL_COST"

interface OverheadConfig {
  id: string
  fiscalYear: number
  allocationBase: AllocationBase
  estimatedTotalOH: number
  estimatedActivityLevel: number
  pohr: number
  isActive: boolean
}

const BASE_LABELS: Record<AllocationBase, string> = {
  DLH: "Direct Labor Hours",
  MH: "Machine Hours",
  DL_COST: "Direct Labor Cost (EGP)",
  UNITS: "Units Produced",
  MATERIAL_COST: "Material Cost (EGP)",
}

export function OverheadConfigPanel() {
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [allocationBase, setAllocationBase] = useState<AllocationBase>("DLH")
  const [estimatedOH, setEstimatedOH] = useState("")
  const [estimatedActivity, setEstimatedActivity] = useState("")
  const [pohr, setPohr] = useState<number | null>(null)
  const [configs, setConfigs] = useState<OverheadConfig[]>([])
  const [loading, setLoading] = useState(false)

  const calculatePOHR = () => {
    const oh = Number(estimatedOH)
    const activity = Number(estimatedActivity)
    if (oh <= 0 || activity <= 0) {
      toast.error("Invalid input: Both values must be positive")
      return
    }
    const rate = Math.round((oh / activity) * 100) / 100
    setPohr(rate)
  }

  const saveConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/overhead/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear,
          allocationBase,
          estimatedTotalOH: Number(estimatedOH),
          estimatedActivityLevel: Number(estimatedActivity),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`POHR saved: EGP ${data.pohr} per ${allocationBase}`)
        setPohr(data.pohr)
        fetchConfigs()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error("Failed to save POHR config")
    } finally {
      setLoading(false)
    }
  }

  const fetchConfigs = async () => {
    try {
      const res = await fetch(`/api/overhead/config?fiscalYear=${fiscalYear}`)
      const data = await res.json()
      if (data.configs) setConfigs(data.configs)
    } catch {
      console.error("Failed to fetch overhead configs")
    }
  }

  useEffect(() => {
    fetchConfigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyOverhead = async (workOrderId: string, actualActivity: number) => {
    try {
      const res = await fetch("/api/overhead/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, actualActivity, fiscalYear }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`OH applied: EGP ${data.appliedOH} applied to ${workOrderId}`)
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error("Failed to apply overhead")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            POHR Configuration
          </CardTitle>
          <CardDescription>
            Predetermined Overhead Rate = Estimated Total OH ÷ Estimated Activity Level
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fiscal Year</Label>
              <Input
                type="number"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Allocation Base</Label>
              <Select value={allocationBase} onValueChange={(v) => setAllocationBase(v as AllocationBase)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BASE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estimated Total OH (EGP)</Label>
              <Input
                type="number"
                placeholder="e.g. 2,400,000"
                value={estimatedOH}
                onChange={(e) => setEstimatedOH(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Estimated Activity Level ({allocationBase})</Label>
              <Input
                type="number"
                placeholder="e.g. 120,000"
                value={estimatedActivity}
                onChange={(e) => setEstimatedActivity(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={calculatePOHR} variant="outline">
              Calculate POHR
            </Button>
            <Button onClick={saveConfig} disabled={loading}>
              {loading ? "Saving..." : "Save Configuration"}
            </Button>
          </div>

          {pohr !== null && (
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">POHR Result</div>
              <div className="text-2xl font-bold">
                {formatCurrency(pohr)} / {allocationBase}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Formula: {formatCurrency(estimatedOH)} ÷ {formatNumber(estimatedActivity)} {allocationBase}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Active POHR Rates — FY {fiscalYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Base</TableHead>
                  <TableHead>Est. OH</TableHead>
                  <TableHead>Est. Activity</TableHead>
                  <TableHead>POHR</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{BASE_LABELS[c.allocationBase]}</TableCell>
                    <TableCell>{formatCurrency(c.estimatedTotalOH)}</TableCell>
                    <TableCell>{formatNumber(c.estimatedActivityLevel)}</TableCell>
                    <TableCell>{formatCurrency(c.pohr)}/unit</TableCell>
                    <TableCell>
                      <Badge variant={c.isActive ? "default" : "secondary"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
