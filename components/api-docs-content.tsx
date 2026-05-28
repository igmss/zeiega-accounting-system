"use client"

import { BookOpen, Lock, Globe, AlertTriangle, RefreshCw, Webhook, BarChart3,
  Users, Package, ShoppingCart, FileText, CreditCard, Wrench, Palette,
  ClipboardList, Truck, BookOpenCheck, DollarSign, PieChart, Settings,
  Workflow, CalendarRange, ChevronDown, Copy, Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { useState } from "react"

type Endpoint = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  path: string
  description: string
  auth: string
  request?: string
  response?: string
  queryParams?: string
}

type Section = {
  id: string
  title: string
  icon: React.ReactNode
  description: string
  endpoints: Endpoint[]
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    PUT: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    PATCH: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono font-bold ${colors[method] || "bg-gray-100 text-gray-800"}`}>
      {method}
    </span>
  )
}

function AuthBadge({ auth }: { auth: string }) {
  const colors: Record<string, string> = {
    "Public": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    "JWT": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    "Admin": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "Webhook Secret": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    "CRON Secret": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[auth] || "bg-gray-100 text-gray-800"}`}>
      {auth}
    </span>
  )
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(endpoint.path)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 shrink-0">
              <MethodBadge method={endpoint.method} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono font-semibold break-all">
                  {endpoint.path}
                </code>
                <AuthBadge auth={endpoint.auth} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">{endpoint.description}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8"
            onClick={copyToClipboard}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {(endpoint.queryParams || endpoint.request || endpoint.response) && (
          <Accordion type="single" collapsible className="mt-3">
            {endpoint.queryParams && (
              <AccordionItem value="params" className="border-0">
                <AccordionTrigger className="py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Query Parameters
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{endpoint.queryParams}</pre>
                </AccordionContent>
              </AccordionItem>
            )}
            {endpoint.request && (
              <AccordionItem value="request" className="border-0">
                <AccordionTrigger className="py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Request Body
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{endpoint.request}</pre>
                </AccordionContent>
              </AccordionItem>
            )}
            {endpoint.response && (
              <AccordionItem value="response" className="border-0">
                <AccordionTrigger className="py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Response
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">{endpoint.response}</pre>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </CardContent>
    </Card>
  )
}

function SectionCard({ section }: { section: Section }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {section.icon}
          </div>
          <div>
            <CardTitle className="text-xl">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.endpoints.map((ep, i) => (
          <EndpointCard key={i} endpoint={ep} />
        ))}
      </CardContent>
    </Card>
  )
}

