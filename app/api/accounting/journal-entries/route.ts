import { NextResponse } from "next/server"
import { CentralizedAccountingService } from "@/lib/services/centralized-accounting-service"

// API endpoint for creating journal entries with automatic balance synchronization
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { entries, linkedDoc, description } = body
    
    // Validate input
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "Journal entries array is required" },
        { status: 400 }
      )
    }
    
    // Validate double-entry bookkeeping
    const validation = CentralizedAccountingService.validateJournalEntry(entries)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: `Invalid journal entry: ${validation.error}` },
        { status: 400 }
      )
    }
    
    // Create journal entry and auto-sync balances
    const journalEntryId = await CentralizedAccountingService.createJournalEntryAndSync(
      entries,
      linkedDoc
    )
    
    return NextResponse.json({
      success: true,
      message: "Journal entry created and balances synchronized",
      journalEntryId: journalEntryId,
      entries: entries,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error("Error creating journal entry:", error)
    return NextResponse.json(
      { error: "Failed to create journal entry" },
      { status: 500 }
    )
  }
}

// GET endpoint to fetch journal entries
export async function GET() {
  try {
    const { db, COLLECTIONS } = await import("@/lib/firebase")
    
    const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES)
      .orderBy('created_at', 'desc')
      .limit(100)
      .get()
    
    const entries = journalSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    
    return NextResponse.json({
      success: true,
      entries: entries,
      count: entries.length,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error("Error fetching journal entries:", error)
    return NextResponse.json(
      { error: "Failed to fetch journal entries" },
      { status: 500 }
    )
  }
}
