import { NextRequest, NextResponse } from "next/server"
import { db, COLLECTIONS } from "@/lib/firebase"

export async function GET() {
  try {
    // Fetch chart of accounts from Firestore
    const accountsSnapshot = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).get()
    const accounts = accountsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Fetch journal entries from Firestore
    const journalSnapshot = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).get()
    const journalEntries = journalSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date()
    }))

    return NextResponse.json({
      accounts: accounts.length > 0 ? accounts : [],
      journalEntries: journalEntries.length > 0 ? journalEntries : []
    })
  } catch (error) {
    console.error("Error fetching chart of accounts:", error)
    return NextResponse.json(
      { error: "Failed to fetch chart of accounts" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    if (type === "account") {
      // Add new account
      const accountRef = await db.collection(COLLECTIONS.CHART_OF_ACCOUNTS).add({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })

      return NextResponse.json({
        id: accountRef.id,
        message: "Account created successfully"
      })
    } else if (type === "journal_entry") {
      // Add new journal entry
      const journalRef = await db.collection(COLLECTIONS.JOURNAL_ENTRIES).add({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })

      return NextResponse.json({
        id: journalRef.id,
        message: "Journal entry created successfully"
      })
    }

    return NextResponse.json(
      { error: "Invalid request type" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Error creating chart of accounts data:", error)
    return NextResponse.json(
      { error: "Failed to create chart of accounts data" },
      { status: 500 }
    )
  }
}
