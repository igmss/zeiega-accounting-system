import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { ACCOUNTS } from "./enhanced-accounting-service"
import { JournalEntryType, JournalEntryService, JournalLine } from "./journal-entry-service"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"

export class InventoryAccountingService {
    static async updateInventoryValuations() {
        const updated: string[] = []
        const lowStockAlerts: string[] = []

        try {
            const { data: inventorySnapshot } = await getServiceSupabase()
                .from(TABLES.INVENTORY_ITEMS)
                .select("*")

            if (!inventorySnapshot) return { updated, lowStockAlerts }

            for (const item of inventorySnapshot) {
                if (item.qty_on_hand <= (item.reorder_point || 10)) {
                    lowStockAlerts.push(`${item.sku}: ${item.qty_on_hand} units remaining`)
                }

                const updatedValue = item.qty_on_hand * (item.unit_cost || 0)

                await getServiceSupabase()
                    .from(TABLES.INVENTORY_ITEMS)
                    .update({
                        total_value: updatedValue,
                        last_updated: new Date().toISOString(),
                    })
                    .eq("id", item.id)

                updated.push(item.sku)
            }
        } catch (error) {
            console.error("Error updating inventory:", error)
        }

        return { updated, lowStockAlerts }
    }

    static async adjustInventory(
        sku: string,
        quantity: number,
        type: "issue" | "receipt" | "return" | "adjustment",
    ) {
        const { data: inventoryDoc, error } = await getServiceSupabase()
            .from(TABLES.INVENTORY_ITEMS)
            .select("*")
            .eq("id", sku)
            .single()

        if (inventoryDoc) {
            const currentQty = inventoryDoc.qty_on_hand || 0
            const newQty = type === "issue" ? currentQty - quantity : currentQty + quantity

            await getServiceSupabase()
                .from(TABLES.INVENTORY_ITEMS)
                .update({
                    qty_on_hand: Math.max(0, newQty),
                    last_movement: new Date().toISOString(),
                })
                .eq("id", sku)

            const movementId = `MOV-${Date.now()}`
            await getServiceSupabase()
                .from(TABLES.INVENTORY_MOVEMENTS)
                .upsert({
                    id: movementId,
                    sku,
                    type,
                    quantity,
                    previous_qty: currentQty,
                    new_qty: Math.max(0, newQty),
                    date: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                }, { onConflict: "id" })
        }
    }

    static async recordMaterialIssue(
        workOrderId: string,
        materials: Array<{ itemId: string; itemName: string; quantity: number; unitCost: number }>
    ): Promise<{ success: boolean; entryId?: string; totalCost?: number; error?: string }> {
        const totalCost = materials.reduce((sum, m) => sum + (m.quantity * m.unitCost), 0)

        if (totalCost <= 0) {
            return { success: false, error: "Total material cost must be positive" }
        }

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.WIP_MATERIALS,
                accountName: "WIP - Direct Materials",
                debit: totalCost,
                credit: 0,
                description: `Materials issued to WO: ${workOrderId}`,
            },
            {
                accountCode: ACCOUNTS.INVENTORY_RAW_MATERIALS,
                accountName: "Raw Materials Inventory",
                debit: 0,
                credit: totalCost,
                description: `Materials issued: ${materials.map(m => m.itemName).join(", ")}`,
            },
        ]

        const result = await JournalEntryService.createJournalEntry(
            JournalEntryType.MATERIAL_ISSUE_TO_WIP,
            lines,
            workOrderId,
            `Material issue for work order ${workOrderId}`
        )

        return { ...result, totalCost }
    }

    static async recordInventoryWriteDown(
        sku: string,
        currentCost: number,
        netRealisableValue: number,
        quantityOnHand: number,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; writeDownAmount?: number; error?: string }> {
        if (netRealisableValue >= currentCost) {
            return { success: true, writeDownAmount: 0 }
        }
        if (quantityOnHand <= 0) {
            return { success: false, error: "Quantity on hand must be positive" }
        }

        const writeDownAmount = Math.round((currentCost - netRealisableValue) * quantityOnHand * 100) / 100

        const lines: JournalLine[] = [
            {
                accountCode: ACCOUNT_CODES.INVENTORY_WRITEDOWN_NRV,
                accountName: getAccountName(ACCOUNT_CODES.INVENTORY_WRITEDOWN_NRV),
                debit: writeDownAmount,
                credit: 0,
                description: `NRV write-down: ${sku} — cost ${formatCurrency(currentCost)}/unit, NRV ${formatCurrency(netRealisableValue)}/unit × ${quantityOnHand} units`,
            },
            {
                accountCode: ACCOUNT_CODES.ALLOWANCE_INVENTORY_OBSOLESCENCE,
                accountName: getAccountName(ACCOUNT_CODES.ALLOWANCE_INVENTORY_OBSOLESCENCE),
                debit: 0,
                credit: writeDownAmount,
                description: `Provision for inventory obsolescence: ${sku}`,
            },
        ]

        return {
            ...await JournalEntryService.createJournalEntry(
                JournalEntryType.INVENTORY_WRITEDOWN,
                lines,
                `NRV-${sku}-${Date.now()}`,
                `IAS 2.9 NRV write-down for ${sku}: ${formatCurrency(writeDownAmount)}`,
                userId
            ),
            writeDownAmount,
        }
    }

    static async recordInventoryAdjustmentEntry(
        itemName: string,
        itemCategory: string,
        actualAdjustment: number,
        adjustmentValue: number,
        reason: string,
        userId: string = "system"
    ): Promise<{ success: boolean; entryId?: string; error?: string }> {
        if (adjustmentValue <= 0) {
            return { success: true }
        }

        const isOpeningBalance = reason.toLowerCase().includes('opening') || reason.toLowerCase().includes('initial')

        let contraAccountId = "5301"
        if (isOpeningBalance) {
            contraAccountId = "3001"
        } else if (actualAdjustment < 0) {
            contraAccountId = "6207"
        } else if (actualAdjustment > 0) {
            contraAccountId = "6208"
        }

        const assetAccountId = itemCategory === "accessories" ? "1202" : "1201"

        const lines: JournalLine[] = [
            {
                accountCode: assetAccountId,
                accountName: getAccountName(assetAccountId),
                debit: actualAdjustment > 0 ? adjustmentValue : 0,
                credit: actualAdjustment < 0 ? adjustmentValue : 0,
                description: `Inventory: ${itemName} - ${actualAdjustment > 0 ? '+' : ''}${actualAdjustment} units`,
            },
            {
                accountCode: contraAccountId,
                accountName: getAccountName(contraAccountId),
                debit: actualAdjustment < 0 ? adjustmentValue : 0,
                credit: actualAdjustment > 0 ? adjustmentValue : 0,
                description: `Adjustment: ${reason}`,
            },
        ]

        return JournalEntryService.createJournalEntry(
            JournalEntryType.INVENTORY_ADJUSTMENT,
            lines,
            `ADJ-${Date.now()}`,
            `Inventory adjustment: ${itemName} (${reason})`,
            userId
        )
    }
}
