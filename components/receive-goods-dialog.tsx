"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Truck } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface POItem {
  material_id: string
  material_name: string
  quantity: number
  unit: string
  unit_cost: number
  received_quantity?: number
}

interface ReceiveGoodsDialogProps {
  poId: string
  items: POItem[]
}

export function ReceiveGoodsDialog({ poId, items }: ReceiveGoodsDialogProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [notes, setNotes] = useState("")

  const [receiptItems, setReceiptItems] = useState(
    items.map(item => ({
      material_id: item.material_id,
      material_name: item.material_name,
      quantity_received: Math.max(0, item.quantity - (item.received_quantity || 0)),
      max: Math.max(0, item.quantity - (item.received_quantity || 0)),
      unit: item.unit,
    }))
  )

  useEffect(() => {
    setReceiptItems(items.map(item => ({
      material_id: item.material_id,
      material_name: item.material_name,
      quantity_received: Math.max(0, item.quantity - (item.received_quantity || 0)),
      max: Math.max(0, item.quantity - (item.received_quantity || 0)),
      unit: item.unit,
    })))
  }, [items])

  const handleSubmit = async () => {
    const itemsToReceive = receiptItems
      .filter(i => i.quantity_received > 0)
      .map(i => ({ material_id: i.material_id, quantity_received: i.quantity_received }))

    if (itemsToReceive.length === 0) {
      toast.error("Enter at least one quantity to receive")
      return
    }

    setReceiving(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "receive", items: itemsToReceive, notes })
      })

      const data = await res.json()
      if (res.ok) {
        toast.success("Goods received successfully! Journal entry created.")
        setIsOpen(false)
        router.refresh()
      } else {
        toast.error(data.error || "Failed to receive goods")
      }
    } catch {
      toast.error("Failed to receive goods")
    } finally {
      setReceiving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Receive"><Truck className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Receive Goods</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Receiving Now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receiptItems.map((item, idx) => {
                const poItem = items.find(i => i.material_id === item.material_id)
                return (
                  <TableRow key={item.material_id}>
                    <TableCell className="font-medium">
                      {item.material_name}
                      <div className="text-xs text-muted-foreground">{item.unit}</div>
                    </TableCell>
                    <TableCell>{poItem?.quantity || 0} {item.unit}</TableCell>
                    <TableCell className="text-green-600">{poItem?.received_quantity || 0} {item.unit}</TableCell>
                    <TableCell>
                      {item.max > 0 ? (
                        <Input
                          type="number"
                          min={0}
                          max={item.max}
                          value={item.quantity_received}
                          onChange={e => {
                            const newItems = [...receiptItems]
                            newItems[idx].quantity_received = Math.min(item.max, Math.max(0, Number(e.target.value) || 0))
                            setReceiptItems(newItems)
                          }}
                          className="w-24"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Fully received</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="space-y-2">
            <Label>Receipt Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={receiving}>
              {receiving ? "Processing..." : "Confirm Receipt"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
