import { NextRequest, NextResponse } from "next/server";
import { WorkOrderService } from "@/lib/services/work-order-service";
import { OrderItemDesignService } from "@/lib/services/order-item-design-service";
import { db, COLLECTIONS } from "@/lib/firebase";
import { requirePermission, requireAuth } from "@/lib/auth/auth-helpers";

// GET /api/work-orders - Get all work orders with design information
export async function GET() {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  try {
    console.log("Fetching work orders with design information...");

    const workOrders = await WorkOrderService.getAllWorkOrdersWithDesigns();

    return NextResponse.json({
      success: true,
      data: workOrders,
      count: workOrders.length
    });

  } catch (error) {
    console.error("Error fetching work orders:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch work orders" },
      { status: 500 }
    );
  }
}

// POST /api/work-orders - Create a new work order with design integration
export async function POST(request: NextRequest) {
  const auth = await requirePermission("work-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const workOrderData = await request.json();

    console.log("Creating work order with data:", workOrderData);

    // If order items are provided, use automatic cost calculation
    if (workOrderData.items && workOrderData.items.length > 0) {
      console.log("Using automatic cost calculation from order items...");

      const result = await OrderItemDesignService.createWorkOrderWithAutoCosts(
        workOrderData.sales_order_id,
        workOrderData.items,
        workOrderData
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          workOrderId: result.workOrderId,
          totalEstimatedCost: result.totalEstimatedCost,
          itemCosts: result.itemCosts,
          message: "Work order created with automatic cost calculation from designs"
        });
      } else {
        console.warn(`Auto cost calculation failed: ${result.error}, falling back to manual creation`);
      }
    }

    // If design_id is provided, use design-based creation
    if (workOrderData.design_id) {
      const result = await WorkOrderService.createWorkOrderWithDesign(
        workOrderData.sales_order_id,
        workOrderData.design_id,
        workOrderData.quantity || 1,
        workOrderData
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          workOrderId: result.workOrderId,
          estimatedCost: result.estimatedCost,
          message: "Work order created with design-based cost calculation"
        });
      } else {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }
    }

    // Fallback: Try automatic cost calculation even without items
    console.log("Attempting automatic cost calculation as fallback...");

    // If we have items, try automatic cost calculation
    if (workOrderData.items && workOrderData.items.length > 0) {
      const result = await OrderItemDesignService.createWorkOrderWithAutoCosts(
        workOrderData.sales_order_id,
        workOrderData.items,
        workOrderData
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          workOrderId: result.workOrderId,
          totalEstimatedCost: result.totalEstimatedCost,
          itemCosts: result.itemCosts,
          message: "Work order created with automatic cost calculation (fallback)"
        });
      }
    }

    // Final fallback: Create basic work order with warning
    console.warn("Creating basic work order without automatic cost calculation");
    const now = new Date();
    const workOrder = {
      ...workOrderData,
      createdAt: now,
      updatedAt: now,
      status: workOrderData.status || "pending",
      completionPercentage: workOrderData.completionPercentage || 0,
      total_cost: 0,
      estimated_cost: 0,
      labor_cost: 0,
      materials_issued: [],
      notes: `Basic work order created without automatic cost calculation - manual cost entry required`
    };

    const docRef = await db.collection(COLLECTIONS.WORK_ORDERS).add(workOrder);

    return NextResponse.json({
      success: true,
      workOrderId: docRef.id,
      message: "Basic work order created - manual cost entry required"
    });

  } catch (error) {
    console.error("Error creating work order:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create work order" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermission("work-orders:create")
  if (!auth.authorized) return auth.response
  try {
    const { id, ...workOrderData } = await request.json()

    const workOrder = {
      ...workOrderData,
      updatedAt: new Date(),
    }

    await db.collection(COLLECTIONS.WORK_ORDERS).doc(id).update(workOrder)

    return NextResponse.json({ id, ...workOrder })
  } catch (error) {
    console.error("Error updating work order:", error)
    return NextResponse.json(
      { error: "Failed to update work order" },
      { status: 500 }
    )
  }
}
