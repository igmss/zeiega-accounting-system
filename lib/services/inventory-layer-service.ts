/**
 * Inventory Layer Service — FIFO Cost Tracking (IAS 2.25)
 *
 * Maintains a sub-ledger of cost layers per SKU.
 * Each material receipt creates a new layer. Issues consume layers in
 * chronological order (FIFO), returning the weighted cost of units issued.
 *
 * Integration point:
 *   1. Call `recordReceipt()` when materials arrive (purchase order receipt).
 *   2. Call `issueFromFIFO()` when materials are issued to a work order.
 *      This returns the weighted cost to pass to EnhancedAccountingService.recordMaterialIssue().
 *   3. Call `checkNRV()` periodically (e.g. month-end) to identify write-down candidates.
 */

import { db, COLLECTIONS } from "../firebase"
import type { InventoryLayer } from "../types"
import { FieldValue } from "../firebase"
import { formatCurrency } from "@/lib/utils"

export interface FIFOIssueResult {
  success: boolean
  weightedUnitCost: number   // EGP per unit — pass this to recordMaterialIssue()
  totalCost: number
  layersConsumed: Array<{ layerId: string; quantityUsed: number; unitCost: number }>
  error?: string
}

export class InventoryLayerService {
  private static readonly COLLECTION = COLLECTIONS.INVENTORY_LAYERS

  /**
   * Record a new FIFO cost layer when materials are received.
   * Called after purchase order receipt / GRN.
   */
  static async recordReceipt(
    sku: string,
    quantityReceived: number,
    unitCost: number,
    referenceDoc: string       // purchase order or GRN ID
  ): Promise<{ success: boolean; layerId?: string; error?: string }> {
    if (quantityReceived <= 0) return { success: false, error: "Quantity must be positive" }
    if (unitCost < 0)          return { success: false, error: "Unit cost cannot be negative" }

    try {
      const layerId = `LYR-${sku}-${Date.now()}`
      const layer: InventoryLayer = {
        id: layerId,
        sku,
        receiptDate: new Date(),
        quantityReceived,
        quantityRemaining: quantityReceived,
        unitCost,
        referenceDoc,
        created_at: new Date(),
      }

      await db.collection(this.COLLECTION).doc(layerId).set(layer)
      console.log(`✅ FIFO layer created: ${sku} × ${quantityReceived} @ ${formatCurrency(unitCost)}`)
      return { success: true, layerId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create inventory layer",
      }
    }
  }

  /**
   * Issue materials from FIFO layers for a work order.
   * Consumes oldest layers first. Returns weighted unit cost for journal entry.
   *
   * If layers are insufficient (layer balance < quantity requested), returns an error.
   * Caller should still use a flat unit_cost fallback if layers have not been set up.
   */
  static async issueFromFIFO(
    sku: string,
    quantityNeeded: number
  ): Promise<FIFOIssueResult> {
    if (quantityNeeded <= 0) {
      return { success: false, weightedUnitCost: 0, totalCost: 0, layersConsumed: [], error: "Quantity must be positive" }
    }

    try {
      // Fetch all layers with remaining stock, ordered by receipt date (FIFO)
      const snapshot = await db.collection(this.COLLECTION)
        .where("sku", "==", sku)
        .where("quantityRemaining", ">", 0)
        .orderBy("receiptDate", "asc")
        .get()

      if (snapshot.empty) {
        return {
          success: false,
          weightedUnitCost: 0,
          totalCost: 0,
          layersConsumed: [],
          error: `No FIFO layers found for SKU ${sku}. Use flat unit_cost fallback.`,
        }
      }

      let remaining   = quantityNeeded
      let totalCost   = 0
      const layersConsumed: FIFOIssueResult["layersConsumed"] = []
      const batch     = db.batch()

      for (const doc of snapshot.docs) {
        if (remaining <= 0) break

        const layer = doc.data() as InventoryLayer
        const take  = Math.min(remaining, layer.quantityRemaining)

        totalCost += take * layer.unitCost
        layersConsumed.push({ layerId: doc.id, quantityUsed: take, unitCost: layer.unitCost })

        batch.update(doc.ref, { quantityRemaining: layer.quantityRemaining - take })
        remaining -= take
      }

      if (remaining > 0) {
        return {
          success: false,
          weightedUnitCost: 0,
          totalCost: 0,
          layersConsumed: [],
          error: `Insufficient FIFO layers for ${sku}: short by ${remaining} units`,
        }
      }

      await batch.commit()

      const weightedUnitCost = Math.round((totalCost / quantityNeeded) * 10000) / 10000

      console.log(
        `✅ FIFO issue: ${sku} × ${quantityNeeded} units, ` +
        `weighted cost ${formatCurrency(weightedUnitCost)}/unit (total ${formatCurrency(totalCost)})`
      )

      return { success: true, weightedUnitCost, totalCost, layersConsumed }
    } catch (error) {
      return {
        success: false,
        weightedUnitCost: 0,
        totalCost: 0,
        layersConsumed: [],
        error: error instanceof Error ? error.message : "Failed to issue from FIFO layers",
      }
    }
  }

  /**
   * Get all layers for a SKU (for audit / valuation report).
   */
  static async getCurrentLayers(sku: string): Promise<InventoryLayer[]> {
    try {
      const snapshot = await db.collection(this.COLLECTION)
        .where("sku", "==", sku)
        .where("quantityRemaining", ">", 0)
        .orderBy("receiptDate", "asc")
        .get()
      return snapshot.docs.map(d => d.data() as InventoryLayer)
    } catch {
      return []
    }
  }

  /**
   * Calculate weighted average cost across all open layers for a SKU.
   * Useful for financial reporting when FIFO layer detail is not required.
   */
  static async getWeightedAverageCost(sku: string): Promise<{ unitCost: number; totalUnits: number; totalValue: number }> {
    const layers = await this.getCurrentLayers(sku)
    if (layers.length === 0) return { unitCost: 0, totalUnits: 0, totalValue: 0 }

    const totalUnits = layers.reduce((sum, l) => sum + l.quantityRemaining, 0)
    const totalValue = layers.reduce((sum, l) => sum + l.quantityRemaining * l.unitCost, 0)
    return {
      unitCost: totalUnits > 0 ? Math.round((totalValue / totalUnits) * 10000) / 10000 : 0,
      totalUnits,
      totalValue,
    }
  }

  /**
   * NRV check: returns SKUs where any layer's unit cost exceeds the provided NRV map.
   * Used at month-end to identify candidates for IAS 2.9 write-downs.
   *
   * @param nrvMap  Map of sku → net realisable value per unit (EGP)
   */
  static async getWriteDownCandidates(
    nrvMap: Record<string, number>
  ): Promise<Array<{ sku: string; avgCost: number; nrv: number; quantityOnHand: number; potentialWriteDown: number }>> {
    const candidates = []

    for (const [sku, nrv] of Object.entries(nrvMap)) {
      const { unitCost, totalUnits, totalValue } = await this.getWeightedAverageCost(sku)
      if (totalUnits > 0 && unitCost > nrv) {
        candidates.push({
          sku,
          avgCost: unitCost,
          nrv,
          quantityOnHand: totalUnits,
          potentialWriteDown: Math.round((unitCost - nrv) * totalUnits * 100) / 100,
        })
      }
    }

    return candidates
  }
}
