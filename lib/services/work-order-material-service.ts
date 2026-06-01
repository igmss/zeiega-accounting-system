import { supabase, TABLES, getServiceSupabase } from "../supabase";
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
      let totalCost = 0;

      // Create journal entry via EnhancedAccountingService (BUG-2 Fix: Accounting BEFORE inventory updates)
      const accountingMaterials = requirements.map(m => ({
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
      for (const requirement of requirements) {
        // Read current quantity first (replaces FieldValue.increment)
        const { data: currentItem } = await getServiceSupabase()
          .from(TABLES.INVENTORY_ITEMS)
          .select("quantity_on_hand")
          .eq("id", requirement.inventoryItemId)
          .single();

        const currentQty = currentItem?.quantity_on_hand || 0;
        const newQty = currentQty - requirement.requiredQuantity;

        // Update inventory quantity
        await getServiceSupabase()
          .from(TABLES.INVENTORY_ITEMS)
          .update({
            quantity_on_hand: newQty,
            updated_at: new Date().toISOString()
          })
          .eq("id", requirement.inventoryItemId);

        // Create inventory movement record
        await getServiceSupabase()
          .from(TABLES.INVENTORY_MOVEMENTS)
          .insert({
            item_id: requirement.inventoryItemId,
            sku: requirement.inventoryItemSku || requirement.inventoryItemId,
            qty: -requirement.requiredQuantity,
            type: "issue",
            related_doc: workOrderId,
            notes: `Issued to WO ${workOrderId} — ${requirement.inventoryItemName} × ${requirement.requiredQuantity}`,
            created_at: new Date().toISOString()
          });

        issuedMaterials.push(requirement);
        totalCost += requirement.totalCost;
      }

      // Update work order with issued materials
      await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .update({
          materials_issued: issuedMaterials.map(m => ({
            inventoryItemId: m.inventoryItemId,
            inventoryItemName: m.inventoryItemName,
            quantityIssued: m.requiredQuantity,
            unitCost: m.costPerUnit,
            totalCost: m.totalCost
          })),
          status: "in_progress",
          updated_at: new Date().toISOString()
        })
        .eq("id", workOrderId);

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
      console.log(`[DEBUG:CWO:START] workOrderId=${workOrderId}, designId=${designId}, quantity=${quantity}`);

      const { data: workOrderDoc, error: woFetchErr } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .select("*")
        .eq("id", workOrderId)
        .single();

      if (woFetchErr) {
        console.error(`[DEBUG:CWO:FETCH] error: ${woFetchErr.message}`);
        throw new Error(`Failed to fetch work order: ${woFetchErr.message}`);
      }
      if (!workOrderDoc) {
        console.error(`[DEBUG:CWO:FETCH] work order not found`);
        throw new Error("Work order not found");
      }

      const workOrderData = workOrderDoc;
      console.log(`[DEBUG:CWO:WO] status=${workOrderData.status}, total_cost=${workOrderData.total_cost}, estimated_cost=${workOrderData.estimated_cost}, labor_cost=${workOrderData.labor_cost}, overhead_cost=${workOrderData.overhead_cost}, material_cost=${workOrderData.material_cost}`);
      console.log(`[DEBUG:CWO:WO] materials_issued=${JSON.stringify(workOrderData.materials_issued)}`);

      const matCost = (workOrderData?.materials_issued || []).reduce((sum: number, material: any) =>
        sum + (material.totalCost || 0), 0);
      const labCost = workOrderData?.labor_cost || 0;
      const ohCost = workOrderData?.overhead_cost || 0;
      let totalCost = matCost + labCost + ohCost;
      console.log(`[DEBUG:CWO:COST] matCost=${matCost}, labCost=${labCost}, ohCost=${ohCost}, totalCost=${totalCost}`);

      if (totalCost <= 0) {
        totalCost = workOrderData?.total_cost || 0;
        console.log(`[DEBUG:CWO:COST] fallback to total_cost: ${totalCost}`);
      }

      if (totalCost <= 0) {
        totalCost = (workOrderData?.material_cost || 0) +
                    (workOrderData?.labor_cost || 0) +
                    (workOrderData?.overhead_cost || 0);
        console.log(`[DEBUG:CWO:COST] fallback to material+labor+overhead: ${totalCost}`);
      }

      console.log(`[DEBUG:CWO:COST] final totalCost=${totalCost}`);

      let journalEntryId: string | undefined = undefined;
      
      if (totalCost > 0) {
        console.log(`[DEBUG:CWO:JE] calling recordWIPToFinishedGoods with totalCost=${totalCost}`);
        const accountingResult = await EnhancedAccountingService.recordWIPToFinishedGoods(
          workOrderId,
          totalCost
        );

        console.log(`[DEBUG:CWO:JE] result: success=${accountingResult.success}, entryId=${accountingResult.entryId}, error=${accountingResult.error || 'none'}`);
        if (!accountingResult.success) {
          console.error(`[DEBUG:CWO:JE] FAILED: ${accountingResult.error}`);
          return {
            success: false,
            error: `WIP→FG transfer failed: ${accountingResult.error}`
          };
        }
        journalEntryId = accountingResult.entryId;
      } else {
        console.warn(`[DEBUG:CWO:JE] SKIPPED — totalCost is 0, no WIP→FG JE created`);
      }

      console.log(`[DEBUG:CWO:UPDATE] setting status=completed, total_cost=${totalCost}`);
      const { error: updateErr } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          total_cost: totalCost,
          notes: totalCost > 0 
            ? `Completed with WIP→FG transfer at EGP ${totalCost.toFixed(2)}`
            : `Completed — no actual costs recorded. WIP→FG transfer skipped.`
        })
        .eq("id", workOrderId);

      if (updateErr) {
        console.error(`[DEBUG:CWO:UPDATE] FAILED: ${updateErr.message}`);
        throw new Error(`Status update failed: ${updateErr.message}`);
      }

      console.log(`[DEBUG:CWO:END] success, journalEntryId=${journalEntryId}`);
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
      const { data: workOrderDoc } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .select("*")
        .eq("id", workOrderId)
        .single();

      if (!workOrderDoc) {
        throw new Error("Work order not found");
      }

      const workOrderData = workOrderDoc;
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
