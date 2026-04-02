"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Download, Factory, Package, Users } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useState, useEffect } from "react"

interface COGMReportProps {
    dateRange: {
        from: string
        to: string
    }
}

export function COGMReport({ dateRange }: COGMReportProps) {
    const [reportData, setReportData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchReportData() {
            try {
                setLoading(true)
                const response = await fetch(`/api/reports/cogm?from=${dateRange.from}&to=${dateRange.to}`)
                if (!response.ok) {
                    throw new Error('Failed to fetch COGM report')
                }
                const data = await response.json()
                setReportData(data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }

        fetchReportData()
    }, [dateRange.from, dateRange.to])

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Cost of Goods Manufactured</h2>
                    <div className="animate-pulse bg-muted h-10 w-32 rounded"></div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="animate-pulse bg-muted h-24 rounded"></div>
                    ))}
                </div>
            </div>
        )
    }

    if (error || !reportData) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Cost of Goods Manufactured</h2>
                </div>
                <div className="text-center py-8">
                    <p className="text-muted-foreground">Error loading report: {error}</p>
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
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.direct_materials.materials_used)}</div>
                                <div className="text-sm text-muted-foreground">Direct Materials</div>
                            </div>
                            <Package className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.direct_labor)}</div>
                                <div className="text-sm text-muted-foreground">Direct Labor</div>
                            </div>
                            <Users className="h-8 w-8 text-green-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold">{formatCurrency(reportData.manufacturing_overhead.total)}</div>
                                <div className="text-sm text-muted-foreground">Manufacturing Overhead</div>
                            </div>
                            <Factory className="h-8 w-8 text-purple-500" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold text-green-600">{formatCurrency(reportData.cost_of_goods_manufactured)}</div>
                                <div className="text-sm text-muted-foreground">COGM</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* COGM Statement */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Cost of Goods Manufactured Statement</CardTitle>
                    <Button variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export PDF
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="text-center">
                            <h3 className="text-lg font-bold">TEL U ASEGH - Garment Manufacturing</h3>
                            <p className="text-muted-foreground">
                                Cost of Goods Manufactured for {dateRange.from} to {dateRange.to}
                            </p>
                        </div>

                        <Table>
                            <TableBody>
                                {/* Direct Materials */}
                                <TableRow>
                                    <TableCell className="font-bold">DIRECT MATERIALS</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Beginning Raw Materials Inventory</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.direct_materials.beginning_inventory)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Add: Purchases</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.direct_materials.purchases)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Total Materials Available</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.direct_materials.total_available)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Less: Ending Raw Materials Inventory</TableCell>
                                    <TableCell className="text-right">({formatCurrency(reportData.direct_materials.ending_inventory)})</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow className="border-t">
                                    <TableCell className="font-medium">Direct Materials Used</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-bold">{formatCurrency(reportData.direct_materials.materials_used)}</TableCell>
                                </TableRow>

                                {/* Direct Labor */}
                                <TableRow>
                                    <TableCell className="font-bold pt-6">DIRECT LABOR</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-bold">{formatCurrency(reportData.direct_labor)}</TableCell>
                                </TableRow>

                                {/* Manufacturing Overhead */}
                                <TableRow>
                                    <TableCell className="font-bold pt-6">MANUFACTURING OVERHEAD</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Factory Rent</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.manufacturing_overhead.factory_rent)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Factory Utilities</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.manufacturing_overhead.utilities)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Equipment Depreciation</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.manufacturing_overhead.depreciation)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Machine Maintenance</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.manufacturing_overhead.maintenance)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell className="pl-6">Indirect Labor</TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.manufacturing_overhead.indirect_labor)}</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                                <TableRow className="border-t">
                                    <TableCell className="font-medium">Total Manufacturing Overhead</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-bold">{formatCurrency(reportData.manufacturing_overhead.total)}</TableCell>
                                </TableRow>

                                {/* Total Manufacturing Costs */}
                                <TableRow className="border-t-2">
                                    <TableCell className="font-bold text-lg">TOTAL MANUFACTURING COSTS</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-bold text-lg">{formatCurrency(reportData.total_manufacturing_costs)}</TableCell>
                                </TableRow>

                                {/* WIP Adjustments */}
                                <TableRow>
                                    <TableCell className="pt-4">Add: Beginning Work in Process</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right">{formatCurrency(reportData.wip.beginning)}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>Less: Ending Work in Process</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right">({formatCurrency(reportData.wip.ending)})</TableCell>
                                </TableRow>

                                {/* COGM */}
                                <TableRow className="border-t-4 border-double">
                                    <TableCell className="font-bold text-xl">COST OF GOODS MANUFACTURED</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-bold text-xl text-green-600">
                                        {formatCurrency(reportData.cost_of_goods_manufactured)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
