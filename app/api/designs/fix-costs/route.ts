import { NextRequest, NextResponse } from 'next/server';
import { DesignService } from '@/lib/services/design-service';
import { requirePermission } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Starting design cost fix...');
    
    // Get all designs
    const result = await DesignService.getDesigns();
    const designs = result.designs;
    console.log(`📊 Found ${designs.length} designs to fix`);
    
    let fixed = 0;
    const errors: string[] = [];
    
    for (const design of designs) {
  const auth = await requirePermission("designs:create");
  if (!auth.authorized) return auth.response;

  try {
        // Calculate correct total cost
        // Labor cost = cost per hour × manufacturing time
        const laborCostPerHour = design.laborCost || 0;
        const manufacturingTime = design.manufacturingTime || 0;
        const totalLaborCost = laborCostPerHour * manufacturingTime;
        const correctTotalCost = (design.materialCost || 0) + totalLaborCost + (design.overheadCost || 0);
        
        // Only update if totalCost is incorrect
        if (design.totalCost !== correctTotalCost) {
          console.log(`🔧 Fixing design "${design.name}": ${design.totalCost} → ${correctTotalCost}`);
          
          await DesignService.updateDesign(design.id, {
            totalCost: correctTotalCost
          });
          
          fixed++;
        }
      } catch (error) {
        console.error(`❌ Error fixing design ${design.id}:`, error);
        errors.push(`Design ${design.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log(`✅ Fixed ${fixed} designs`);
    
    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} designs`,
      fixed,
      errors,
      details: {
        totalDesigns: designs.length,
        fixedDesigns: fixed,
        errorCount: errors.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fixing design costs:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fix design costs',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
