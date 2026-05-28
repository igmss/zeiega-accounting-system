import { db, COLLECTIONS } from "../firebase";
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
        id: `WO-${salesOrderId.split("-").slice(-1)[0]}-${Date.now()}`,
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
        created_at: new Date(),
        updated_at: new Date(),
        completionPercentage: 0,
        notes: `Work order for design: ${design.name} (${quantity} units)`,
        ...additionalData
      };

      // Save work order to database
      const workOrderRef = await db.collection(COLLECTIONS.WORK_ORDERS).add(workOrder);

      console.log(`✅ Created work order ${workOrderRef.id} with estimated cost ${formatCurrency(estimatedTotalCost)}`);

      return {
        success: true,
        workOrderId: workOrderRef.id,
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
      const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get();
      const workOrderData = workOrderDoc.data();
      const overheadCost = workOrderData?.overhead_cost || 0;

      const laborCost = laborHours * laborRate;
      // BUG-11 Fix: Include overhead_cost in totalCost calculation
      const totalCost = materialCosts + laborCost + overheadCost;

      await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update({
        labor_hours: laborHours,
        labor_cost: laborCost,
        total_cost: totalCost,
        updated_at: new Date()
      });

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
      const workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get();
      if (!workOrderDoc.exists) {
        return { workOrder: null, design: null, materialRequirements: [] };
      }

      const workOrder = {
        id: workOrderDoc.id,
        ...workOrderDoc.data(),
        created_at: (workOrderDoc.data()?.created_at as any)?.toDate ? (workOrderDoc.data() as any).created_at.toDate() : (workOrderDoc.data()?.created_at || new Date()),
        updated_at: (workOrderDoc.data()?.updated_at as any)?.toDate ? (workOrderDoc.data() as any).updated_at.toDate() : (workOrderDoc.data()?.updated_at || new Date()),
        completed_at: (workOrderDoc.data()?.completed_at as any)?.toDate ? (workOrderDoc.data() as any).completed_at.toDate() : (workOrderDoc.data()?.completed_at || null),
        start_time: (workOrderDoc.data()?.start_time as any)?.toDate ? (workOrderDoc.data() as any).start_time.toDate() : (workOrderDoc.data()?.start_time || null),
        estimated_completion: (workOrderDoc.data()?.estimated_completion as any)?.toDate ? (workOrderDoc.data() as any).estimated_completion.toDate() : (workOrderDoc.data()?.estimated_completion || null)
      } as WorkOrder;

      // Fetch sales order details from multiple possible sources
      if (workOrder.sales_order_id) {
        try {
          let salesOrderData = null;
          let customerData = null;

          // Try to get from acc_sales_orders first (accounting system)
          const accSalesOrderDoc = await db.collection(COLLECTIONS.SALES_ORDERS).doc(workOrder.sales_order_id).get();
          if (accSalesOrderDoc.exists) {
            salesOrderData = accSalesOrderDoc.data();

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
              const customerDoc = await db.collection(COLLECTIONS.CUSTOMERS).doc(salesOrderData.customer_id).get();
              if (customerDoc.exists) {
                customerData = customerDoc.data();
              }
            }
          }

          // If not found in accounting system, try original orders collection
          if (!salesOrderData) {
            const orderDoc = await db.collection(COLLECTIONS.ORDERS).doc(workOrder.sales_order_id).get();
            if (orderDoc.exists) {
              salesOrderData = orderDoc.data();
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
            const manualOrderDoc = await db.collection(COLLECTIONS.MANUAL_ORDERS).doc(workOrder.sales_order_id).get();
            if (manualOrderDoc.exists) {
              salesOrderData = manualOrderDoc.data();
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

            // Persist the recalculated costs to Firestore if they are not yet saved
            await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).update({
              item_costs: costCalculation.itemCosts,
              estimated_cost: costCalculation.totalEstimatedCost,
              labor_cost: workOrder.labor_cost,
              overhead_cost: workOrder.overhead_cost,
              updated_at: new Date()
            }).catch(err => console.error(`Failed to persist auto-calculated costs for WO ${workOrderId}:`, err));
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
   * Get all work orders with design, customer, and sales order information
   */
  static async getAllWorkOrdersWithDesigns(): Promise<WorkOrder[]> {
    try {
      const snapshot = await db.collection(COLLECTIONS.WORK_ORDERS)
        .orderBy("created_at", "desc")
        .get();

      const workOrders = await Promise.all(snapshot.docs.map(async (doc) => {
        const workOrderData = {
          id: doc.id,
          ...doc.data(),
          created_at: (doc.data().created_at as any)?.toDate ? (doc.data().created_at as any).toDate() : (doc.data().created_at || new Date()),
          updated_at: (doc.data().updated_at as any)?.toDate ? (doc.data().updated_at as any).toDate() : (doc.data().updated_at || new Date()),
          completed_at: (doc.data().completed_at as any)?.toDate ? (doc.data().completed_at as any).toDate() : (doc.data().completed_at || null),
          start_time: (doc.data().start_time as any)?.toDate ? (doc.data().start_time as any).toDate() : (doc.data().start_time || null),
          estimated_completion: (doc.data().estimated_completion as any)?.toDate ? (doc.data().estimated_completion as any).toDate() : (doc.data().estimated_completion || null)
        } as WorkOrder;

        // Fetch sales order details from multiple possible sources
        if (workOrderData.sales_order_id) {
          try {
            let salesOrderData = null;
            let customerData = null;

            // Try to get from acc_sales_orders first (accounting system)
            const accSalesOrderDoc = await db.collection(COLLECTIONS.SALES_ORDERS).doc(workOrderData.sales_order_id).get();
            if (accSalesOrderDoc.exists) {
              salesOrderData = accSalesOrderDoc.data();

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
                const customerDoc = await db.collection(COLLECTIONS.CUSTOMERS).doc(salesOrderData.customer_id).get();
                if (customerDoc.exists) {
                  customerData = customerDoc.data();
                }
              }
            }

            // If not found in accounting system, try original orders collection
            if (!salesOrderData) {
              const orderDoc = await db.collection(COLLECTIONS.ORDERS).doc(workOrderData.sales_order_id).get();
              if (orderDoc.exists) {
                salesOrderData = orderDoc.data();
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
              const manualOrderDoc = await db.collection(COLLECTIONS.MANUAL_ORDERS).doc(workOrderData.sales_order_id).get();
              if (manualOrderDoc.exists) {
                salesOrderData = manualOrderDoc.data();
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
              workOrderData.customer_name = customerData.name || "Unknown Customer";
              workOrderData.customer_email = customerData.email || "";
              workOrderData.customer_phone = customerData.phone || "";
              workOrderData.customer_address = customerData.address || "";
            } else {
              workOrderData.customer_name = "Unknown Customer";
              workOrderData.customer_email = "";
              workOrderData.customer_phone = "";
              workOrderData.customer_address = "";
            }

            // Add sales order items and total amount (preserve original work order items if they exist)
            if (salesOrderData) {
              // Only set items if work order doesn't already have complete item data
              if (!workOrderData.items || workOrderData.items.length === 0 || !workOrderData.items[0]?.name) {
                workOrderData.items = salesOrderData.items || [];
              }
              workOrderData.total_amount = salesOrderData.total || salesOrderData.total_amount || 0;
              workOrderData.order_status = salesOrderData.status || "unknown";
            } else {
              workOrderData.items = [];
              workOrderData.total_amount = 0;
              workOrderData.order_status = "unknown";
            }

            // Self-healing: auto-calculate and persist costs from designs if zero or missing
            if (workOrderData.items && workOrderData.items.length > 0 && (!workOrderData.estimated_cost || workOrderData.estimated_cost === 0)) {
              try {
                const costCalculation = await OrderItemDesignService.calculateOrderCostsFromDesigns(workOrderData.items);
                if (costCalculation.success && costCalculation.itemCosts.length > 0) {
                  const estimatedCost = costCalculation.totalEstimatedCost;
                  const laborCost = costCalculation.itemCosts.reduce((sum, item) => sum + item.laborCost, 0);
                  const overheadCost = costCalculation.itemCosts.reduce((sum, item) => sum + item.overheadCost, 0);
                  const laborHours = costCalculation.itemCosts.reduce((sum, item) => sum + (item.laborCost / 50), 0);

                  const updateFields = {
                    estimated_cost: estimatedCost,
                    labor_cost: laborCost,
                    labor_hours: laborHours,
                    overhead_cost: overheadCost,
                    item_costs: costCalculation.itemCosts,
                    updated_at: new Date()
                  };

                  await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderData.id).update(updateFields);
                  Object.assign(workOrderData, updateFields);
                }
              } catch (err) {
                console.warn(`Failed to auto-recalculate/persist costs for work order ${workOrderData.id}:`, err);
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch sales order ${workOrderData.sales_order_id}:`, error);
            workOrderData.customer_name = "Unknown Customer";
            workOrderData.customer_email = "";
            workOrderData.customer_phone = "";
            workOrderData.customer_address = "";
            workOrderData.items = [];
            workOrderData.total_amount = 0;
            workOrderData.order_status = "unknown";
          }
        } else {
          workOrderData.customer_name = "Unknown Customer";
          workOrderData.customer_email = "";
          workOrderData.customer_phone = "";
          workOrderData.customer_address = "";
          workOrderData.items = [];
          workOrderData.total_amount = 0;
          workOrderData.order_status = "unknown";
        }

        return workOrderData;
      }));

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
      const invoicesSnapshot = await db.collection(COLLECTIONS.INVOICES)
        .where("sales_order_id", "==", workOrder.sales_order_id)
        .get();

      const revenue = invoicesSnapshot.docs.reduce((sum, doc) => {
        const inv = doc.data();
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
}
