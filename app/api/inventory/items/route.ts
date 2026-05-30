import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, TABLES } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    
    let query = getServiceClient()
      .from(TABLES.INVENTORY_ITEMS)
      .select("*")
      .order("name", { ascending: true })
      .limit(1000);
    
    if (type) {
      query = query.eq("type", type);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    let items: any[] = (data || []).map((item: any) => ({
      ...item,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString()
    }));
    
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter((item: any) => 
        item.name?.toLowerCase().includes(searchLower) ||
        item.sku?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower)
      );
    }
    
    items = items.filter((item: any) => (item.quantity_on_hand || 0) > 0);
    
    return NextResponse.json({
      success: true,
      data: items,
      count: items.length
    });
    
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory items" },
      { status: 500 }
    );
  }
}
