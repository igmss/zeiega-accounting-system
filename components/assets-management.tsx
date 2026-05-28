"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Search, Landmark, Calendar, PlusCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"
// Import both CHART_OF_ACCOUNTS and enums
import { CHART_OF_ACCOUNTS, AccountType, AccountSubType } from "@/lib/accounting/account-types"

interface Asset {
    id: string
    date: string
    description: string
    amount: number
    assetAccount: string
    paymentAccount: string
    useful_life_years?: number
    salvage_value?: number
    depreciation_method?: string
    accumulatedDepreciation?: number
    bookValue?: number
}

export function AssetsManagement() {
    const [assets, setAssets] = useState<Asset[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    // Form state
    const [newAsset, setNewAsset] = useState({
        date: new Date().toISOString().split('T')[0],
        description: "",
        amount: "",
        assetAccount: "",
        paymentMethod: "",
        useful_life_years: "",
        salvage_value: "0"
    })
    
    const [selectedAssetForDepreciation, setSelectedAssetForDepreciation] = useState<Asset | null>(null)
    const [isDepreciationDialogOpen, setIsDepreciationDialogOpen] = useState(false)
    const [depreciationLoading, setDepreciationLoading] = useState(false)

    // Get ALL asset accounts from COA (User requested full visibility including Cash/Receivables)
    const assetAccounts = Object.values(CHART_OF_ACCOUNTS).filter(
        acc => acc.type === AccountType.ASSET && acc.isActive !== false
    )

    useEffect(() => {
        fetchAssets()
    }, [])

    async function fetchAssets() {
        try {
            setLoading(true)
            const response = await fetch('/api/accounting/assets')
            if (response.ok) {
                const data = await response.json()
                setAssets(data.assets || [])
            }
        } catch (error) {
            console.error("Failed to fetch assets:", error)
        } finally {
            setLoading(false)
        }
    }

    async function handleAddAsset() {
        if (!newAsset.amount || !newAsset.assetAccount || !newAsset.paymentMethod) return

        try {
            const response = await fetch('/api/accounting/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newAsset,
                    amount: parseFloat(newAsset.amount),
                    useful_life_years: newAsset.useful_life_years ? parseInt(newAsset.useful_life_years) : null,
                    salvage_value: parseFloat(newAsset.salvage_value || "0")
                })
            })

            if (response.ok) {
                setIsAddDialogOpen(false)
                fetchAssets()
                setNewAsset({
                    date: new Date().toISOString().split('T')[0],
                    description: "",
                    amount: "",
                    assetAccount: "",
                    paymentMethod: "",
                    useful_life_years: "",
                    salvage_value: "0"
                })
            }
        } catch (error) {
            console.error("Failed to add asset:", error)
        }
    }

    async function handleRecordDepreciation(asset: Asset) {
        try {
            setDepreciationLoading(true)
            const response = await fetch('/api/accounting/assets/depreciate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetEntryId: asset.id,
                    year: new Date().getFullYear(),
                    month: new Date().getMonth()
                })
            })

            if (response.ok) {
                fetchAssets()
                setIsDepreciationDialogOpen(false)
                toast.success("Depreciation recorded successfully")
            } else {
                const error = await response.json()
                toast.error("Failed to record depreciation")
            }
        } catch (error) {
            console.error("Failed to record depreciation:", error)
        } finally {
            setDepreciationLoading(false)
        }
    }

    const filteredAssets = assets.filter(asset =>
        asset.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (CHART_OF_ACCOUNTS[asset.assetAccount]?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
    )

    const totalAssets = filteredAssets.reduce((sum, asset) => sum + asset.amount, 0)

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalAssets)}</div>
                        <p className="text-xs text-muted-foreground">Acquistion cost of filtered assets</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Net Book Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(filteredAssets.reduce((sum, a) => sum + (a.bookValue || a.amount), 0))}
                        </div>
                        <p className="text-xs text-muted-foreground">Current value after depreciation</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search assets..."
                        className="pl-8 max-w-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> Add Asset
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Record New Asset</DialogTitle>
                            <DialogDescription>
                                Enter details for the new asset acquisition. This will create a journal entry activating the asset.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Acquisition Date</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="date"
                                            className="pl-8"
                                            value={newAsset.date}
                                            onChange={(e) => setNewAsset({ ...newAsset, date: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Cost Amount</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            className="pl-7"
                                            value={newAsset.amount}
                                            onChange={(e) => setNewAsset({ ...newAsset, amount: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Asset Description / Name</Label>
                                <Input
                                    placeholder="e.g. MacBook Pro M2 - Serial #12345"
                                    value={newAsset.description}
                                    onChange={(e) => setNewAsset({ ...newAsset, description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Asset Account</Label>
                                <Select
                                    value={newAsset.assetAccount}
                                    onValueChange={(val) => setNewAsset({ ...newAsset, assetAccount: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select asset category" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                        {assetAccounts.map(acc => (
                                            <SelectItem key={acc.code} value={acc.code}>
                                                {acc.code} - {acc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Useful Life (Years)</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 5"
                                        value={newAsset.useful_life_years}
                                        onChange={(e) => setNewAsset({ ...newAsset, useful_life_years: e.target.value })}
                                    />
                                    <p className="text-[10px] text-muted-foreground">Empty for non-depreciable</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Salvage Value</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={newAsset.salvage_value}
                                        onChange={(e) => setNewAsset({ ...newAsset, salvage_value: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Payment Method</Label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['bank', 'cash', 'payable', 'equity'].map((type) => (
                                        <Button
                                            key={type}
                                            type="button"
                                            variant={newAsset.paymentMethod === type ? "default" : "outline"}
                                            size="sm"
                                            className="px-2"
                                            onClick={() => setNewAsset({ ...newAsset, paymentMethod: type })}
                                        >
                                            {type.charAt(0).toUpperCase() + type.slice(1)}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleAddAsset}>Record Asset</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Assets History</CardTitle>
                    <CardDescription>All recorded asset acquisitions</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Asset Description</TableHead>
                                <TableHead>Asset Category</TableHead>
                                <TableHead className="text-right">Cost</TableHead>
                                <TableHead className="text-right">Accumulated</TableHead>
                                <TableHead className="text-right">Book Value</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading assets...</TableCell>
                                </TableRow>
                            ) : filteredAssets.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No assets found</TableCell>
                                </TableRow>
                            ) : (
                                filteredAssets.map((asset, i) => {
                                    const accountName = CHART_OF_ACCOUNTS[asset.assetAccount]?.name || asset.assetAccount
                                    return (
                                        <TableRow key={asset.id || i}>
                                            <TableCell>{new Date(asset.date).toLocaleDateString()}</TableCell>
                                            <TableCell className="font-medium">{asset.description}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{accountName}</span>
                                                    <span className="text-xs text-muted-foreground">{asset.assetAccount}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">{formatCurrency(asset.amount)}</TableCell>
                                            <TableCell className="text-right text-red-500">{formatCurrency(asset.accumulatedDepreciation || 0)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(asset.bookValue || asset.amount)}</TableCell>
                                            <TableCell className="text-right">
                                                {asset.useful_life_years ? (
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm"
                                                        onClick={() => {
                                                            setSelectedAssetForDepreciation(asset)
                                                            setIsDepreciationDialogOpen(true)
                                                        }}
                                                    >
                                                        Depreciation
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Non-depr.</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Depreciation Schedule Dialog */}
            <Dialog open={isDepreciationDialogOpen} onOpenChange={setIsDepreciationDialogOpen}>
                <DialogContent className="sm:max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>Depreciation Management</DialogTitle>
                        <DialogDescription>
                            Schedule and manual recording for {selectedAssetForDepreciation?.description}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedAssetForDepreciation && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4 text-sm border p-3 rounded-lg bg-muted/30">
                                <div>
                                    <p className="text-muted-foreground">Original Cost</p>
                                    <p className="font-bold">{formatCurrency(selectedAssetForDepreciation.amount)}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Useful Life</p>
                                    <p className="font-bold">{selectedAssetForDepreciation.useful_life_years} Years</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Monthly Amount</p>
                                    <p className="font-bold">
                                        {formatCurrency((selectedAssetForDepreciation.amount - (selectedAssetForDepreciation.salvage_value || 0)) / (selectedAssetForDepreciation.useful_life_years! * 12))}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex justify-between items-center">
                                <h3 className="font-semibold">Depreciation Schedule</h3>
                                <Button 
                                    size="sm" 
                                    onClick={() => handleRecordDepreciation(selectedAssetForDepreciation)}
                                    disabled={depreciationLoading}
                                >
                                    Record {new Date().toLocaleDateString('en', { month: 'short', year: 'numeric' })} Depreciation
                                </Button>
                            </div>

                            <div className="border rounded-md overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>Month</TableHead>
                                            <TableHead className="text-right">Depreciation</TableHead>
                                            <TableHead className="text-right">Accumulated</TableHead>
                                            <TableHead className="text-right">Book Value</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {Array.from({ length: 6 }).map((_, i) => {
                                            const now = new Date()
                                            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
                                            const cost = selectedAssetForDepreciation.amount
                                            const salvage = selectedAssetForDepreciation.salvage_value || 0
                                            const lifeMonths = selectedAssetForDepreciation.useful_life_years! * 12
                                            const monthly = (cost - salvage) / lifeMonths
                                            
                                            return (
                                                <TableRow key={i} className={i === 0 ? "bg-primary/5 font-medium" : ""}>
                                                    <TableCell>{monthDate.toLocaleDateString('en', { month: 'short', year: 'numeric' })}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(monthly)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(monthly * (i + 1))}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(cost - (monthly * (i + 1)))}</TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-xs text-muted-foreground p-2">
                                                Displaying recent periods...
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDepreciationDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
