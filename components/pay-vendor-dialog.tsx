"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DollarSign } from "lucide-react"
import { useRouter } from "next/navigation"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

interface PayVendorDialogProps {
  poId: string
  vendorName: string
  totalAmount: number
  paidAmount?: number
}

export function PayVendorDialog({ poId, vendorName, totalAmount, paidAmount = 0 }: PayVendorDialogProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const remaining = Math.max(0, totalAmount - paidAmount)
  const [amount, setAmount] = useState(remaining.toString())
  const [method, setMethod] = useState("bank")
  const [reference, setReference] = useState("")

  const handleSubmit = async () => {
    const payAmount = Number(amount)
    if (!payAmount || payAmount <= 0) {
      toast.error("Enter a valid payment amount")
      return
    }
    if (payAmount > remaining + 0.01) {
      toast.error(`Maximum payment is EGP ${remaining.toFixed(2)}`)
      return
    }

    setPaying(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay", amount: payAmount, method, reference })
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(`Vendor paid EGP ${payAmount.toFixed(2)}. JE: DR 2101 / CR ${method === "cash" ? "1101" : "1103"}`)
        setIsOpen(false)
        router.refresh()
      } else {
        toast.error(data.error || "Failed to record payment")
      }
    } catch {
      toast.error("Failed to record payment")
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Pay Vendor"><DollarSign className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay Vendor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {vendorName} · Total: {formatCurrency(totalAmount)}
            {paidAmount > 0 && <> · Paid: {formatCurrency(paidAmount)}</>}
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span>Remaining</span>
            <span className="text-red-600">{formatCurrency(remaining)}</span>
          </div>

          <div className="space-y-2">
            <Label>Payment Amount</Label>
            <Input type="number" min={0} max={remaining} value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank - Main Account (1103)</SelectItem>
                <SelectItem value="cash">Cash on Hand (1101)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reference / Cheque No.</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. CHQ-2024-001" />
          </div>

          <div className="bg-blue-50 rounded-md p-3 text-xs text-blue-700">
            JE: DR Accounts Payable (2101) · CR {method === "cash" ? "Cash (1101)" : "Bank (1103)"}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={paying}>
              {paying ? "Processing..." : "Record Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
