import type { Design, SizeCostConfiguration, SizeRange } from "../types/designs";

export class SizeCostService {
  static readonly STANDARD_KIDS_SIZES = [
    '2Y', '3Y', '4Y', '5Y', '6Y', '7Y', '8Y', '9Y', 
    '10Y', '11Y', '12Y', '13Y', '14Y', '15Y', '16Y'
  ];

  static readonly STANDARD_ADULT_SIZES = [
    'XS', 'S', 'M', 'L', 'XL'
  ];

  // All sizes
  static readonly STANDARD_SIZES = [
    ...SizeCostService.STANDARD_KIDS_SIZES,
    ...SizeCostService.STANDARD_ADULT_SIZES
  ];

  // Default size ranges with cost multipliers (based on your mobile app pricing)
  static readonly DEFAULT_SIZE_RANGES: SizeRange[] = [
    {
      start: '2Y',
      end: '6Y',
      materialCostMultiplier: 0.8, // Smaller sizes use less material
      laborCostMultiplier: 0.9,   // Slightly less labor
      overheadCostMultiplier: 1.0, // Same overhead
      manufacturingTimeMultiplier: 0.9, // Slightly faster
      complexityAdjustment: 'low'
    },
    {
      start: '7Y',
      end: '10Y',
      materialCostMultiplier: 1.0, // Base size
      laborCostMultiplier: 1.0,    // Base labor
      overheadCostMultiplier: 1.0, // Base overhead
      manufacturingTimeMultiplier: 1.0, // Base time
      complexityAdjustment: 'medium'
    },
    {
      start: '11Y',
      end: '13Y',
      materialCostMultiplier: 1.2, // More material
      laborCostMultiplier: 1.1,    // More labor
      overheadCostMultiplier: 1.0, // Same overhead
      manufacturingTimeMultiplier: 1.1, // More time
      complexityAdjustment: 'medium'
    },
    {
      start: '14Y',
      end: '16Y',
      materialCostMultiplier: 1.4, // Much more material
      laborCostMultiplier: 1.2,    // More labor
      overheadCostMultiplier: 1.1, // Slightly more overhead
      manufacturingTimeMultiplier: 1.2, // More time
      complexityAdjustment: 'high'
    }
  ];

  /**
   * Calculate size-specific costs for a design
   */
  static calculateSizeSpecificCosts(
    design: Design, 
    size: string, 
    quantity: number = 1
  ): {
    materialCost: number;
    laborCost: number;
    overheadCost: number;
    totalCost: number;
    manufacturingTime: number;
    complexity: 'low' | 'medium' | 'high';
    source: 'exact' | 'multiplier';  // how cost was determined
  } {
    // 1. Check for exact per-size costs first
    if (design.sizeCosts?.[size]) {
      const exact = design.sizeCosts[size];
      return {
        materialCost: exact.materialCost * quantity,
        laborCost: (exact.laborCostPerHour * exact.manufacturingTime) * quantity,
        overheadCost: exact.overheadCost * quantity,
        totalCost: exact.totalCost * quantity,
        manufacturingTime: exact.manufacturingTime,
        complexity: design.complexity,
        source: 'exact'
      };
    }

    // 2. Fallback: multiplier-based calculation (legacy)
    const multipliers = this.getSizeMultipliers(design, size);
    
    const materialCost = (design.materialCost * multipliers.materialCostMultiplier) * quantity;
    const laborCostPerHour = design.laborCost * multipliers.laborCostMultiplier;
    const manufacturingTime = design.manufacturingTime * multipliers.manufacturingTimeMultiplier;
    const laborCost = (laborCostPerHour * manufacturingTime) * quantity;
    const overheadCost = (design.overheadCost * multipliers.overheadCostMultiplier) * quantity;
    const totalCost = materialCost + laborCost + overheadCost;
    
    return {
      materialCost,
      laborCost,
      overheadCost,
      totalCost,
      manufacturingTime,
      complexity: multipliers.complexityAdjustment || design.complexity,
      source: 'multiplier'
    };
  }

