"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Plus, BookOpen } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface ChartAccount {
  id: string
  name: string
  type: string
  balance: number
  parent_id?: string | null
  isActive?: boolean
  deprecatedReason?: string
}

export function ChartOfAccountsManagement() {
  const [accounts, setAccounts] = useState<ChartAccount[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false)
  const [newAccount, setNewAccount] = useState({
    id: "",
    name: "",
    type: "",
    balance: 0,
    parent_id: null,
    description: ""
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/chart-of-accounts')
        if (!response.ok) {
          throw new Error('Failed to fetch chart of accounts')
        }
        const data = await response.json()
        setAccounts(data.accounts || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleAddAccount = async () => {
    try {
      const response = await fetch('/api/chart-of-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'account',
          data: newAccount
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create account')
      }

      // Reset form
      setNewAccount({
        id: "",
        name: "",
        type: "",
        balance: 0,
        parent_id: null,
        description: ""
      })
      setIsAddAccountOpen(false)

      // Refresh data
      const dataResponse = await fetch('/api/chart-of-accounts')
      if (dataResponse.ok) {
        const data = await dataResponse.json()
        setAccounts(data.accounts || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    }
  }

  const handleInitializeAccounts = async () => {
    if (confirm('This will initialize the chart of accounts with standard accounts. Continue?')) {
      try {
        const response = await fetch('/api/chart-of-accounts/initialize', {
          method: 'POST',
        })

        if (!response.ok) {
          throw new Error('Failed to initialize accounts')
        }

        alert("Chart of accounts initialized successfully!")
        
        // Refresh data
        const dataResponse = await fetch('/api/chart-of-accounts')
        if (dataResponse.ok) {
          const data = await dataResponse.json()
          setAccounts(data.accounts || [])
        }
      } catch (error) {
        console.error("Error initializing accounts:", error)
        alert("Failed to initialize accounts. Please try again.")
      }
    }
  }

  const filteredAccounts = accounts.filter(
    (account) =>
      account.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const getAccountTypeBadge = (type: string, isActive: boolean = true) => {
    if (!isActive) {
      return <Badge variant="outline" className="bg-gray-100 text-gray-400 border-gray-200">Inactive</Badge>
    }
    switch (type) {
      case "asset":
        return <Badge variant="default">Asset</Badge>
      case "liability":
        return <Badge variant="destructive">Liability</Badge>
      case "equity":
        return <Badge variant="secondary">Equity</Badge>
      case "revenue":
        return <Badge className="bg-green-500">Revenue</Badge>
      case "expense":
        return <Badge variant="outline">Expense</Badge>
      default:
        return <Badge>{type}</Badge>
    }
  }

  const totalAssets = accounts.filter((acc) => acc.type === "asset").reduce((sum, acc) => sum + acc.balance, 0)
  const totalLiabilities = accounts.filter((acc) => acc.type === "liability").reduce((sum, acc) => sum + acc.balance, 0)
  const totalRevenue = accounts.filter((acc) => acc.type === "revenue").reduce((sum, acc) => sum + acc.balance, 0)
  const totalExpenses = accounts.filter((acc) => acc.type === "expense").reduce((sum, acc) => sum + acc.balance, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Chart of Accounts</h2>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading chart of accounts...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Chart of Accounts</h2>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Error loading chart of accounts: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{formatCurrency(totalAssets)}</div>
            <div className="text-sm text-muted-foreground">Total Assets</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{formatCurrency(totalLiabilities)}</div>
            <div className="text-sm text-muted-foreground">Total Liabilities</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <div className="text-sm text-muted-foreground">Total Revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
            <div className="text-sm text-muted-foreground">Total Expenses</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Chart of Accounts
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleInitializeAccounts}
                >
                  Initialize Accounts
                </Button>
                <Button onClick={() => setIsAddAccountOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Account
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search accounts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow key={account.id} className={account.isActive === false ? "opacity-60 bg-muted/30" : ""}>
                      <TableCell className="font-medium">
                        <span className={account.isActive === false ? "line-through text-muted-foreground" : ""}>
                          {account.id}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className={account.isActive === false ? "text-muted-foreground" : ""}>
                            {account.name}
                          </span>
                          {account.deprecatedReason && (
                            <span className="text-[10px] text-red-500 italic">
                              {account.deprecatedReason}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getAccountTypeBadge(account.type, account.isActive !== false)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(account.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

      {/* Add Account Dialog */}
      <Dialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Account</DialogTitle>
            <DialogDescription>
              Create a new account in your chart of accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="account-id" className="text-right">
                Account ID
              </Label>
              <Input
                id="account-id"
                value={newAccount.id}
                onChange={(e) => setNewAccount({...newAccount, id: e.target.value})}
                className="col-span-3"
                placeholder="e.g., CASH001"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="account-name" className="text-right">
                Account Name
              </Label>
              <Input
                id="account-name"
                value={newAccount.name}
                onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                className="col-span-3"
                placeholder="e.g., Petty Cash"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="account-type" className="text-right">
                Account Type
              </Label>
                  <Select value={newAccount.type} onValueChange={(value) => setNewAccount({...newAccount, type: value})}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="account-balance" className="text-right">
                Opening Balance
              </Label>
              <Input
                id="account-balance"
                type="number"
                value={newAccount.balance}
                onChange={(e) => setNewAccount({...newAccount, balance: parseFloat(e.target.value) || 0})}
                className="col-span-3"
                placeholder="0.00"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="account-description" className="text-right">
                Description
              </Label>
              <Textarea
                id="account-description"
                value={newAccount.description}
                onChange={(e) => setNewAccount({...newAccount, description: e.target.value})}
                className="col-span-3"
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddAccountOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAccount} disabled={!newAccount.id || !newAccount.name || !newAccount.type}>
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