export function ApiDocsContent() {
  const [activeTab, setActiveTab] = useState("overview")

  const sections: Section[] = [
    {
      id: "dashboard",
      title: "Dashboard",
      icon: <BarChart3 className="h-5 w-5" />,
      description: "Aggregated KPI data for the main dashboard view",
      endpoints: [
        {
          method: "GET",
          path: "/api/dashboard",
          description: "Retrieve aggregated KPI data including monthly revenue, top customers, recent orders, inventory alerts, and work order status",
          auth: "JWT",
          response: `{
  kpiData: { totalRevenue, totalOrders, activeWorkOrders, pendingPayroll },
  monthlyRevenue: [{ month, revenue, cost, profit }],
  topCustomers: [{ id, name, totalSpent, orderCount }],
  recentOrders: [{ id, customer_name, total, status, created_at }],
  inventoryAlerts: [{ item, currentStock, reorderLevel }],
  workOrderStatus: { pending, in_progress, completed }
}`,
        },
      ],
    },
    {
      id: "customers",
      title: "Customers",
      icon: <Users className="h-5 w-5" />,
      description: "Manage your customer database",
      endpoints: [
        {
          method: "GET",
          path: "/api/customers",
          description: "List customers with cursor-based pagination",
          auth: "JWT",
          queryParams: "limit (number, default: 50) — Items per page\ncursor (string) — Pagination cursor from previous response",
          response: `{
  data: [{ id, name, email, phone, address, createdAt, updatedAt, totalOrders, totalSpent, lastOrderDate }],
  nextCursor: string | null,
  hasMore: boolean
}`,
        },
        {
          method: "POST",
          path: "/api/customers",
          description: "Create a new customer",
          auth: "JWT",
          request: `{
  name: string,
  email?: string,
  phone?: string,
  address?: string
}`,
          response: `{ id, name, email, phone, address, createdAt, updatedAt, totalOrders, totalSpent, lastOrderDate }`,
        },
        {
          method: "PUT",
          path: "/api/customers",
          description: "Update an existing customer",
          auth: "JWT",
          request: `{
  id: string,
  name?: string,
  email?: string,
  phone?: string,
  address?: string
}`,
        },
        {
          method: "DELETE",
          path: "/api/customers?id={id}",
          description: "Delete a customer by ID",
          auth: "JWT",
          queryParams: "id (string, required) — Customer ID",
          response: `{ success: true }`,
        },
      ],
    },
    {
      id: "inventory",
      title: "Inventory",
      icon: <Package className="h-5 w-5" />,
      description: "Manage inventory items, stock levels, and movements",
      endpoints: [
        {
          method: "GET",
          path: "/api/inventory",
          description: "List all inventory items",
          auth: "JWT",
          response: `[{ id, sku, name, type: "raw"|"finished", unit, quantity_on_hand, cost_per_unit, reorder_level }]`,
        },
        {
          method: "POST",
          path: "/api/inventory",
          description: "Create inventory item with optional journal entry for purchase",
          auth: "JWT",
          request: `{
  sku: string,
  name: string,
  type: "raw" | "finished",
  unit: string,
  quantity_on_hand: number,
  cost_per_unit: number,
  reorder_level?: number,
  paymentSource?: "cash" | "bank" | "payable" | "opening"
}`,
        },
        {
          method: "PUT",
          path: "/api/inventory",
          description: "Update inventory item",
          auth: "JWT",
          request: `{ id: string, name?: string, cost_per_unit?: number, reorder_level?: number }`,
        },
        {
          method: "DELETE",
          path: "/api/inventory?id={id}",
          description: "Delete an inventory item",
          auth: "JWT",
        },
        {
          method: "GET",
          path: "/api/inventory/items",
          description: "Filter inventory items by type and search term",
          auth: "JWT",
          queryParams: "type (string) — \"raw\" | \"finished\"\nsearch (string) — Search query",
          response: `{ success: boolean, data: [...], count: number }`,
        },
        {
          method: "POST",
          path: "/api/inventory/adjust",
          description: "Adjust inventory quantity with journal entry creation",
          auth: "JWT",
          request: `{
  itemId: string,
  adjustmentQty: number,
  reason: string,
  adjustmentType: "set" | "add" | "subtract"
}`,
        },
        {
          method: "POST",
          path: "/api/inventory/sync-balances",
          description: "Sync inventory valuation balances",
          auth: "JWT",
        },
      ],
    },
    {
      id: "inventory-movements",
      title: "Inventory Movements",
      icon: <RefreshCw className="h-5 w-5" />,
      description: "Track stock movement history",
      endpoints: [
        {
          method: "GET",
          path: "/api/inventory-movements",
          description: "List all inventory movements",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/inventory-movements",
          description: "Create an inventory movement record",
          auth: "JWT",
        },
      ],
    },
    {
      id: "sales-orders",
      title: "Sales Orders",
      icon: <ShoppingCart className="h-5 w-5" />,
      description: "Manage manual and synced sales orders",
      endpoints: [
        {
          method: "GET",
          path: "/api/sales-orders",
          description: "List sales orders with cursor-based pagination",
          auth: "JWT",
          queryParams: "limit (number, default: 50)\ncursor (string)",
        },
        {
          method: "POST",
          path: "/api/sales-orders",
          description: "Create a manual sales order with accounting journal entry",
          auth: "JWT",
          request: `{
  items: [{ product_id, product_name, quantity, unit_price, total }],
  customer_name: string,
  total: number,
  notes?: string
}`,
        },
        {
          method: "PUT",
          path: "/api/sales-orders",
          description: "Update order status. If status=\"producing\", auto-creates work order with design costs",
          auth: "JWT",
          request: `{ orderId: string, status: string }`,
        },
        {
          method: "POST",
          path: "/api/sales-orders/sync",
          description: "Manually trigger sync of website orders to accounting system",
          auth: "JWT",
        },
      ],
    },
    {
      id: "invoices",
      title: "Invoices",
      icon: <FileText className="h-5 w-5" />,
      description: "Create and manage invoices with revenue recognition",
      endpoints: [
        {
          method: "GET",
          path: "/api/invoices",
          description: "List invoices with cursor-based pagination",
          auth: "JWT",
          queryParams: "limit (number, default: 50)\ncursor (string)",
        },
        {
          method: "POST",
          path: "/api/invoices",
          description: "Create invoice with revenue and COGS journal entries",
          auth: "JWT",
          request: `{
  amount: number,
  tax_amount?: number,
  total_amount: number,
  cost_of_goods_sold?: number,
  customer_id: string,
  customer_name: string,
  items?: [{ description, quantity, unit_price, total }],
  due_date: string (ISO date),
  sales_order_id?: string,
  notes?: string
}`,
          response: `{ id, invoiceNumber, amount, tax_amount, total_amount, status, customer, due_date, created_at }`,
        },
      ],
    },
    {
      id: "payments",
      title: "Payments",
      icon: <CreditCard className="h-5 w-5" />,
      description: "Record and track customer payments",
      endpoints: [
        {
          method: "GET",
          path: "/api/payments",
          description: "List payments with cursor-based pagination",
          auth: "JWT",
          queryParams: "limit (number, default: 50)\ncursor (string)",
        },
        {
          method: "POST",
          path: "/api/payments",
          description: "Record a payment against an invoice with journal entry creation",
          auth: "JWT",
          request: `{
  amount: number,
  invoice_id: string,
  payment_method: "cash" | "bank" | "card",
  date?: string (ISO date),
  reference_number?: string,
  notes?: string
}`,
        },
      ],
    },
    {
      id: "work-orders",
      title: "Work Orders",
      icon: <Wrench className="h-5 w-5" />,
      description: "Manufacturing work order lifecycle management",
      endpoints: [
        {
          method: "GET",
          path: "/api/work-orders",
          description: "List all work orders with design information",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/work-orders",
          description: "Create a work order. Auto-calculates costs from design or auto-costs from order items",
          auth: "JWT",
          request: `{
  salesOrderId?: string,
  designId?: string,
  quantity: number,
  assigned_worker?: string,
  notes?: string
}`,
        },
        {
          method: "PUT",
          path: "/api/work-orders",
          description: "Update work order (whitelisted fields only)",
          auth: "JWT",
          request: `{
  id: string,
  status?: string,
  completionPercentage?: number,
  notes?: string,
  assigned_worker?: string,
  started_at?: string,
  completed_at?: string
}`,
        },
        {
          method: "GET",
          path: "/api/work-orders/[id]",
          description: "Get a single work order with design and material requirements",
          auth: "JWT",
          response: `{ workOrder, design, materialRequirements }`,
        },
        {
          method: "PUT",
          path: "/api/work-orders/[id]",
          description: "Update specific work order (status, completionPercentage, notes, estimated_completion)",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/work-orders/[id]/complete",
          description: "Complete a work order and move WIP to finished goods",
          auth: "JWT",
          request: `{ designId: string, quantity: number }`,
        },
        {
          method: "POST",
          path: "/api/work-orders/[id]/issue-materials",
          description: "Issue materials to a work order (WIP transfer)",
          auth: "JWT",
          request: `{ designId: string, quantity: number }`,
        },
        {
          method: "GET",
          path: "/api/work-orders/[id]/profitability",
          description: "Calculate profitability for a specific work order",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/work-orders/complete",
          description: "Legacy: complete a work order",
          auth: "JWT",
          request: `{ workOrderId: string }`,
        },
        {
          method: "POST",
          path: "/api/work-orders/issue-materials",
          description: "Legacy: issue materials to a work order",
          auth: "JWT",
          request: `{ workOrderId: string, materials: [{ item_id, qty, cost }] }`,
        },
        {
          method: "POST",
          path: "/api/work-orders/update-materials",
          description: "Full update: reverses old materials/labor/overhead and applies new values",
          auth: "JWT",
          request: `{
  workOrderId: string,
  materials?: [{ item_id, qty, cost }],
  laborHours?: number,
  laborCost?: number,
  overheadCost?: number
}`,
        },
        {
          method: "POST",
          path: "/api/work-orders/update-costs",
          description: "Update single work order costs from design",
          auth: "JWT",
          request: `{ workOrderId: string, orderId?: string }`,
        },
        {
          method: "POST",
          path: "/api/work-orders/auto-update",
          description: "Batch auto-cost update for all work orders",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/work-orders/ensure-costs",
          description: "Ensure all work orders have costs calculated",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/work-orders/batch-update-costs",
          description: "Batch update work order costs (skips if already has cost)",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/work-orders/fix-costs",
          description: "Fix work orders that are missing costs",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/work-orders/background-job",
          description: "Trigger background cost calculation job",
          auth: "JWT",
        },
      ],
    },
    {
      id: "designs",
      title: "Designs",
      icon: <Palette className="h-5 w-5" />,
      description: "Garment design management with multi-size BOM and cost estimation",
      endpoints: [
        {
          method: "GET",
          path: "/api/designs",
          description: "List designs with filters",
          auth: "JWT",
          queryParams: "category? — Filter by category\nstatus? — Filter by status\ncomplexity? — Filter by complexity\nminCost? / maxCost? — Cost range\nminMargin? — Minimum margin\npageSize? / lastDocId? — Pagination",
        },
        {
          method: "POST",
          path: "/api/designs",
          description: "Create a new design",
          auth: "JWT",
        },
        {
          method: "GET",
          path: "/api/designs/[id]",
          description: "Get a single design by ID",
          auth: "JWT",
        },
        {
          method: "PUT",
          path: "/api/designs/[id]",
          description: "Update a design",
          auth: "JWT",
        },
        {
          method: "DELETE",
          path: "/api/designs/[id]",
          description: "Delete a design",
          auth: "JWT",
        },
        {
          method: "GET",
          path: "/api/designs/[id]/material-requirements",
          description: "Get material requirements with availability check",
          auth: "JWT",
          queryParams: "quantity (number) — Production quantity",
        },
        {
          method: "GET",
          path: "/api/designs/stats",
          description: "Get design statistics",
          auth: "JWT",
        },
        {
          method: "GET",
          path: "/api/designs/categories",
          description: "List design categories and subcategories",
          auth: "JWT",
          queryParams: "category? — Filter by parent category",
        },
        {
          method: "POST",
          path: "/api/designs/import",
          description: "Import designs from website products",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/designs/fix-costs",
          description: "Fix design totalCost calculations",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/designs/multi-size-costs",
          description: "Calculate multi-size design costs",
          auth: "JWT",
          request: `{ designId: string, sizeQuantities: [{ size: string, quantity: number }] }`,
        },
        {
          method: "POST",
          path: "/api/designs/migrate-size-costs",
          description: "Migrate all designs to size-based costing",
          auth: "Admin",
        },
      ],
    },
    {
      id: "bom",
      title: "Bill of Materials",
      icon: <ClipboardList className="h-5 w-5" />,
      description: "BOM definitions for designs",
      endpoints: [
        {
          method: "GET",
          path: "/api/bom",
          description: "List BOMs with optional filters",
          auth: "JWT",
          queryParams: "designId? — Filter by design\nstatus? (draft|active|archived)\nlimit? — Page size",
        },
        {
          method: "POST",
          path: "/api/bom",
          description: "Create a new BOM",
          auth: "JWT",
          request: `{
  design_id: string,
  name: string,
  items: [{ item_id, quantity, unit_cost }],
  labor_hours?: number,
  labor_rate?: number,
  overhead_percentage?: number,
  notes?: string
}`,
        },
        {
          method: "GET",
          path: "/api/bom/[id]",
          description: "Get a single BOM by ID",
          auth: "JWT",
        },
        {
          method: "PUT",
          path: "/api/bom/[id]",
          description: "Update a BOM",
          auth: "JWT",
        },
        {
          method: "DELETE",
          path: "/api/bom/[id]",
          description: "Delete a BOM",
          auth: "JWT",
        },
      ],
    },
    {
      id: "vendors",
      title: "Vendors",
      icon: <Truck className="h-5 w-5" />,
      description: "Supplier/vendor management",
      endpoints: [
        {
          method: "GET",
          path: "/api/vendors",
          description: "List vendors with optional filters",
          auth: "JWT",
          queryParams: "status? (active|inactive)\nsearch? — Search query\nminRating? — Minimum rating filter",
        },
        {
          method: "POST",
          path: "/api/vendors",
          description: "Create a new vendor",
          auth: "JWT",
          request: `{
  name: string,
  contact_name?: string,
  email?: string,
  phone?: string,
  address?: string,
  payment_terms?: string,
  lead_time_days?: number,
  notes?: string,
  status?: "active" | "inactive"
}`,
        },
        {
          method: "GET",
          path: "/api/vendors/[id]",
          description: "Get a vendor by ID",
          auth: "JWT",
        },
        {
          method: "PUT",
          path: "/api/vendors/[id]",
          description: "Update a vendor",
          auth: "JWT",
        },
        {
          method: "DELETE",
          path: "/api/vendors/[id]",
          description: "Deactivate a vendor",
          auth: "JWT",
        },
      ],
    },
    {
      id: "purchase-orders",
      title: "Purchase Orders",
      icon: <ClipboardList className="h-5 w-5" />,
      description: "Procurement and purchase order management",
      endpoints: [
        {
          method: "GET",
          path: "/api/purchase-orders",
          description: "List purchase orders with filters",
          auth: "JWT",
          queryParams: "vendorId? — Filter by vendor\nstatus? — Filter by status\nlimit? — Page size",
        },
        {
          method: "POST",
          path: "/api/purchase-orders",
          description: "Create a purchase order",
          auth: "JWT",
          request: `{
  vendor_id: string,
  items: [{ item_id, item_name, quantity, unit_cost }],
  expected_delivery?: string (ISO date),
  shipping_address?: string,
  shipping_cost?: number,
  tax_rate?: number,
  notes?: string
}`,
        },
        {
          method: "GET",
          path: "/api/purchase-orders/[id]",
          description: "Get a purchase order by ID",
          auth: "JWT",
        },
        {
          method: "PUT",
          path: "/api/purchase-orders/[id]",
          description: "Perform action on a purchase order",
          auth: "JWT",
          request: `{
  action: "send" | "confirm" | "receive" | "cancel",
  items?: [{ item_id, quantity_received }],
  reason?: string
}`,
        },
      ],
    },
    {
      id: "chart-of-accounts",
      title: "Chart of Accounts",
      icon: <BookOpen className="h-5 w-5" />,
      description: "Accounting chart of accounts with live balances",
      endpoints: [
        {
          method: "GET",
          path: "/api/chart-of-accounts",
          description: "Get all accounts with live balances derived from journal entries",
          auth: "JWT",
          response: `{ accounts: Account[], journalEntries: JournalEntry[] }`,
        },
        {
          method: "POST",
          path: "/api/chart-of-accounts",
          description: "Add a custom account",
          auth: "JWT",
          request: `{ type: "account", data: { code, name, type, subType, normalBalance } }`,
        },
        {
          method: "POST",
          path: "/api/chart-of-accounts/initialize",
          description: "Initialize the full chart of accounts from the system constant + create fiscal periods",
          auth: "Admin",
        },
      ],
    },
    {
      id: "journal-entries",
      title: "Journal Entries",
      icon: <BookOpenCheck className="h-5 w-5" />,
      description: "Double-entry journal entry management",
      endpoints: [
        {
          method: "GET",
          path: "/api/journal-entries",
          description: "List journal entries with date range and type filters",
          auth: "JWT",
          queryParams: "limit? (number, default: 50)\nstartDate? / endDate? — Date range filter\ntype? — Filter by journal entry type",
        },
        {
          method: "POST",
          path: "/api/journal-entries",
          description: "Create a manual journal entry. Validates balanced entry and fiscal period",
          auth: "JWT",
          request: `{
  date: string (ISO date),
  memo: string,
  reference?: string,
  entries: [{ account_id, account_name, description, debit: number, credit: number }],
  type?: string
}`,
        },
      ],
    },
    {
      id: "accounting",
      title: "Accounting Sub-system",
      icon: <DollarSign className="h-5 w-5" />,
      description: "Opening balances, expense/asset/liability tracking, VAT, and balance sync",
      endpoints: [
        {
          method: "POST",
          path: "/api/accounting/sync-balances",
          description: "Sync account balances from journal entries",
          auth: "JWT",
          request: `{ syncAll?: boolean } or { accountIds?: string[] }`,
        },
        {
          method: "GET",
          path: "/api/accounting/sync-balances",
          description: "Get current account balances",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/accounting/opening-balances",
          description: "Record opening balances. Creates journal entries OB-01 through OB-GEN",
          auth: "JWT",
          request: `{
  date: string (ISO date),
  cashOnHand: number,
  bankAccounts: { name, balance }[],
  receivables: { customer, amount }[],
  inventory: { item, quantity, value }[],
  fixedAssets: { description, value }[],
  partnerCapital: { partner, amount }[],
  liabilities: { creditor, amount }[],
  loans: { lender, amount }[]
}`,
        },
        {
          method: "POST",
          path: "/api/accounting/expenses",
          description: "Record a business expense with journal entry",
          auth: "JWT",
          request: `{ amount: number, description: string, expenseAccount: string, paymentMethod: "cash"|"bank" }`,
        },
        {
          method: "GET",
          path: "/api/accounting/expenses",
          description: "List recorded expenses",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/accounting/assets",
          description: "Record a fixed asset purchase",
          auth: "JWT",
          request: `{
  amount: number,
  description: string,
  assetAccount: string,
  paymentMethod: "cash"|"bank",
  useful_life_years?: number,
  salvage_value?: number,
  depreciation_method?: "straight-line"
}`,
        },
        {
          method: "GET",
          path: "/api/accounting/assets",
          description: "List fixed assets",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/accounting/assets/depreciate",
          description: "Record depreciation for an asset",
          auth: "JWT",
          request: `{ assetEntryId: string, year: number, month: number }`,
        },
        {
          method: "POST",
          path: "/api/accounting/liabilities",
          description: "Record a liability (incur or repay)",
          auth: "JWT",
          request: `{
  amount: number,
  description: string,
  liabilityAccount: string,
  offsetAccount?: string,
  transactionType: "incur" | "repay"
}`,
        },
        {
          method: "GET",
          path: "/api/accounting/liabilities",
          description: "List liabilities",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/accounting/vat/pay",
          description: "Pay VAT. Validates balance before creating journal entry",
          auth: "JWT",
          request: `{ amount: number, paymentMethod: "cash"|"bank", periodDescription?: string }`,
        },
      ],
    },
    {
      id: "loans",
      title: "Loans",
      icon: <DollarSign className="h-5 w-5" />,
      description: "Loan recording and tracking",
      endpoints: [
        {
          method: "POST",
          path: "/api/loans",
          description: "Record a loan with journal entry",
          auth: "JWT",
          request: `{
  amount: number,
  description: string,
  lenderName: string,
  loanType: "short-term" | "long-term",
  receivedVia: "cash" | "bank"
}`,
        },
        {
          method: "GET",
          path: "/api/loans",
          description: "List loans (derived from journal entries)",
          auth: "JWT",
        },
      ],
    },
    {
      id: "reports",
      title: "Financial Reports",
      icon: <PieChart className="h-5 w-5" />,
      description: "Financial statement generation and reporting",
      endpoints: [
        {
          method: "GET",
          path: "/api/reports/profit-loss",
          description: "Generate Profit & Loss statement with monthly trend data",
          auth: "JWT",
          queryParams: "from (string, ISO date, required) — Start date\nto (string, ISO date, required) — End date",
          response: `{
  revenue: number,
  cost_of_goods_sold: number,
  gross_profit: number,
  operating_expenses: number,
  operating_income: number,
  other_income_expenses: number,
  net_income: number,
  monthlyTrend: [{ month, revenue, cost, profit }]
}`,
        },
        {
          method: "GET",
          path: "/api/reports/income-statement",
          description: "Simplified income statement",
          auth: "JWT",
          queryParams: "startDate? / endDate? (ISO date)",
        },
        {
          method: "GET",
          path: "/api/reports/balance-sheet",
          description: "Generate Balance Sheet (uses 'to' parameter as the as-of date)",
          auth: "JWT",
          queryParams: "from? (ISO date)\nto? (ISO date) — As-of date for the balance sheet",
          response: `{
  assets: { current: { cash, receivables, inventory, prepaid }, fixed: { gross, depreciation, net }, total: number },
  liabilities: { current: { payables, vat, accrued }, long_term: { loans }, total: number },
  equity: { capital, retained_earnings, current_income, total: number }
}`,
        },
        {
          method: "GET",
          path: "/api/reports/cash-flow",
          description: "Generate Cash Flow Statement (operating, investing, financing)",
          auth: "JWT",
          queryParams: "from? (ISO date)\nto? (ISO date)",
          response: `{
  operating: { net_income, adjustments, changes_in_working_capital, net: number },
  investing: { purchase_of_assets, ... },
  financing: { loan_proceeds, loan_repayments, capital_contributions, ... },
  net_change_in_cash: number,
  beginning_cash: number,
  ending_cash: number
}`,
        },
        {
          method: "GET",
          path: "/api/reports/trial-balance",
          description: "Generate Trial Balance",
          auth: "JWT",
          queryParams: "asOf? (ISO date)",
        },
        {
          method: "GET",
          path: "/api/reports/general-ledger",
          description: "Generate General Ledger with account-level transactions",
          auth: "JWT",
          queryParams: "from? / to? (ISO date range)\naccountCode? (string) — Filter by account",
          response: `{
  accounts: [{
    code, name,
    openingBalance: { debit, credit },
    transactions: [{ date, description, reference, debit, credit, balance }],
    closingBalance: { debit, credit }
  }]
}`,
        },
        {
          method: "GET",
          path: "/api/reports/ar-aging",
          description: "Generate Accounts Receivable Aging Report",
          auth: "JWT",
          queryParams: "to? (ISO date)",
          response: `Buckets: current, 31-60, 61-90, over_90 days`,
        },
        {
          method: "GET",
          path: "/api/reports/cogm",
          description: "Generate Cost of Goods Manufactured report",
          auth: "JWT",
          queryParams: "from? / to? (ISO date range)",
          response: `{
  direct_materials: number,
  direct_labor: number,
  manufacturing_overhead: number,
  total_manufacturing_costs: number,
  wip: { beginning, ending },
  cost_of_goods_manufactured: number
}`,
        },
        {
          method: "GET",
          path: "/api/reports/inventory-valuation",
          description: "Generate Inventory Valuation Report",
          auth: "JWT",
          response: `{ inventoryData, inventoryByType, totalInventoryValue, summary }`,
        },
        {
          method: "GET",
          path: "/api/reports/job-profitability",
          description: "Generate Job/Work Order Profitability Report",
          auth: "JWT",
          queryParams: "from? / to? (ISO date range)",
          response: `{ jobData, chartData, summary }`,
        },
        {
          method: "GET",
          path: "/api/reports/tax-vat",
          description: "Generate VAT/Tax Report",
          auth: "JWT",
          queryParams: "from? / to? (ISO date range)",
          response: `{
  vat_rate: number,
  taxable_sales: number,
  taxable_purchases: number,
  output_vat_posted: number,
  input_vat_posted: number,
  net_vat_payable: number,
  vat_already_filed: number,
  vat_outstanding: number
}`,
        },
      ],
    },
    {
      id: "overhead",
      title: "Overhead (POHR)",
      icon: <Settings className="h-5 w-5" />,
      description: "Predetermined Overhead Rate configuration and application",
      endpoints: [
        {
          method: "GET",
          path: "/api/overhead/config",
          description: "Get POHR configurations for a fiscal year",
          auth: "JWT",
          queryParams: "fiscalYear? (number, default: current)",
        },
        {
          method: "POST",
          path: "/api/overhead/config",
          description: "Create overhead rate configuration",
          auth: "JWT",
          request: `{
  fiscalYear: number,
  allocationBase: "DLH" | "MH" | "DL_COST" | "UNITS" | "MATERIAL_COST",
  estimatedTotalOH: number,
  estimatedActivityLevel: number,
  department?: string,
  userId?: string
}`,
        },
        {
          method: "POST",
          path: "/api/overhead/apply",
          description: "Apply overhead to a work order",
          auth: "JWT",
          request: `{
  workOrderId: string,
  actualActivity: number,
  pohr: number,
  fiscalYear: number,
  userId?: string
}`,
        },
      ],
    },
    {
      id: "variance",
      title: "Variance Analysis",
      icon: <BarChart3 className="h-5 w-5" />,
      description: "Cost variance analysis (material, labor, overhead)",
      endpoints: [
        {
          method: "POST",
          path: "/api/variance/analyze",
          description: "Analyze variance for a work order against standard cost",
          auth: "JWT",
          request: `{ workOrderId: string, designId: string }`,
        },
        {
          method: "POST",
          path: "/api/variance/close",
          description: "Close variance accounts to COGS",
          auth: "JWT",
          request: `{ userId?: string }`,
        },
        {
          method: "POST",
          path: "/api/variance/standard-cost",
          description: "Set standard cost for a design",
          auth: "JWT",
          request: `{
  designId: string,
  designName: string,
  materialCost?: number,
  laborCost?: number,
  overheadCost?: number,
  userId?: string
}`,
        },
      ],
    },
    {
      id: "contracts",
      title: "Contracts (Revenue Recognition)",
      icon: <FileText className="h-5 w-5" />,
      description: "IFRS 15 / ASC 606 contract management and revenue recognition",
      endpoints: [
        {
          method: "GET",
          path: "/api/contracts",
          description: "List active contracts",
          auth: "JWT",
        },
        {
          method: "POST",
          path: "/api/contracts",
          description: "Create a contract with revenue recognition method",
          auth: "JWT",
          request: `{
  salesOrderId: string,
  customerId: string,
  customerName: string,
  description: string,
  contractPrice: number,
  totalEstimatedCost: number,
  estimatedCompletionDate: string (ISO date),
  method: "percentage_of_completion" | "...",
  overTimeCriterion?: string,
  userId?: string
}`,
        },
        {
          method: "POST",
          path: "/api/contracts/recognize",
          description: "Recognize revenue for a contract based on costs incurred",
          auth: "JWT",
          request: `{ contractId: string, costsIncurredThisPeriod: number, userId?: string }`,
        },
        {
          method: "POST",
          path: "/api/contracts/onerous",
          description: "Check if a contract is onerous (expected loss)",
          auth: "JWT",
          request: `{ contractId: string }`,
          response: `{ isOnerous: boolean, expectedLoss: number, contract: Contract }`,
        },
      ],
    },
    {
      id: "workflow",
      title: "Workflow",
      icon: <Workflow className="h-5 w-5" />,
      description: "End-to-end business process automation",
      endpoints: [
        {
          method: "POST",
          path: "/api/workflow/complete-order",
          description: "End-to-end order completion: updates status, completes work orders, generates invoice + AR/COGS journal entries",
          auth: "JWT",
          request: `{ orderId: string }`,
        },
      ],
    },
    {
      id: "fiscal",
      title: "Fiscal Year",
      icon: <CalendarRange className="h-5 w-5" />,
      description: "Fiscal period and year-end close management",
      endpoints: [
        {
          method: "POST",
          path: "/api/fiscal/close",
          description: "Execute year-end close: close income/expense accounts to retained earnings",
          auth: "Admin",
          request: `{ fiscalYear: number, userId?: string }`,
        },
      ],
    },
    {
      id: "real-orders",
      title: "Real Orders (Website)",
      icon: <ShoppingCart className="h-5 w-5" />,
      description: "Website order integration and mapping to accounting system",
      endpoints: [
        {
          method: "GET",
          path: "/api/real-orders",
          description: "Fetch orders and returns from website collections, mapped to sales order format",
          auth: "JWT",
        },
      ],
    },
    {
      id: "webhooks",
      title: "Webhooks",
      icon: <Webhook className="h-5 w-5" />,
      description: "External service integration endpoints",
      endpoints: [
        {
          method: "POST",
          path: "/api/webhooks/order-status",
          description: "Receive order status updates from external e-commerce website. Validates webhook secret, syncs to sales orders, creates work orders on 'processing' status",
          auth: "Webhook Secret",
          request: `{ orderId: string, status: string }`,
        },
        {
          method: "POST",
          path: "/api/webhooks/return-status",
          description: "Receive return status updates. On 'completed' status, processes the return through accounting",
          auth: "Webhook Secret",
          request: `{ returnId: string, status: string }`,
        },
      ],
    },
    {
      id: "cron",
      title: "Scheduled Jobs (CRON)",
      icon: <RefreshCw className="h-5 w-5" />,
      description: "Automated background processing jobs",
      endpoints: [
        {
          method: "GET",
          path: "/api/cron/process-orders",
          description: "Sync website orders and process overdue invoices. Requires Bearer CRON_SECRET token",
          auth: "CRON Secret",
        },
        {
          method: "GET",
          path: "/api/cron/process-returns",
          description: "Sync website returns. Requires Bearer CRON_SECRET token",
          auth: "CRON Secret",
        },
        {
          method: "GET",
          path: "/api/cron/update-inventory",
          description: "Update inventory valuations. Requires Bearer CRON_SECRET token",
          auth: "CRON Secret",
        },
      ],
    },
    {
      id: "health",
      title: "Health",
      icon: <Activity className="h-5 w-5" />,
      description: "System health and monitoring",
      endpoints: [],
    },
  ]

  const overviewContent = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AccuFinance API</CardTitle>
          <CardDescription>
            RESTful API for the AccuFinance Manufacturing ERP system — designed for Make-to-Order (MTO) garment production.
            All financial transactions use double-entry accounting with live balance derivation from journal entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Base URL</h3>
            <pre className="text-sm bg-muted p-3 rounded-md">https://your-domain.com/api</pre>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Response Format</h3>
            <p className="text-sm text-muted-foreground mb-2">All responses are JSON. Success responses use either a direct object or:</p>
            <pre className="text-sm bg-muted p-3 rounded-md">{`// Success
{ success: true, data: {...}, message?: "..." }

// Error
{ success: false, error: "Error message" }
{ success: false, error: "Validation failed", details: [{ field, message }] }

// Paginated list
{ data: [...], nextCursor: "abc...", hasMore: false }`}</pre>
          </div>
          <div>
            <h3 className="font-semibold mb-2">HTTP Status Codes</h3>
            <div className="grid gap-2">
              {[
                ["200", "OK", "Successful request"],
                ["201", "Created", "Resource created successfully"],
                ["400", "Bad Request", "Validation error - check error details"],
                ["401", "Unauthorized", "Missing or invalid JWT token"],
                ["403", "Forbidden", "Insufficient permissions"],
                ["404", "Not Found", "Resource not found"],
                ["429", "Too Many Requests", "Rate limit exceeded"],
                ["500", "Server Error", "Internal server error"],
              ].map(([code, label, desc]) => (
                <div key={code} className="flex items-center gap-3 text-sm">
                  <span className="font-mono font-semibold w-12">{code}</span>
                  <Badge variant="outline" className="font-mono">{label}</Badge>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle>Authentication</CardTitle>
          </div>
          <CardDescription>Three authentication mechanisms depending on the endpoint</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">JWT</Badge>
              Session Authentication
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Most endpoints require a valid JWT session via <code className="text-xs bg-muted px-1 rounded">next-auth</code>.
              Login at <code className="text-xs bg-muted px-1 rounded">/auth/login</code> to obtain a session cookie.
              Available roles: <Badge variant="outline">admin</Badge> <Badge variant="outline">accountant</Badge> <Badge variant="outline">warehouse</Badge> <Badge variant="outline">sales</Badge> <Badge variant="outline">production</Badge> <Badge variant="outline">viewer</Badge>
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold flex items-center gap-2">
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">Webhook Secret</Badge>
              Header-Based
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Webhook endpoints use the <code className="text-xs bg-muted px-1 rounded">x-webhook-secret</code> header for authentication.
              Value is verified against the <code className="text-xs bg-muted px-1 rounded">WEBHOOK_SECRET</code> environment variable using
              constant-time comparison.
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold flex items-center gap-2">
              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">CRON Secret</Badge>
              Bearer Token
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              CRON/scheduled job endpoints require an <code className="text-xs bg-muted px-1 rounded">authorization: Bearer &lt;CRON_SECRET&gt;</code> header.
              The <code className="text-xs bg-muted px-1 rounded">CRON_SECRET</code> is configured via environment variable.
            </p>
          </div>
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold flex items-center gap-2">Permission Model</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Permissions are checked per-endpoint. Common permissions include:
              <code className="text-xs bg-muted px-1 rounded ml-1">customers:create</code>,
              <code className="text-xs bg-muted px-1 rounded">inventory:create</code>,
              <code className="text-xs bg-muted px-1 rounded">sales-orders:create</code>,
              <code className="text-xs bg-muted px-1 rounded">invoices:create</code>,
              <code className="text-xs bg-muted px-1 rounded">work-orders:create</code>,
              <code className="text-xs bg-muted px-1 rounded">designs:create</code>,
              <code className="text-xs bg-muted px-1 rounded">bom:create</code>,
              <code className="text-xs bg-muted px-1 rounded">vendors:create</code>,
              <code className="text-xs bg-muted px-1 rounded">purchase-orders:create</code>,
              <code className="text-xs bg-muted px-1 rounded">journal-entries:create</code>,
              <code className="text-xs bg-muted px-1 rounded">accounting:create</code>,
              <code className="text-xs bg-muted px-1 rounded">reports:view</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <CardTitle>Rate Limiting</CardTitle>
          </div>
          <CardDescription>API rate limiting via Upstash Redis sliding window</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 border rounded-lg">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Limit</span><span className="font-mono font-semibold">100 requests per 60 seconds</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Response on limit</span><span className="font-mono font-semibold">429 Too Many Requests</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Header</span><span className="font-mono font-semibold">Retry-After (seconds)</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Redis unavailable</span><span className="font-mono font-semibold">503 — lets request through</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle>CORS & Security</CardTitle>
          </div>
          <CardDescription>Cross-origin and security header policies</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 border rounded-lg">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Allowed Origins</span><span className="font-mono font-semibold">Configured via ALLOWED_ORIGINS env var</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">X-Frame-Options</span><span className="font-mono">DENY</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">X-Content-Type-Options</span><span className="font-mono">nosniff</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Content Security Policy</span><span className="font-mono">Restrictive default</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-primary" />
            <CardTitle>Architecture Notes</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li><strong>Double-Entry Accounting</strong> — All financial events create balanced journal entries (debits = credits). No balance caching; balances are derived live from journal entries.</li>
            <li><strong>Chart of Accounts</strong> — Static TypeScript constant (~95 accounts), not stored in Firestore. Account codes follow numeric scheme: 1xxx Assets, 2xxx Liabilities, 3xxx Equity, 4xxx Revenue, 5xxx COGS, 6xxx Expenses, 7xxx Other.</li>
            <li><strong>Firestore Collections</strong> — All internal collections use <code className="text-xs bg-muted px-1 rounded">acc_</code> prefix. Website collections (<code className="text-xs bg-muted px-1 rounded">orders</code>, <code className="text-xs bg-muted px-1 rounded">returns</code>, <code className="text-xs bg-muted px-1 rounded">products</code>) share the same database without prefix.</li>
            <li><strong>FRICTO Model</strong> — Manufacturing order cost flow: <strong>F</strong>orecast → <strong>R</strong>eceipt → <strong>I</strong>ssue → <strong>C</strong>ompletion → <strong>T</strong>ransfer → <strong>O</strong>rder closing.</li>
            <li><strong>Fiscal Periods</strong> — Monthly periods within fiscal years. Posting date validation ensures entries fall within open periods.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <div className="sticky top-0 z-10 bg-background pb-2 -mx-2 px-2">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs">
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            Overview
          </TabsTrigger>
          {sections.filter(s => s.endpoints.length > 0).map(s => (
            <TabsTrigger key={s.id} value={s.id} className="text-xs">
              {s.icon}
              <span className="ml-1">{s.title}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="overview" className="mt-0">
        {overviewContent}
      </TabsContent>

      {sections.filter(s => s.endpoints.length > 0).map(section => (
        <TabsContent key={section.id} value={section.id} className="mt-0 space-y-4">
          <div className="flex items-center gap-2 px-1">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              {section.icon}
            </div>
            <div>
              <h2 className="text-xl font-bold">{section.title}</h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="ml-auto">
              <Badge variant="outline" className="text-xs">
                {section.endpoints.length} endpoint{section.endpoints.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
          <div className="space-y-3">
            {section.endpoints.map((ep, i) => (
              <EndpointCard key={i} endpoint={ep} />
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )
}

function Activity({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
