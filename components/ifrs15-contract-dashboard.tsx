"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { FileText, AlertTriangle, DollarSign, CheckCircle2, Clock } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface Contract {
  id: string
  salesOrderId: string
  customerName: string
  description: string
  contractPrice: number
  totalEstimatedCost: number
  costsIncurredToDate: number
  revenueRecognizedToDate: number
  amountsBilledToDate: number
  percentageComplete: number
  contractAsset: number
  contractLiability: number
  isOnerous: boolean
  expectedLoss: number
  status: string
  estimatedCompletionDate: string
}

export function IFRS15ContractDashboard() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [newContract, setNewContract] = useState({
    salesOrderId: "",
    customerName: "",
    description: "",
    contractPrice: "",
    totalEstimatedCost: "",
    estimatedMonths: "12",
  })

  useEffect(() => { fetchContracts() }, [])

  const fetchContracts = async () => {
    try {
      const res = await fetch("/api/contracts")
      const data = await res.json()
      setContracts(data.contracts || [])
    } catch (err) {
      console.error("Failed to fetch contracts", err)
    }
  }

  const createContract = async () => {
    setLoading(true)
    try {
      const completionDate = new Date()
      completionDate.setMonth(completionDate.getMonth() + Number(newContract.estimatedMonths))

      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesOrderId: newContract.salesOrderId,
          customerName: newContract.customerName,
          description: newContract.description,
          contractPrice: Number(newContract.contractPrice),
          totalEstimatedCost: Number(newContract.totalEstimatedCost),
          estimatedCompletionDate: completionDate.toISOString(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Contract created: ${data.contractId}`)
        fetchContracts()
        setNewContract({ salesOrderId: "", customerName: "", description: "", contractPrice: "", totalEstimatedCost: "", estimatedMonths: "12" })
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error("Failed to create contract")
    } finally {
      setLoading(false)
    }
  }

  const recognizeRevenue = async (contractId: string, costs: number) => {
    try {
      const res = await fetch("/api/contracts/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, costsIncurredThisPeriod: costs }),
      })
      const data = await res.json()
      if (data.success) {
        const amount = data.recognition?.revenueThisPeriod
        toast.success(`Revenue recognized: ${formatCurrency(amount)}`)
        fetchContracts()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error("Failed to recognize revenue")
    }
  }

  const checkOnerous = async (contractId: string) => {
    try {
      const res = await fetch("/api/contracts/onerous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      })
      const data = await res.json()
       if (data.isOnerous) {
         const amount = data.expectedLoss
         toast.error(`Onerous Contract: Expected loss ${formatCurrency(amount)}`)
      } else {
        toast.success("Contract healthy: No onerous contract detected")
      }
    } catch {
      toast.error("Failed to check contract")
    }
  }

  const totalContractValue = contracts.reduce((s, c) => s + c.contractPrice, 0)
  const totalRecognized = contracts.reduce((s, c) => s + c.revenueRecognizedToDate, 0)
  const totalUnbilled = contracts.reduce((s, c) => s + c.contractAsset, 0)
  const onerousContracts = contracts.filter(c => c.isOnerous)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Contracts</CardDescription>
            <CardTitle className="text-2xl">{contracts.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Contract Value</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalContractValue / 1000000)}M</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue Recognized</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalRecognized / 1000000)}M</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unbilled (Contract Asset)</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalUnbilled / 1000)}K</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Onerous Alert */}
      {onerousContracts.length > 0 && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Onerous Contracts Detected
            </CardTitle>
            <CardDescription className="text-red-600 dark:text-red-300">
              {onerousContracts.length} contract(s) with total expected loss: {formatCurrency(onerousContracts.reduce((s, c) => s + c.expectedLoss, 0))}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* New Contract Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            New IFRS 15 Contract
          </CardTitle>
          <CardDescription>Create a contract for over-time revenue recognition (cost-to-cost method)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sales Order ID</Label>
              <Input value={newContract.salesOrderId} onChange={e => setNewContract(p => ({ ...p, salesOrderId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input value={newContract.customerName} onChange={e => setNewContract(p => ({ ...p, customerName: e.target.value }))} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Description</Label>
              <Input value={newContract.description} onChange={e => setNewContract(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Contract Price (EGP)</Label>
              <Input type="number" value={newContract.contractPrice} onChange={e => setNewContract(p => ({ ...p, contractPrice: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Total Estimated Cost (EGP)</Label>
              <Input type="number" value={newContract.totalEstimatedCost} onChange={e => setNewContract(p => ({ ...p, totalEstimatedCost: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Estimated Duration (months)</Label>
              <Input type="number" value={newContract.estimatedMonths} onChange={e => setNewContract(p => ({ ...p, estimatedMonths: e.target.value }))} />
            </div>
          </div>
          <Button className="mt-4" onClick={createContract} disabled={loading}>
            {loading ? "Creating..." : "Create Contract"}
          </Button>
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Active Contracts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>% Complete</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Billed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => (
                <TableRow key={c.id} className={c.isOnerous ? "bg-red-50 dark:bg-red-950" : ""}>
                  <TableCell className="font-medium max-w-[200px] truncate">{c.description}</TableCell>
                  <TableCell>{c.customerName}</TableCell>
                  <TableCell>{formatCurrency(c.contractPrice)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Progress value={c.percentageComplete} />
                      <span className="text-xs text-muted-foreground">{c.percentageComplete.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(c.revenueRecognizedToDate)}</TableCell>
                  <TableCell>{formatCurrency(c.amountsBilledToDate)}</TableCell>
                  <TableCell>
                    <Badge variant={c.isOnerous ? "destructive" : c.status === "completed" ? "default" : "secondary"}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => recognizeRevenue(c.id, 0)}>
                        <Clock className="h-3 w-3 mr-1" />Recognize
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => checkOnerous(c.id)}>
                        <AlertTriangle className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {contracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No contracts yet. Create one above to start tracking IFRS 15 revenue.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
