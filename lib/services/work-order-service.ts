import { supabase, TABLES, getServiceSupabase } from "../supabase";
import { DesignService } from "./design-service";
import { OrderItemDesignService } from "./order-item-design-service";
import type { WorkOrder } from "../types";
import { formatCurrency } from "@/lib/utils"

export class WorkOrderService {
  /**
   * Create a work order with design-based cost calculation
   */
  static async createWorkOrderWithDesign(
    salesOrderId: string,
    designId: string,
    quantity: number = 1,
    additionalData: Partial<WorkOrder> = {}
  ): Promise<{
    success: boolean;
    workOrderId?: string;
    estimatedCost?: number;
    error?: string;
  }> {
    try {
      console.log(`Creating work order for sales order ${salesOrderId}, design ${designId}, quantity ${quantity}`);

      // Get design configuration
      const design = await DesignService.getDesign(designId);
      if (!design) {
        throw new Error(`Design ${designId} not found`);
      }

      // Calculate estimated costs based on design
      const estimatedMaterialCost = design.materialCost * quantity;
      const estimatedLaborCost = design.laborCost * quantity;
      const estimatedOverheadCost = design.overheadCost * quantity;
      const estimatedTotalCost = estimatedMaterialCost + estimatedLaborCost + estimatedOverheadCost;

      // Check material availability
      const materialAvailability = await DesignService.checkMaterialAvailability(designId, quantity);

      if (!materialAvailability.isAvailable) {
        console.warn(`Materials not available for design ${designId}:`, materialAvailability.unavailableMaterials);
      }

      // Create work order with design integration
      const workOrder: WorkOrder = {
        id: `WO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sales_order_id: salesOrderId,
        design_id: designId,
        design_name: design.name,
        raw_materials_used: [],
        materials_issued: [],
        labor_hours: design.manufacturingTime * quantity,
        labor_cost: estimatedLaborCost,
        overhead_cost: estimatedOverheadCost,
        total_cost: 0, // Will be updated when materials are issued
        estimated_cost: estimatedTotalCost,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completionPercentage: 0,
        notes: `Work order for design: ${design.name} (${quantity} units)`,
        customer_name: additionalData.customer_name || undefined,
        customer_email: additionalData.customer_email || undefined,
        customer_phone: additionalData.customer_phone || undefined,
        customer_address: additionalData.customer_address || undefined,
        total_amount: additionalData.total_amount || 0,
        order_status: additionalData.order_status || undefined,
        ...additionalData
      };

      // Save work order to database
      const { data: inserted, error: insertError } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .insert(workOrder)
        .select()
        .single();

      if (insertError) throw insertError;

      const workOrderRefId = inserted?.id || workOrder.id;

      console.log(`✅ Created work order ${workOrderRefId} with estimated cost ${formatCurrency(estimatedTotalCost)}`);

      return {
        success: true,
        workOrderId: workOrderRefId,
        estimatedCost: estimatedTotalCost
      };

    } catch (error) {
      console.error("Error creating work order with design:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update work order with actual costs when materials are issued
   */
  static async updateWorkOrderCosts(
    workOrderId: string,
    materialCosts: number,
    laborHours: number,
    laborRate: number = 50 // Default labor rate per hour in EGP
  ): Promise<void> {
    try {
      const { data: workOrderDoc } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .select("*")
        .eq("id", workOrderId)
        .single();

      const overheadCost = workOrderDoc?.overhead_cost || 0;

      const laborCost = laborHours * laborRate;
      // BUG-11 Fix: Include overhead_cost in totalCost calculation
      const totalCost = materialCosts + laborCost + overheadCost;

      await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .update({
          labor_hours: laborHours,
          labor_cost: laborCost,
          total_cost: totalCost,
          updated_at: new Date().toISOString()
        })
        .eq("id", workOrderId);

      console.log(`Updated work order ${workOrderId} costs: Materials ${formatCurrency(materialCosts)}, Labor ${formatCurrency(laborCost)}, Total ${formatCurrency(totalCost)}`);
    } catch (error) {
      console.error("Error updating work order costs:", error);
      throw new Error("Failed to update work order costs");
    }
  }

  /**
   * Get work order with design, customer, and sales order information
   */
  static async getWorkOrderWithDesign(workOrderId: string): Promise<{
    workOrder: WorkOrder | null;
    design: any | null;
    materialRequirements: any[];
  }> {
    try {
      // Get work order
      const { data: workOrderDoc } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .select("*")
        .eq("id", workOrderId)
        .single();

      if (!workOrderDoc) {
        return { workOrder: null, design: null, materialRequirements: [] };
      }

      const workOrder = {
        ...workOrderDoc,
        created_at: workOrderDoc.created_at || new Date().toISOString(),
        updated_at: workOrderDoc.updated_at || new Date().toISOString(),
        completed_at: workOrderDoc.completed_at || null,
        start_time: workOrderDoc.start_time || null,
        estimated_completion: workOrderDoc.estimated_completion || null
      } as WorkOrder;

      // Fetch sales order details from multiple possible sources
      if (workOrder.sales_order_id) {
        try {
          let salesOrderData = null;
          let customerData = null;

          // Try to get from acc_sales_orders first (accounting system)
          const { data: accSalesOrderDoc } = await getServiceSupabase()
            .from(TABLES.SALES_ORDERS)
            .select("*")
            .eq("id", workOrder.sales_order_id)
            .single();

          if (accSalesOrderDoc) {
            salesOrderData = accSalesOrderDoc;

            // Use customer data directly from sales order if available
            if (salesOrderData?.customer_name) {
              customerData = {
                name: salesOrderData.customer_name,
                email: salesOrderData.customer_email || "",
                phone: salesOrderData.customer_phone || "",
                address: salesOrderData.customer_address || ""
              };
            } else if (salesOrderData?.customer_id) {
              // Fallback: try to fetch from customers collection
              const { data: customerDoc } = await getServiceSupabase()
                .from(TABLES.CUSTOMERS)
                .select("*")
                .eq("id", salesOrderData.customer_id)
                .single();

              if (customerDoc) {
                customerData = customerDoc;
              }
            }
          }

          // If not found in accounting system, try original orders collection
          if (!salesOrderData) {
            const { data: orderDoc } = await getServiceSupabase()
              .from(TABLES.ORDERS)
              .select("*")
              .eq("id", workOrder.sales_order_id)
              .single();

            if (orderDoc) {
              salesOrderData = orderDoc;
              // Extract customer data from order
              customerData = {
                name: salesOrderData?.shippingAddress?.fullName || "Unknown Customer",
                email: salesOrderData?.userId || "",
                phone: salesOrderData?.shippingAddress?.phone || "",
                address: `${salesOrderData?.shippingAddress?.street || ""} ${salesOrderData?.shippingAddress?.city || ""}`.trim()
              };
            }
          }

          // If still not found, try manual_orders collection
          if (!salesOrderData) {
            const { data: manualOrderDoc } = await getServiceSupabase()
              .from(TABLES.MANUAL_ORDERS)
              .select("*")
              .eq("id", workOrder.sales_order_id)
              .single();

            if (manualOrderDoc) {
              salesOrderData = manualOrderDoc;
              // Extract customer data from manual order
              customerData = {
                name: salesOrderData?.shippingAddress?.fullName || "Unknown Customer",
                email: salesOrderData?.userId || "",
                phone: salesOrderData?.shippingAddress?.phone || "",
                address: `${salesOrderData?.shippingAddress?.street || ""} ${salesOrderData?.shippingAddress?.city || ""}`.trim()
              };
            }
          }

          // Set customer data if found
          if (customerData) {
            workOrder.customer_name = customerData.name || "Unknown Customer";
            workOrder.customer_email = customerData.email || "";
            workOrder.customer_phone = customerData.phone || "";
            workOrder.customer_address = customerData.address || "";
          } else {
            workOrder.customer_name = "Unknown Customer";
            workOrder.customer_email = "";
            workOrder.customer_phone = "";
            workOrder.customer_address = "";
          }

          // Add sales order items and total amount (preserve original work order items if they exist)
          if (salesOrderData) {
            // Only set items if work order doesn't already have complete item data
            if (!workOrder.items || workOrder.items.length === 0 || !workOrder.items[0]?.name) {
              workOrder.items = salesOrderData.items || [];
            }
            workOrder.total_amount = salesOrderData.total || salesOrderData.total_amount || 0;
            workOrder.order_status = salesOrderData.status || "unknown";
          } else {
            workOrder.items = [];
            workOrder.total_amount = 0;
            workOrder.order_status = "unknown";
          }
        } catch (error) {
          console.warn(`Failed to fetch sales order ${workOrder.sales_order_id}:`, error);
          workOrder.customer_name = "Unknown Customer";
          workOrder.customer_email = "";
          workOrder.customer_phone = "";
          workOrder.customer_address = "";
          workOrder.items = [];
          workOrder.total_amount = 0;
          workOrder.order_status = "unknown";
        }
      } else {
        workOrder.customer_name = "Unknown Customer";
        workOrder.customer_email = "";
        workOrder.customer_phone = "";
        workOrder.customer_address = "";
        workOrder.items = [];
        workOrder.total_amount = 0;
        workOrder.order_status = "unknown";
      }

      // Get design information if available and recalculate costs from latest design data
      let design = null;
      let materialRequirements: any[] = [];

      // Recalculate item_costs from latest design data if items exist
      if (workOrder.items && workOrder.items.length > 0) {
        try {
          // Recalculate costs from current design data
          const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(workOrder.items);

          if (costCalculation.success && costCalculation.itemCosts.length > 0) {
            // Update item_costs with recalculated values based on latest design data
            workOrder.item_costs = costCalculation.itemCosts;

            // Also update aggregate costs
            workOrder.estimated_cost = costCalculation.totalEstimatedCost;
            workOrder.labor_cost = costCalculation.itemCosts.reduce((sum, item) => sum + item.laborCost, 0);
            workOrder.overhead_cost = costCalculation.itemCosts.reduce((sum, item) => sum + item.overheadCost, 0);

            console.log(`Recalculated costs for work order ${workOrderId}: Total ${formatCurrency(costCalculation.totalEstimatedCost)}`);

            // Persist the recalculated costs to database if they are not yet saved
            await getServiceSupabase()
              .from(TABLES.WORK_ORDERS)
              .update({
                item_costs: costCalculation.itemCosts,
                estimated_cost: costCalculation.totalEstimatedCost,
                labor_cost: workOrder.labor_cost,
                overhead_cost: workOrder.overhead_cost,
                updated_at: new Date().toISOString()
              })
              .eq("id", workOrderId)
              .then(() => {})
              .catch((err: any) => console.error(`Failed to persist auto-calculated costs for WO ${workOrderId}:`, err));
          }
        } catch (error) {
          console.warn(`Failed to recalculate costs for work order ${workOrderId}:`, error);
          // Continue with existing costs if recalculation fails
        }
      }

      // Get design information for display (if item_costs reference a design)
      if (workOrder.item_costs && workOrder.item_costs.length > 0 && workOrder.item_costs[0].designId) {
        const firstDesignId = workOrder.item_costs[0].designId;
        design = await DesignService.getDesign(firstDesignId);
        if (design && workOrder.items && workOrder.items.length > 0) {
          const firstItem = workOrder.items[0];
          const quantity = firstItem.quantity || 1;
          materialRequirements = await DesignService.getMaterialRequirements(firstDesignId, quantity);
        }
      } else if (workOrder.design_id) {
        // Fallback to work order's design_id
        design = await DesignService.getDesign(workOrder.design_id);
        if (design) {
          const quantity = 1; // Default quantity
          materialRequirements = await DesignService.getMaterialRequirements(workOrder.design_id, quantity);
        }
      }

      return { workOrder, design, materialRequirements };
    } catch (error) {
      console.error("Error getting work order with design:", error);
      throw new Error("Failed to get work order with design");
    }
  }

  /**
   * Get all work orders — single query, customer data is denormalized on the row
   */
  static async getAllWorkOrdersWithDesigns(): Promise<WorkOrder[]> {
    try {
      const { data: snapshot } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .select("*")
        .order("created_at", { ascending: false });

      if (!snapshot) return [];

      const workOrders = snapshot.map((doc: any) => {
        const wo = {
          ...doc,
          created_at: doc.created_at || new Date().toISOString(),
          updated_at: doc.updated_at || new Date().toISOString(),
          completed_at: doc.completed_at || null,
          start_time: doc.start_time || null,
          estimated_completion: doc.estimated_completion || null,
          customer_name: doc.customer_name || "Unknown Customer",
          customer_email: doc.customer_email || "",
          customer_phone: doc.customer_phone || "",
          customer_address: doc.customer_address || "",
          total_amount: doc.total_amount || 0,
          order_status: doc.order_status || "unknown",
          items: doc.items || [],
        } as WorkOrder;

        return wo;
      });

      // Self-healing in background: detect zero-cost WOs that have items and fire-and-forget recalculation
      const zeroCostWOs = workOrders.filter(
        (wo) => wo.items && wo.items.length > 0 && (!wo.estimated_cost || wo.estimated_cost === 0)
      );
      if (zeroCostWOs.length > 0) {
        zeroCostWOs.forEach((wo) => {
          OrderItemDesignService.calculateOrderCostsFromDesigns(wo.items!)
            .then((costCalculation) => {
              if (costCalculation.success && costCalculation.itemCosts.length > 0) {
                return getServiceSupabase()
                  .from(TABLES.WORK_ORDERS)
                  .update({
                    estimated_cost: costCalculation.totalEstimatedCost,
                    labor_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.laborCost, 0),
                    labor_hours: costCalculation.itemCosts.reduce((sum, item) => sum + (item.laborCost / 50), 0),
                    overhead_cost: costCalculation.itemCosts.reduce((sum, item) => sum + item.overheadCost, 0),
                    item_costs: costCalculation.itemCosts,
                    updated_at: new Date().toISOString()
                  })
                  .eq("id", wo.id);
              }
            })
            .catch(() => {});
        });
      }

      return workOrders;
    } catch (error) {
      console.error("Error getting work orders with designs:", error);
      throw new Error("Failed to get work orders with designs");
    }
  }

  /**
   * Calculate work order profitability
   */
  static async calculateWorkOrderProfitability(workOrderId: string): Promise<{
    revenue: number;
    totalCost: number;
    profit: number;
    profitMargin: number;
  }> {
    try {
      const { workOrder } = await this.getWorkOrderWithDesign(workOrderId);
      if (!workOrder) {
        throw new Error("Work order not found");
      }

      // BUG-12 Fix: Profitability uses realized revenue from PAID invoices, not the sales order value
      const { data: invoicesSnapshot } = await getServiceSupabase()
        .from(TABLES.INVOICES)
        .select("*")
        .eq("sales_order_id", workOrder.sales_order_id);

      const revenue = (invoicesSnapshot || []).reduce((sum: any, inv: any) => {
        // Sum any amounts actually paid across all invoices (paid, partial, overdue)
        return sum + (inv.paid_amount || 0);
      }, 0);

      const totalCost = workOrder.total_cost || workOrder.estimated_cost || 0;
      const profit = revenue - totalCost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        revenue,
        totalCost,
        profit,
        profitMargin
      };
    } catch (error) {
      console.error("Error calculating work order profitability:", error);
      throw new Error("Failed to calculate work order profitability");
    }
  }

  static async updateWorkOrder(workOrderId: string, updates: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    try {
      const whitelistedUpdates: Record<string, any> = {}
      if (updates.status !== undefined) whitelistedUpdates.status = updates.status
      if (updates.completionPercentage !== undefined) whitelistedUpdates.completionPercentage = updates.completionPercentage
      if (updates.notes !== undefined) whitelistedUpdates.notes = updates.notes
      if (updates.assigned_worker !== undefined) whitelistedUpdates.assigned_worker = updates.assigned_worker
      if (updates.estimated_completion !== undefined) {
        whitelistedUpdates.estimated_completion = updates.estimated_completion ? new Date(updates.estimated_completion).toISOString() : null
      }
      if (updates.started_at !== undefined) {
        whitelistedUpdates.start_time = updates.started_at ? new Date(updates.started_at).toISOString() : null
      }
      if (updates.start_time !== undefined) {
        whitelistedUpdates.start_time = updates.start_time ? new Date(updates.start_time).toISOString() : null
      }
      if (updates.completed_at !== undefined) {
        whitelistedUpdates.completed_at = updates.completed_at ? new Date(updates.completed_at).toISOString() : null
      }

      if (Object.keys(whitelistedUpdates).length === 0) {
        return { success: false, error: "No valid fields to update" }
      }

      await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .update({
          ...whitelistedUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workOrderId)

      return { success: true }
    } catch (error) {
      console.error("Error updating work order:", error)
      return { success: false, error: error instanceof Error ? error.message : "Failed to update work order" }
    }
  }

  static async createBasicWorkOrder(workOrderData: Record<string, any>): Promise<{ success: boolean; workOrderId?: string; error?: string }> {
    try {
      const now = new Date().toISOString()
      const workOrder = {
        sales_order_id: workOrderData.sales_order_id || null,
        design_id: workOrderData.design_id || null,
        design_name: workOrderData.design_name || null,
        raw_materials_used: workOrderData.raw_materials_used || [],
        materials_issued: workOrderData.materials_issued || [],
        labor_hours: workOrderData.labor_hours || 0,
        labor_cost: workOrderData.labor_cost || 0,
        overhead_cost: workOrderData.overhead_cost || 0,
        total_cost: workOrderData.total_cost || 0,
        estimated_cost: workOrderData.estimated_cost || 0,
        status: workOrderData.status || "pending",
        completionpercentage: workOrderData.completionPercentage || workOrderData.completionpercentage || 0,
        assigned_worker: workOrderData.assigned_worker || undefined,
        start_time: workOrderData.start_time || null,
        estimated_completion: workOrderData.estimated_completion || null,
        completed_at: workOrderData.completed_at || null,
        notes: workOrderData.notes || undefined,
        customer_name: workOrderData.customer_name || undefined,
        customer_email: workOrderData.customer_email || undefined,
        customer_phone: workOrderData.customer_phone || undefined,
        customer_address: workOrderData.customer_address || undefined,
        total_amount: workOrderData.total_amount || 0,
        order_status: workOrderData.order_status || undefined,
        created_at: now,
        updated_at: now,
      }

      const { data: inserted, error } = await getServiceSupabase()
        .from(TABLES.WORK_ORDERS)
        .insert(workOrder)
        .select()
        .single()

      if (error) throw error

      return { success: true, workOrderId: (inserted as any)?.id || (workOrder as any).id }
    } catch (error) {
      const msg = (error as any)?.message || (error as any)?.details || String(error)
      return { success: false, error: msg || "Failed to create work order" }
    }
  }
}

// Force Vercel redeploy