  /**
   * Get size multipliers for a specific size
   */
  private static getSizeMultipliers(
    design: Design, 
    size: string
  ): {
    materialCostMultiplier: number;
    laborCostMultiplier: number;
    overheadCostMultiplier: number;
    manufacturingTimeMultiplier: number;
    complexityAdjustment?: 'low' | 'medium' | 'high';
  } {
    // First, check individual size configurations
    if (design.sizeConfigurations) {
      const sizeConfig = design.sizeConfigurations.find(config => config.size === size);
      if (sizeConfig) {
        return {
          materialCostMultiplier: sizeConfig.materialCostMultiplier,
          laborCostMultiplier: sizeConfig.laborCostMultiplier,
          overheadCostMultiplier: sizeConfig.overheadCostMultiplier,
          manufacturingTimeMultiplier: sizeConfig.manufacturingTimeMultiplier,
          complexityAdjustment: sizeConfig.complexityAdjustment
        };
      }
    }

    // Then, check size ranges
    if (design.sizeRanges) {
      const rangeConfig = design.sizeRanges.find(range => 
        this.isSizeInRange(size, range.start, range.end)
      );
      if (rangeConfig) {
        return {
          materialCostMultiplier: rangeConfig.materialCostMultiplier,
          laborCostMultiplier: rangeConfig.laborCostMultiplier,
          overheadCostMultiplier: rangeConfig.overheadCostMultiplier,
          manufacturingTimeMultiplier: rangeConfig.manufacturingTimeMultiplier,
          complexityAdjustment: rangeConfig.complexityAdjustment
        };
      }
    }

    // Finally, use default multipliers or design defaults
    if (design.defaultSizeMultipliers) {
      return {
        materialCostMultiplier: design.defaultSizeMultipliers.materialCostMultiplier,
        laborCostMultiplier: design.defaultSizeMultipliers.laborCostMultiplier,
        overheadCostMultiplier: design.defaultSizeMultipliers.overheadCostMultiplier,
        manufacturingTimeMultiplier: design.defaultSizeMultipliers.manufacturingTimeMultiplier
      };
    }

    // Fallback to default size ranges
    const defaultRange = this.DEFAULT_SIZE_RANGES.find(range => 
      this.isSizeInRange(size, range.start, range.end)
    );

    if (defaultRange) {
      return {
        materialCostMultiplier: defaultRange.materialCostMultiplier,
        laborCostMultiplier: defaultRange.laborCostMultiplier,
        overheadCostMultiplier: defaultRange.overheadCostMultiplier,
        manufacturingTimeMultiplier: defaultRange.manufacturingTimeMultiplier,
        complexityAdjustment: defaultRange.complexityAdjustment
      };
    }

    // Ultimate fallback - no multipliers
    return {
      materialCostMultiplier: 1.0,
      laborCostMultiplier: 1.0,
      overheadCostMultiplier: 1.0,
      manufacturingTimeMultiplier: 1.0
    };
  }

  /**
   * Check if a size falls within a range
   */
  private static isSizeInRange(size: string, start: string, end: string): boolean {
    const sizeValue = this.extractSizeValue(size);
    const startValue = this.extractSizeValue(start);
    const endValue = this.extractSizeValue(end);
    
    return sizeValue >= startValue && sizeValue <= endValue;
  }

