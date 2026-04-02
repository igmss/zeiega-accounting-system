"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatCurrency } from "@/lib/utils"

interface SalesOrderDetailsProps {
  order: {
    id: string
    website_order_id: string
    customer_id: string
    customer_name: string
    items: Array<{
      sku: string
      qty: number
      unit_price: number
    }>
    total: number
    status: string
    created_at: Date
  }
}

export function SalesOrderDetails({ order }: SalesOrderDetailsProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="destructive">Pending</Badge>
      case "producing":
        return <Badge variant="secondary">Producing</Badge>
      case "completed":
        return <Badge variant="default">Completed</Badge>
      case "invoiced":
        return <Badge variant="outline">Invoiced</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Order Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order ID:</span>
              <span className="font-medium">{order.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Website Order:</span>
              <span className="font-medium">{order.website_order_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              {getStatusBadge(order.status)}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span className="font-medium">
                {order.created_at 
                  ? ((order.created_at as any).toDate ? (order.created_at as any).toDate() : new Date(order.created_at)).toLocaleDateString()
                  : 'N/A'
                }
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer ID:</span>
              <span className="font-medium">{order.customer_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{order.customer_name}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {order.items.map((item, index) => (
              <div key={index}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{item.sku}</div>
                    <div className="text-sm text-muted-foreground">
                      Quantity: {item.qty} × {formatCurrency(item.unit_price)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(item.qty * item.unit_price)}</div>
                  </div>
                </div>
                {index < order.items.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}

            <Separator />

            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total:</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
