"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, TrendingUp, TrendingDown, RotateCcw, Settings } from "lucide-react"

export function InventoryMovements() {
  const [movements, setMovements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filteredMovements, setFilteredMovements] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")

  // Fetch inventory movements from Firestore
  useEffect(() => {
    async function fetchInventoryMovements() {
      try {
        const response = await fetch('/api/inventory-movements')
        if (!response.ok) {
          throw new Error('Failed to fetch inventory movements')
        }
        const movementsData = await response.json()
        setMovements(movementsData)
      } catch (error) {
        console.error("Error loading inventory movements:", error)
        setMovements([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchInventoryMovements()
  }, [])

  useEffect(() => {
    const filtered = movements.filter((movement) => {
      const matchesSearch =
        (movement.item_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (movement.item_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        movement.related_doc?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesType = typeFilter === "all" || movement.type === typeFilter

      return matchesSearch && matchesType
    })
    
    setFilteredMovements(filtered)
  }, [movements, searchTerm, typeFilter])

  const getMovementIcon = (type: string, qty: number) => {
    if (qty > 0) {
      return <TrendingUp className="h-4 w-4 text-green-500" />
    } else {
      return <TrendingDown className="h-4 w-4 text-red-500" />
    }
  }

  const getMovementBadge = (type: string) => {
    switch (type) {
      case "issue":
        return <Badge variant="destructive">Issue</Badge>
      case "receipt":
        return <Badge variant="default">Receipt</Badge>
      case "return":
        return <Badge variant="secondary">Return</Badge>
      case "adjustment":
        return <Badge variant="outline">Adjustment</Badge>
      default:
        return <Badge>{type}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{movements.filter((m) => m.qty > 0).length}</div>
                <div className="text-sm text-muted-foreground">Receipts Today</div>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{movements.filter((m) => m.qty < 0).length}</div>
                <div className="text-sm text-muted-foreground">Issues Today</div>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{movements.filter((m) => m.type === "return").length}</div>
                <div className="text-sm text-muted-foreground">Returns Today</div>
              </div>
              <RotateCcw className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{movements.filter((m) => m.type === "adjustment").length}</div>
                <div className="text-sm text-muted-foreground">Adjustments Today</div>
              </div>
              <Settings className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Movements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items, SKUs, or documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="issue">Issues</SelectItem>
                <SelectItem value="receipt">Receipts</SelectItem>
                <SelectItem value="return">Returns</SelectItem>
                <SelectItem value="adjustment">Adjustments</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Movements Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-3/4 mx-auto"></div>
                <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
                <div className="h-4 bg-muted rounded w-2/3 mx-auto"></div>
              </div>
              <p className="text-muted-foreground mt-4">Loading inventory movements...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date/Time</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Related Document</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {movement.created_at 
                          ? (() => {
                              const d = typeof movement.created_at === 'string'
                                ? new Date(movement.created_at)
                                : movement.created_at.seconds
                                  ? new Date(movement.created_at.seconds * 1000)
                                  : new Date(movement.created_at)
                              return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString()
                            })()
                          : 'N/A'
                        }
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {movement.created_at 
                          ? (() => {
                              const d = typeof movement.created_at === 'string'
                                ? new Date(movement.created_at)
                                : movement.created_at.seconds
                                  ? new Date(movement.created_at.seconds * 1000)
                                  : new Date(movement.created_at)
                              return isNaN(d.getTime()) ? '' : d.toLocaleTimeString()
                            })()
                          : ''
                        }
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{movement.item_id}</div>
                      <div className="text-sm text-muted-foreground">{movement.item_name}</div>
                    </div>
                  </TableCell>
                  <TableCell>{getMovementBadge(movement.type)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getMovementIcon(movement.type, movement.qty)}
                      <span className={`font-medium ${movement.qty > 0 ? "text-green-600" : "text-red-600"}`}>
                        {movement.qty > 0 ? "+" : ""}
                        {movement.qty}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{movement.related_doc || "N/A"}</span>
                  </TableCell>
                  <TableCell>{movement.user}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