  /**
   * Extract numeric value from size string (e.g., "2Y" -> 2, "16Y" -> 16)
   */
  private static extractSizeValue(size: string): number {
    const match = size.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  /**
   * Get all available sizes for a design
   */
  static getAvailableSizes(design: Design): string[] {
    if (design.sizeConfigurations) {
      return design.sizeConfigurations.map(config => config.size);
    }
    
    if (design.sizeRanges) {
      const sizes: string[] = [];
      design.sizeRanges.forEach(range => {
        const startValue = this.extractSizeValue(range.start);
        const endValue = this.extractSizeValue(range.end);
        
        for (let i = startValue; i <= endValue; i++) {
          sizes.push(`${i}Y`);
        }
      });
      return sizes;
    }

    // Default to all standard sizes
    return [...this.STANDARD_SIZES];
  }

  /**
   * Create default size configurations for a design
   */
  static createDefaultSizeConfigurations(design: Design): SizeCostConfiguration[] {
    return this.STANDARD_SIZES.map(size => {
      const multipliers = this.getSizeMultipliers(design, size);
      return {
        size,
        materialCostMultiplier: multipliers.materialCostMultiplier,
        laborCostMultiplier: multipliers.laborCostMultiplier,
        overheadCostMultiplier: multipliers.overheadCostMultiplier,
        manufacturingTimeMultiplier: multipliers.manufacturingTimeMultiplier,
        complexityAdjustment: multipliers.complexityAdjustment
      };
    });
  }

  /**
   * Auto-populate sizeCosts from design's current single values × default size multipliers.
   * This is a migration helper — converts legacy multiplier-based designs to exact per-size costs.
   */
  static generateSizeCosts(design: Design): Record<string, {
    materialCost: number;
    laborCostPerHour: number;
    manufacturingTime: number;
    overheadCost: number;
    totalCost: number;
  }> {
    const sizeCosts: Record<string, any> = {};

    // Only generate for kids sizes if design uses kids sizes; adult sizes use unscaled values
    const isKidsProduct = design.category?.toLowerCase().includes('kids') || 
                          design.category?.toLowerCase().includes('child') ||
                          false;

    if (isKidsProduct) {
      for (const size of this.STANDARD_KIDS_SIZES) {
        const multipliers = this.getSizeMultipliers(design, size);
        const matCost = design.materialCost * multipliers.materialCostMultiplier;
        const labPerHr = design.laborCost * multipliers.laborCostMultiplier;
        const mfgTime = design.manufacturingTime * multipliers.manufacturingTimeMultiplier;
        const ovhCost = design.overheadCost * multipliers.overheadCostMultiplier;
        sizeCosts[size] = {
          materialCost: matCost,
          laborCostPerHour: labPerHr,
          manufacturingTime: mfgTime,
          overheadCost: ovhCost,
          totalCost: matCost + (labPerHr * mfgTime) + ovhCost
        };
      }
    } else {
      // Adult sizes: use same cost for all sizes (no multipliers)
      for (const size of this.STANDARD_ADULT_SIZES) {
        const totalLabor = design.laborCost * design.manufacturingTime;
        const total = design.materialCost + totalLabor + design.overheadCost;
        sizeCosts[size] = {
          materialCost: design.materialCost,
          laborCostPerHour: design.laborCost,
          manufacturingTime: design.manufacturingTime,
          overheadCost: design.overheadCost,
          totalCost: total
        };
      }
    }

    return sizeCosts;
  }

  /**
   * Calculate total cost for multiple items with different sizes
   */
  static calculateMultiSizeOrderCosts(
    design: Design,
    items: Array<{ size: string; quantity: number }>
  ): {
    totalCost: number;
    totalMaterialCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    totalManufacturingTime: number;
    itemBreakdown: Array<{
      size: string;
      quantity: number;
      materialCost: number;
      laborCost: number;
      overheadCost: number;
      totalCost: number;
      manufacturingTime: number;
    }>;
  } {
    let totalCost = 0;
    let totalMaterialCost = 0;
    let totalLaborCost = 0;
    let totalOverheadCost = 0;
    let totalManufacturingTime = 0;

    const itemBreakdown = items.map(item => {
      const costs = this.calculateSizeSpecificCosts(design, item.size, item.quantity);
      
      totalCost += costs.totalCost;
      totalMaterialCost += costs.materialCost;
      totalLaborCost += costs.laborCost;
      totalOverheadCost += costs.overheadCost;
      totalManufacturingTime += costs.manufacturingTime;

      return {
        size: item.size,
        quantity: item.quantity,
        materialCost: costs.materialCost,
        laborCost: costs.laborCost,
        overheadCost: costs.overheadCost,
        totalCost: costs.totalCost,
        manufacturingTime: costs.manufacturingTime
      };
    });

    return {
      totalCost,
      totalMaterialCost,
      totalLaborCost,
      totalOverheadCost,
      totalManufacturingTime,
      itemBreakdown
    };
  }
}
