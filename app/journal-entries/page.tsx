"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import { JournalEntryForm } from "@/components/journal-entry-form"

export default function JournalEntriesPage() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <h1 className="text-3xl font-bold mb-6">Journal Entries</h1>
        <JournalEntryForm />
      </div>
    </DashboardLayout>
  )
}
