"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { JournalEntryForm } from "@/components/journal-entry-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, ChevronDown, ChevronRight, FileText } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface JournalEntry {
  id: string
  type: string
  date: string
  memo: string
  description: string
  reference: string | null
  entries: Array<{
    account_id: string
    account_name: string
    description: string
    debit: number
    credit: number
  }>
  total_debits: number
  total_credits: number
  created_at: string
  created_by: string
  voided?: boolean
}

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  // Pagination states
  const [cursors, setCursors] = useState<string[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true)
      const cursorParam = currentCursor ? `&cursor=${currentCursor}` : ""
      const response = await fetch(`/api/journal-entries?limit=50${cursorParam}`)
      if (response.ok) {
        const data = await response.json()
        setEntries(data.entries || [])
        setNextCursor(data.nextCursor || null)
        setHasMore(data.hasMore || false)
      }
    } catch (err) {
      console.error("Error fetching journal entries:", err)
    } finally {
      setLoading(false)
    }
  }, [currentCursor])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const toggleExpand = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setCursors([])
    setCurrentCursor(null)
    fetchEntries()
  }

  const filteredEntries = entries.filter(e =>
    !e.voided &&
    (e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
     (e.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
     e.type.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const getTypeBadge = (type: string) => {
    const colorMap: Record<string, string> = {
      "SALES_INVOICE": "bg-green-500",
      "SALES_COGS": "bg-green-400",
      "PAYMENT_RECEIVED": "bg-blue-500",
      "PAYMENT_MADE": "bg-orange-500",
      "MATERIAL_ISSUE_TO_WIP": "bg-purple-500",
      "MATERIAL_RECEIPT": "bg-teal-500",
      "LABOR_APPLIED": "bg-indigo-500",
      "OVERHEAD_APPLIED": "bg-pink-500",
      "WIP_TO_FINISHED_GOODS": "bg-amber-500",
      "SALES_RETURN": "bg-red-500",
      "INVENTORY_ADJUSTMENT": "bg-gray-500",
      "DEPRECIATION": "bg-slate-500",
      "GENERAL": "bg-gray-600",
      "CLOSING_ENTRY": "bg-yellow-600",
    }
    return (
      <Badge className={colorMap[type] || "bg-gray-500"}>
        {(type || "UNKNOWN").replace(/_/g, " ")}
      </Badge>
    )
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 space-y-4">
          <h1 className="text-3xl font-bold">Journal Entries</h1>
          <div className="animate-pulse space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Journal Entries</h1>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            {showForm ? "Cancel" : "New Entry"}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                New Journal Entry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JournalEntryForm
                onSuccess={handleFormSuccess}
                onCancel={() => setShowForm(false)}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Entries</CardTitle>
              <div className="relative w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, description, or type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No journal entries found.</p>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map((entry) => {
                  const isExpanded = expandedEntries.has(entry.id)
                  return (
                    <div key={entry.id} className="border rounded-lg">
                      <button
                        onClick={() => toggleExpand(entry.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          )}
                          <div>
                            <div className="font-medium text-sm">{entry.id}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-xs">
                              {entry.description || entry.memo || "—"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {getTypeBadge(entry.type)}
                          <span className="text-sm text-muted-foreground">
                            {new Date(entry.date).toLocaleDateString()}
                          </span>
                          <span className="text-sm font-mono">
                            {formatCurrency(entry.total_debits)}
                          </span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t px-4 py-3 bg-muted/20">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Account</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.entries.map((line, i) => (
                                <TableRow key={i}>
                                  <TableCell>
                                    <div className="font-medium text-sm">{line.account_id}</div>
                                    <div className="text-xs text-muted-foreground">{line.account_name}</div>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{line.description}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {line.debit > 0 ? formatCurrency(line.debit) : ""}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {line.credit > 0 ? formatCurrency(line.credit) : ""}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                            <span>Created by: {entry.created_by || "system"}</span>
                            <span>
                              Debits: {formatCurrency(entry.total_debits)} | Credits: {formatCurrency(entry.total_credits)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                
                {/* Pagination Controls */}
                <div className="flex items-center justify-between border-t pt-4 mt-4">
                  <div className="text-xs text-muted-foreground">
                    Page {cursors.length + 1}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const prevCursor = cursors[cursors.length - 2] || null
                        setCursors(prev => prev.slice(0, -1))
                        setCurrentCursor(prevCursor)
                      }}
                      disabled={cursors.length === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (nextCursor) {
                          setCursors(prev => [...prev, nextCursor])
                          setCurrentCursor(nextCursor)
                        }
                      }}
                      disabled={!hasMore}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
