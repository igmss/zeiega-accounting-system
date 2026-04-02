"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useRouter } from "next/navigation"
import { formatCurrency } from "@/lib/utils"
// import { toast } from "sonner" // Assuming UseToast or similar exists, but I'll use basic alert if not sure

export default function OpeningBalancesPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        cashOnHand: 0,
        bankAccounts: [{ id: 1, name: "Main Bank Account", accountId: "1103", amount: 0 }],
        receivables: 0,
        inventory: {
            rawMaterials: 0,
            wip: 0,
            finishedGoods: 0
        },
        fixedAssets: {
            machinery: 0,
            equipment: 0,
            office: 0,
            furniture: 0,
            vehicles: 0
        },
        digitalAssets: {
            domains: 0,
            software: 0,
            ip: 0,
            crypto: 0
        },
        partnerCapital: {
            ahmed: 0,
            ibrahim: 0,
            fathy: 0
        },
        rebalancingEnabled: false,
        loans: [] as any[], // Can add more inputs for Loans
        liabilities: {
            accountsPayable: 0,
            accruedExpenses: 0
        },
        otherLiabilities: [] as any[]
    })

    const handleBankChange = (index: number, val: string) => {
        const newBanks = [...formData.bankAccounts]
        newBanks[index].amount = parseFloat(val) || 0
        setFormData({ ...formData, bankAccounts: newBanks })
    }

    // Add loan helper
    const addLoan = () => {
        setFormData({
            ...formData,
            loans: [...formData.loans, { id: Date.now(), name: "Loan Provider", accountId: "2201", amount: 0 }]
        })
    }

    const updateLoan = (index: number, field: string, val: string) => {
        const newLoans = [...formData.loans]
        if (field === 'amount') newLoans[index].amount = parseFloat(val) || 0
        else newLoans[index][field] = val
        setFormData({ ...formData, loans: newLoans })
    }

    async function handleSubmit() {
        try {
            setLoading(true)
            const response = await fetch('/api/accounting/opening-balances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            if (response.ok) {
                // success
                alert("Opening balances recorded successfully!")
                router.push('/dashboard')
            } else {
                alert("Failed to record opening balances.")
            }
        } catch (error) {
            console.error(error)
            alert("Error submitting form")
        } finally {
            setLoading(false)
        }
    }

    const totalAssets = 
        formData.cashOnHand + 
        formData.bankAccounts.reduce((sum, b) => sum + b.amount, 0) +
        formData.receivables +
        formData.inventory.rawMaterials +
        formData.inventory.wip +
        formData.inventory.finishedGoods +
        formData.fixedAssets.machinery +
        formData.fixedAssets.equipment +
        formData.fixedAssets.office +
        formData.fixedAssets.furniture +
        formData.fixedAssets.vehicles +
        formData.digitalAssets.domains +
        formData.digitalAssets.software +
        formData.digitalAssets.ip +
        formData.digitalAssets.crypto

    const totalLiabilities = 
        formData.loans.reduce((sum, l) => sum + l.amount, 0) +
        formData.liabilities.accountsPayable +
        formData.liabilities.accruedExpenses +
        formData.otherLiabilities.reduce((sum, l) => sum + l.amount, 0)

    const totalPartnerCapital = 
        formData.partnerCapital.ahmed + 
        formData.partnerCapital.ibrahim + 
        formData.partnerCapital.fathy

    const projectedEquity = totalAssets - totalLiabilities

    return (
        <div className="container mx-auto py-10 max-w-3xl">
            <h1 className="text-3xl font-bold mb-6">System Setup: Opening Balances</h1>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>1. General Information</CardTitle>
                    <CardDescription>When are these balances effective from?</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label>Cut-off Date</Label>
                        <Input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>2. Cash & Bank</CardTitle>
                    <CardDescription>Enter your liquid funds.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Cash on Hand (Safe)</Label>
                        <Input
                            type="number"
                            value={formData.cashOnHand}
                            onChange={(e) => setFormData({ ...formData, cashOnHand: parseFloat(e.target.value) || 0 })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Bank Accounts</Label>
                        {formData.bankAccounts.map((bank, i) => (
                            <div key={bank.id} className="flex gap-2 items-center">
                                <Input value={bank.name} disabled className="w-1/2" />
                                <Input
                                    type="number"
                                    value={bank.amount}
                                    onChange={(e) => handleBankChange(i, e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>3. Receivables</CardTitle>
                    <CardDescription>Money customers owe you.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label>Accounts Receivable (1110)</Label>
                        <Input
                            type="number"
                            value={formData.receivables}
                            onChange={(e) => setFormData({ ...formData, receivables: parseFloat(e.target.value) || 0 })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>4. Inventory</CardTitle>
                    <CardDescription>Value of stock on hand.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Raw Materials (1201)</Label>
                        <Input
                            type="number"
                            value={formData.inventory.rawMaterials}
                            onChange={(e) => setFormData({ ...formData, inventory: { ...formData.inventory, rawMaterials: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>WIP Inventory (1210)</Label>
                        <Input
                            type="number"
                            value={formData.inventory.wip}
                            onChange={(e) => setFormData({ ...formData, inventory: { ...formData.inventory, wip: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Finished Goods (1220)</Label>
                        <Input
                            type="number"
                            value={formData.inventory.finishedGoods}
                            onChange={(e) => setFormData({ ...formData, inventory: { ...formData.inventory, finishedGoods: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>5. Fixed Assets</CardTitle>
                    <CardDescription>Value of physical equipment and furniture.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Production Machinery (1301)</Label>
                        <Input
                            type="number"
                            value={formData.fixedAssets.machinery}
                            onChange={(e) => setFormData({ ...formData, fixedAssets: { ...formData.fixedAssets, machinery: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Production Equipment (1302)</Label>
                        <Input
                            type="number"
                            value={formData.fixedAssets.equipment}
                            onChange={(e) => setFormData({ ...formData, fixedAssets: { ...formData.fixedAssets, equipment: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Office Equipment (1303)</Label>
                        <Input
                            type="number"
                            value={formData.fixedAssets.office}
                            onChange={(e) => setFormData({ ...formData, fixedAssets: { ...formData.fixedAssets, office: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Furniture & Fixtures (1304)</Label>
                        <Input
                            type="number"
                            value={formData.fixedAssets.furniture}
                            onChange={(e) => setFormData({ ...formData, fixedAssets: { ...formData.fixedAssets, furniture: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Vehicles (1305)</Label>
                        <Input
                            type="number"
                            value={formData.fixedAssets.vehicles}
                            onChange={(e) => setFormData({ ...formData, fixedAssets: { ...formData.fixedAssets, vehicles: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>6. Digital Assets</CardTitle>
                    <CardDescription>Value of websites, software, and IP.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Domain Names & Websites (1451)</Label>
                        <Input
                            type="number"
                            value={formData.digitalAssets.domains}
                            onChange={(e) => setFormData({ ...formData, digitalAssets: { ...formData.digitalAssets, domains: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Software Licenses (1452)</Label>
                        <Input
                            type="number"
                            value={formData.digitalAssets.software}
                            onChange={(e) => setFormData({ ...formData, digitalAssets: { ...formData.digitalAssets, software: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Digital Designs & IP (1453)</Label>
                        <Input
                            type="number"
                            value={formData.digitalAssets.ip}
                            onChange={(e) => setFormData({ ...formData, digitalAssets: { ...formData.digitalAssets, ip: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Cryptocurrency Holdings (1454)</Label>
                        <Input
                            type="number"
                            value={formData.digitalAssets.crypto}
                            onChange={(e) => setFormData({ ...formData, digitalAssets: { ...formData.digitalAssets, crypto: parseFloat(e.target.value) || 0 } })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-6 border-blue-200 bg-blue-50/30">
                <CardHeader>
                    <CardTitle>7. Partner Capital Contributions</CardTitle>
                    <CardDescription>Enter the initial equity or asset contributions from each partner.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Ahmed Capital (Capital + Machines)</Label>
                            <Input
                                type="number"
                                value={formData.partnerCapital.ahmed}
                                onChange={(e) => setFormData({ ...formData, partnerCapital: { ...formData.partnerCapital, ahmed: parseFloat(e.target.value) || 0 } })}
                                className="border-blue-300"
                            />
                            <p className="text-[10px] text-muted-foreground">Incl. OB-01 Machine Contribution</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Ibrahim Capital (Cash)</Label>
                            <Input
                                type="number"
                                value={formData.partnerCapital.ibrahim}
                                onChange={(e) => setFormData({ ...formData, partnerCapital: { ...formData.partnerCapital, ibrahim: parseFloat(e.target.value) || 0 } })}
                                className="border-blue-300"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fathy Capital (Cash)</Label>
                            <Input
                                type="number"
                                value={formData.partnerCapital.fathy}
                                onChange={(e) => setFormData({ ...formData, partnerCapital: { ...formData.partnerCapital, fathy: parseFloat(e.target.value) || 0 } })}
                                className="border-blue-300"
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 border-t pt-4">
                        <Switch 
                            id="rebalance-toggle" 
                            checked={formData.rebalancingEnabled}
                            onCheckedChange={(val) => setFormData({ ...formData, rebalancingEnabled: val })}
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="rebalance-toggle" className="text-sm font-medium leading-none">
                                Generate Capital Rebalancing Entry (OB-06)
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Align accounts to 60/ Ahmed, 25% Ibrahim, 15% Fathy structure.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>8. Loans & Liabilities</CardTitle>
                    <CardDescription>Money you owe to lenders and vendors.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4 mb-4">
                        <div className="space-y-2">
                            <Label>Accounts Payable (2101)</Label>
                            <Input
                                type="number"
                                value={formData.liabilities.accountsPayable}
                                onChange={(e) => setFormData({ ...formData, liabilities: { ...formData.liabilities, accountsPayable: parseFloat(e.target.value) || 0 } })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Accrued Expenses (2140)</Label>
                            <Input
                                type="number"
                                value={formData.liabilities.accruedExpenses}
                                onChange={(e) => setFormData({ ...formData, liabilities: { ...formData.liabilities, accruedExpenses: parseFloat(e.target.value) || 0 } })}
                            />
                        </div>
                    </div>

                    <Label>Additional Loans</Label>
                    {formData.loans.map((loan, i) => (
                        <div key={loan.id} className="flex gap-2 items-end mb-2">
                            <div className="space-y-1 flex-1">
                                <Label>Lender Name</Label>
                                <Input
                                    value={loan.name}
                                    onChange={(e) => updateLoan(i, 'name', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1 w-32">
                                <Label>Amount</Label>
                                <Input
                                    type="number"
                                    value={loan.amount}
                                    onChange={(e) => updateLoan(i, 'amount', e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                    <Button variant="outline" onClick={addLoan} size="sm">
                        + Add Loan
                    </Button>
                </CardContent>
            </Card>

            <Card className="mb-6 bg-secondary/20">
                <CardHeader>
                    <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex justify-between">
                        <span>Total Assets:</span>
                        <span className="font-bold text-green-600">{formatCurrency(totalAssets)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Total Liabilities:</span>
                        <span className="font-bold text-red-600">{formatCurrency(totalLiabilities)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                        <span>Asset-Liability Gap:</span>
                        <span className="font-bold">{formatCurrency(projectedEquity)}</span>
                    </div>
                    <div className="flex justify-between text-blue-600">
                        <span>Entered Partner Capital:</span>
                        <span className="font-bold">{formatCurrency(totalPartnerCapital)}</span>
                    </div>
                    
                    <div className="border-t pt-2 mt-2 flex justify-between">
                        <span>Unallocated Difference:</span>
                        <span className={`font-bold ${Math.abs(projectedEquity - totalPartnerCapital) > 1 ? 'text-red-500' : 'text-green-600'}`}>
                            {formatCurrency(projectedEquity - totalPartnerCapital)}
                        </span>
                    </div>

                    {Math.abs(projectedEquity - totalPartnerCapital) > 1 && (
                        <p className="text-xs text-red-500 mt-2">
                            Warning: Your entered assets and liabilities do not match your partner capital contributions. 
                            The system will record the difference in {projectedEquity - totalPartnerCapital > 0 ? "Retained Earnings" : "Suspense"}.
                        </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground mt-2">
                        Note: This form will record specific opening journal entries (OB-01 to OB-06) based on your inputs.
                    </p>
                </CardContent>
            </Card>

            <div className="flex gap-4 justify-end">
                <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={loading}>
                    {loading ? "Recording..." : "Save Opening Balances"}
                </Button>
            </div>
        </div>
    )
}
