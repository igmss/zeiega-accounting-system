"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  BarChart3,
  Package,
  ShoppingCart,
  FileText,
  CreditCard,
  BookOpen,
  Settings,
  Menu,
  Home,
  Users,
  Wrench,
  Palette,
  LogOut,
  User,
  Receipt,
  Landmark,
  Gavel,
  Activity,
  PenLine,
  Calculator,
  Lock,
  Box,
  Truck,
  ShoppingBag,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { signOut, useSession } from "next-auth/react"
import { hasPermission, UserRole } from "@/lib/auth"

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission: string
  section?: string
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: Home, permission: "dashboard:view", section: "Main" },
  { name: "Customers", href: "/customers", icon: Users, permission: "customers:view", section: "Operations" },
  { name: "Sales Orders", href: "/sales-orders", icon: ShoppingCart, permission: "sales-orders:view", section: "Operations" },
  { name: "Work Orders", href: "/work-orders", icon: Wrench, permission: "work-orders:view", section: "Operations" },
  { name: "Designs", href: "/designs", icon: Palette, permission: "designs:view", section: "Operations" },
  { name: "BOM Management", href: "/bom", icon: Box, permission: "bom:view", section: "Operations" },
  { name: "Inventory", href: "/inventory", icon: Package, permission: "inventory:view", section: "Inventory" },
  { name: "Purchase Orders", href: "/purchase-orders", icon: ShoppingBag, permission: "purchase-orders:view", section: "Inventory" },
  { name: "Vendors", href: "/vendors", icon: Truck, permission: "vendors:view", section: "Inventory" },
  { name: "Invoices", href: "/invoices", icon: FileText, permission: "invoices:view", section: "Finance" },
  { name: "Payments", href: "/payments", icon: CreditCard, permission: "payments:view", section: "Finance" },
  { name: "Expenses", href: "/expenses", icon: Receipt, permission: "accounting:view", section: "Finance" },
  { name: "Assets", href: "/assets", icon: Landmark, permission: "accounting:view", section: "Finance" },
  { name: "Liabilities", href: "/liabilities", icon: Gavel, permission: "accounting:view", section: "Finance" },
  { name: "IFRS 15 Contracts", href: "/contracts", icon: FileText, permission: "accounting:*", section: "Finance" },
  { name: "Journal Entries", href: "/journal-entries", icon: PenLine, permission: "journal-entries:view", section: "Accounting" },
  { name: "Chart of Accounts", href: "/chart-of-accounts", icon: BookOpen, permission: "chart-of-accounts:view", section: "Accounting" },
  { name: "Variance Analysis", href: "/variance", icon: BarChart3, permission: "accounting:*", section: "Accounting" },
  { name: "Overhead Config", href: "/overhead", icon: Calculator, permission: "accounting:*", section: "Accounting" },
  { name: "Reports", href: "/reports", icon: BarChart3, permission: "reports:view", section: "Reports" },
  { name: "Opening Balances", href: "/accounting/setup/opening-balances", icon: Settings, permission: "accounting:*", section: "System" },
  { name: "Year-End Close", href: "/year-end-close", icon: Lock, permission: "accounting:*", section: "System" },
  { name: "Background Jobs", href: "/background-jobs", icon: Activity, permission: "admin", section: "System" },
]

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="fixed top-4 left-4 z-40 md:hidden bg-transparent" aria-label="Toggle sidebar">
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-4 md:px-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-card-foreground">TEL U ASEGH — Manufacturing ERP</h1>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role

  const filteredNav = userRole
    ? navigation.filter((item) => {
        if (item.permission === "admin") return userRole === UserRole.ADMIN
        return hasPermission(userRole, item.permission)
      })
    : navigation

  const sections = filteredNav.reduce<Record<string, NavItem[]>>((acc, item) => {
    const section = item.section || "Other"
    if (!acc[section]) acc[section] = []
    acc[section].push(item)
    return acc
  }, {})

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/auth/login" })
  }

  return (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-sidebar-primary flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground">AccuFinance</span>
        </div>
      </div>

      <nav className="flex-1 space-y-4 p-4 overflow-y-auto">
        {Object.entries(sections).map(([section, items]) => (
          <div key={section}>
            <div className="text-xs font-semibold uppercase text-sidebar-foreground/50 px-3 mb-1 tracking-wider">
              {section}
            </div>
            <div className="space-y-1">
              {items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        {session?.user && (
          <div className="flex items-center gap-2 px-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center">
              <User className="h-4 w-4 text-sidebar-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {(session.user as any).name}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {userRole}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-red-500"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
        <div className="text-xs text-sidebar-foreground/60">TEL U ASEGH — Manufacturing ERP</div>
      </div>
    </div>
  )
}

