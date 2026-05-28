import { db, COLLECTIONS, FieldValue } from "../firebase";
import { DesignService } from "./design-service";
import { EnhancedAccountingService } from "./enhanced-accounting-service";
import type { MaterialRequirement } from "../types/designs";
import { formatCurrency } from "@/lib/utils";

export class WorkOrderMaterialService {
  /**
   * Issue materials for a work order based on design requirements
   */
  static async issueMaterialsForWorkOrder(
    workOrderId: string, 
    designId: string, 
    quantity: number = 1
  ): Promise<{
    success: boolean;
    issuedMaterials: MaterialRequirement[];
    totalCost: number;
    journalEntryId?: string;
    error?: string;
  }> {
    try {
      console.log(`Issuing materials for work order ${workOrderId}, design ${designId}, quantity ${quantity}`);

      // Get material requirements for the design
      const requirements = await DesignService.getMaterialRequirements(designId, quantity);
      
      // Check availability
      const unavailableMaterials = requirements.filter(req => !req.isAvailable);
      if (unavailableMaterials.length > 0) {
        return {
          success: false,
          issuedMaterials: [],
          totalCost: 0,
          error: `Insufficient materials: ${unavailableMaterials.map(m => m.inventoryItemName).join(', ')}`
        };
      }

      // Issue materials from inventory
      const issuedMaterials: MaterialRequirement[] = [];
      const batch = db.batch();
      let totalCost = 0;

      for (const requirement of requirements) {
        // Update inventory quantity
        const inventoryRef = db.collection(COLLECTIONS.INVENTORY_ITEMS)
          .doc(requirement.inventoryItemId);
        
        batch.update(inventoryRef, {
          quantity_on_hand: FieldValue.increment(-requirement.requiredQuantity),
          updatedAt: new Date()
        });

        // Create inventory movement record
        const movementRef = db.collection(COLLECTIONS.INVENTORY_MOVEMENTS).doc();
        batch.set(movementRef, {
          item_id: requirement.inventoryItemId,
          qty: -requirement.requiredQuantity, // Negative for issue
          type: "issue",
          related_doc: workOrderId,
          created_at: new Date(),
          description: `Issued for work order ${workOrderId} - Design ${designId}`,
          unit_cost: requirement.costPerUnit,
          total_cost: requirement.totalCost
        });

        issuedMaterials.push(requirement);
        totalCost += requirement.totalCost;
      }

      // Update work order with issued materials
      const workOrderRef = db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId);
      batch.update(workOrderRef, {
        materials_issued: issuedMaterials.map(m => ({
          inventoryItemId: m.inventoryItemId,
          inventoryItemName: m.inventoryItemName,
          quantityIssued: m.requiredQuantity,
          unitCost: m.costPerUnit,
          totalCost: m.totalCost
        })),
        status: "in_progress",
        updated_at: new Date()
      });

      // Create journal entry via EnhancedAccountingService (BUG-2 Fix: Accounting BEFORE Batch)
      // This handles real COA codes (1210 WIP, 1201 Raw Materials) and indexing
      const accountingMaterials = issuedMaterials.map(m => ({
        itemId: m.inventoryItemId,
        itemName: m.inventoryItemName,
        quantity: m.requiredQuantity,
        unitCost: m.costPerUnit
      }));

      const accountingResult = await EnhancedAccountingService.recordMaterialIssue(
        workOrderId,
        accountingMaterials
      );

      if (!accountingResult.success) {
        console.error(`❌ Material issue accounting failed: ${accountingResult.error}. Inventory deduction aborted.`);
        return {
          success: false,
          issuedMaterials: [],
          totalCost: 0,
          error: `Accounting failure: ${accountingResult.error}`
        };
      }

      // Commit inventory and status changes ONLY if accounting succeeded
      await batch.commit();

      console.log(`✅ Successfully issued materials for work order ${workOrderId}, total cost: ${formatCurrency(totalCost)}`);

      return {
        success: true,
        issuedMaterials,
        totalCost,
        journalEntryId: accountingResult.entryId
      };

    } catch (error) {
      console.error("Error issuing materials for work order:", error);
      return {
        success: false,
        issuedMaterials: [],
        totalCost: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Complete work order and transfer from WIP to Finished Goods
   */
  static async completeWorkOrder(
    workOrderId: string,
    designId: string,
    quantity: number = 1
  ): Promise<{
    success: boolean;
    journalEntryId?: string;
    error?: string;
  }> {
    try {
      console.log(`Completing work order ${workOrderId} for design ${designId}`);

      // Get work order
      const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get();
      if (!workOrderDoc.exists) {
        throw new Error("Work order not found");
      }

      const workOrderData = workOrderDoc.data();
      
      // Per IAS 2.10 / EAS 2: WIP→FG transfer at ACTUAL cost, never at estimated cost
      // 1. Check materials_issued array (formal issue path from service)
      let totalCost = (workOrderData?.materials_issued || []).reduce((sum: number, material: any) => 
        sum + (material.totalCost || 0), 0);
      
      // 2. Fallback to total_cost field (set by update-materials route)
      if (totalCost <= 0) {
        totalCost = workOrderData?.total_cost || 0;
      }

      // 3. Fallback to computed from individual cost fields
      if (totalCost <= 0) {
        totalCost = (workOrderData?.material_cost || 0) + 
                    (workOrderData?.labor_cost || 0) + 
                    (workOrderData?.overhead_cost || 0);
      }

      // 4. Do NOT fallback to estimated_cost — that creates phantom WIP credits
      //    per IAS 2.9 (lower of cost and NRV). If no actual cost exists, skip transfer.

      // Create journal entry for completion (WIP → Finished Goods) BEFORE updating status
      // This ensures atomicity: if accounting fails, the WO stays in_progress
      let journalEntryId: string | undefined = undefined;
      
      if (totalCost > 0) {
        const accountingResult = await EnhancedAccountingService.recordWIPToFinishedGoods(
          workOrderId,
          totalCost
        );

        if (!accountingResult.success) {
          console.error(`❌ WIP→FG accounting failed for WO ${workOrderId}: ${accountingResult.error}`);
          return {
            success: false,
            error: `WIP→FG transfer failed: ${accountingResult.error}`
          };
        }
        journalEntryId = accountingResult.entryId;
      } else {
        console.warn(`⚠️ Work order ${workOrderId} has no actual costs recorded. Skipping WIP→FG journal entry.`);
        console.warn(`   materials_issued: empty, total_cost: 0, material/labor/overhead costs all zero.`);
      }

      // Update work order status ONLY after successful accounting
      await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update({
        status: "completed",
        completed_at: new Date(),
        updated_at: new Date(),
        final_completion_cost: totalCost,
        notes: totalCost > 0 
          ? `Completed with WIP→FG transfer at EGP ${totalCost.toFixed(2)}`
          : `Completed — no actual costs recorded. WIP→FG transfer skipped.`
      });


      console.log(`✅ Successfully completed work order ${workOrderId}`);

      return {
        success: true,
        journalEntryId
      };

    } catch (error) {
      console.error("Error completing work order:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get material requirements for a work order
   */
  static async getWorkOrderMaterialRequirements(
    workOrderId: string
  ): Promise<MaterialRequirement[]> {
    try {
      const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get();
      if (!workOrderDoc.exists) {
        throw new Error("Work order not found");
      }

      const workOrderData = workOrderDoc.data();
      const designId = workOrderData?.design_id;
      const quantity = workOrderData?.quantity || 1;

      if (!designId) {
        throw new Error("Work order does not have a design ID");
      }

      return await DesignService.getMaterialRequirements(designId, quantity);

    } catch (error) {
      console.error("Error getting work order material requirements:", error);
      throw new Error("Failed to get work order material requirements");
    }
  }
}
