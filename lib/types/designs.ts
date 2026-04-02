// Design management types for accounting system
export interface Design {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  image?: string;
  images?: string[];
  
  // Cost configuration (in EGP)
  materialCost: number; // Material cost per unit in EGP
  laborCost: number; // Labor cost per unit in EGP
  overheadCost: number; // Overhead cost per unit in EGP
  totalCost: number; // Calculated total cost in EGP
  
  // Manufacturing details
  manufacturingTime: number; // Hours required
  complexity: 'low' | 'medium' | 'high';
  materials: Material[];
  processes: Process[];
  
  // Status and metadata
  status: 'active' | 'inactive' | 'discontinued';
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  
  // Accounting integration
  inventoryAccount?: string;
  cogsAccount?: string;
  revenueAccount?: string;
  
  // Additional fields
  tags?: string[];
  notes?: string;
  variants?: DesignVariant[];
  
  // Size-specific cost configuration
  sizeConfigurations?: SizeCostConfiguration[]; // Individual size configurations
  sizeRanges?: SizeRange[]; // Range-based configurations (e.g., 2Y-6Y, 7Y-10Y, etc.)
  defaultSizeMultipliers?: {
    materialCostMultiplier: number;
    laborCostMultiplier: number;
    overheadCostMultiplier: number;
    manufacturingTimeMultiplier: number;
  };
}

export interface Material {
  id: string;
  name: string;
  type: 'fabric' | 'hardware' | 'trim' | 'packaging' | 'other';
  unit: 'meter' | 'piece' | 'kg' | 'liter' | 'other';
  quantityPerUnit: number;
  costPerUnit: number; // Cost per unit in EGP
  supplier?: string;
  specifications?: string;
  
  // Inventory integration
  inventoryItemId?: string; // Reference to inventory item
  inventoryItemName?: string; // Cached name for display
  inventoryItemSku?: string; // Cached SKU for display
  availableQuantity?: number; // Current available quantity in inventory
}

export interface Process {
  id: string;
  name: string;
  type: 'cutting' | 'sewing' | 'finishing' | 'packaging' | 'other';
  timeRequired: number; // Hours
  costPerHour: number; // Cost per hour in EGP
  equipment?: string;
  skills?: string[];
}

export interface DesignVariant {
  id: string;
  name: string;
  color?: string;
  size?: string;
  material?: string;
  costAdjustment: number; // Additional cost for this variant in EGP
}

export interface SizeCostConfiguration {
  size: string; // e.g., "2Y", "3Y", "4Y", etc.
  materialCostMultiplier: number; // Multiplier for base material cost (e.g., 0.8 for smaller sizes, 1.2 for larger)
  laborCostMultiplier: number; // Multiplier for base labor cost
  overheadCostMultiplier: number; // Multiplier for base overhead cost
  manufacturingTimeMultiplier: number; // Multiplier for manufacturing time
  complexityAdjustment?: 'low' | 'medium' | 'high'; // Optional complexity adjustment for this size
}

export interface SizeRange {
  start: string; // e.g., "2Y"
  end: string; // e.g., "6Y"
  materialCostMultiplier: number;
  laborCostMultiplier: number;
  overheadCostMultiplier: number;
  manufacturingTimeMultiplier: number;
  complexityAdjustment?: 'low' | 'medium' | 'high';
}

export interface DesignFilter {
  category?: string;
  subcategory?: string;
  status?: 'active' | 'inactive' | 'discontinued';
  complexity?: 'low' | 'medium' | 'high';
  minCost?: number;
  maxCost?: number;
  minMargin?: number;
  maxMargin?: number;
}

export interface DesignStats {
  totalDesigns: number;
  activeDesigns: number;
  inactiveDesigns: number;
  discontinuedDesigns: number;
  averageCost: number;
  totalCostValue: number;
  categoryBreakdown: {
    [category: string]: number;
  };
}

// Material requirement for work orders
export interface MaterialRequirement {
  inventoryItemId: string;
  inventoryItemName: string;
  inventoryItemSku: string;
  requiredQuantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  availableQuantity: number;
  isAvailable: boolean;
}
