"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Play, CheckCircle, AlertCircle, RefreshCw } from "lucide-react"

export function ProcessOrdersDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processedCount, setProcessedCount] = useState(0)
  const [results, setResults] = useState<{
    processed: number
    created_sales_orders: number
    created_work_orders: number
    errors: string[]
  } | null>(null)

  const handleProcessOrders = async () => {
    setIsProcessing(true)
    setProgress(0)
    setProcessedCount(0)
    setResults(null)

    // Simulate processing with progress updates
    const totalSteps = 5
    for (let i = 0; i <= totalSteps; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      setProgress((i / totalSteps) * 100)
      setProcessedCount(i * 2) // Simulate processing 2 orders per step
    }

    // Simulate results
    setResults({
      processed: 10,
      created_sales_orders: 8,
      created_work_orders: 8,
      errors: ["Order WEB-005: Missing customer email", "Order WEB-012: Invalid item SKU"],
    })

    setIsProcessing(false)
  }

  const resetDialog = () => {
    setProgress(0)
    setProcessedCount(0)
    setResults(null)
    setIsProcessing(false)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          resetDialog()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Process Website Orders
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Process Website Orders</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Processing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                This will fetch unprocessed orders from the website and create corresponding sales orders and work
                orders in the accounting system.
              </p>

              {!isProcessing && !results && (
                <Button onClick={handleProcessOrders} className="w-full">
                  <Play className="h-4 w-4 mr-2" />
                  Start Processing
                </Button>
              )}

              {isProcessing && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Processing orders...</span>
                    <span className="text-sm text-muted-foreground">{processedCount} processed</span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              )}

              {results && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Processing Complete</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{results.processed}</div>
                        <div className="text-sm text-muted-foreground">Orders Processed</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{results.created_sales_orders}</div>
                        <div className="text-sm text-muted-foreground">Sales Orders Created</div>
                      </CardContent>
                    </Card>
                  </div>

                  {results.errors.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                          Processing Errors
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {results.errors.map((error, index) => (
                            <div key={index} className="text-sm text-muted-foreground">
                              {error}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Button onClick={() => setIsOpen(false)} className="w-full">
                    Close
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
