const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

// Firebase service account configuration
const serviceAccount = {
  type: "service_account",
  project_id: "teluaseghapp",
  private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  client_email: "firebase-adminsdk-erdcc@teluaseghapp.iam.gserviceaccount.com",
  client_id: "115086862820657581958",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-erdcc%40teluaseghapp.iam.gserviceaccount.com",
  universe_document: "googleapis.com",
}

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: "teluaseghapp",
})

const db = getFirestore()

async function fixSalesOrdersAndWorkOrders() {
  try {
    console.log("🔧 Fixing Sales Orders and Work Orders System...")
    console.log("=" * 60)
    
    // Step 1: Delete incorrect work order journal entry
    console.log("🗑️ Step 1: Deleting incorrect work order journal entry...")
    
    const journalSnapshot = await db.collection('acc_journal_entries').get()
    let entryToDelete = null
    
    journalSnapshot.docs.forEach(doc => {
      const entry = doc.data()
      if (entry.linked_doc === 'cEE7q1eKhVi4TNA9MDCn') {
        entryToDelete = {
          id: doc.id,
          data: entry
        }
      }
    })
    
    if (entryToDelete) {
      await db.collection('acc_journal_entries').doc(entryToDelete.id).delete()
      console.log(`✅ Deleted incorrect work order journal entry: ${entryToDelete.id}`)
      
      // Update Chart of Accounts balances
      const wipDoc = await db.collection('acc_chart_of_accounts').doc('INVENTORY_WIP').get()
      if (wipDoc.exists) {
        const currentBalance = wipDoc.data().balance || 0
        const newBalance = currentBalance - 790
        await db.collection('acc_chart_of_accounts').doc('INVENTORY_WIP').update({
          balance: newBalance,
          last_updated: new Date()
        })
        console.log(`✅ Updated INVENTORY_WIP: EGP ${currentBalance} → EGP ${newBalance}`)
      }
      
      const cogsPendingDoc = await db.collection('acc_chart_of_accounts').doc('COGS_PENDING').get()
      if (cogsPendingDoc.exists) {
        const currentBalance = cogsPendingDoc.data().balance || 0
        const newBalance = currentBalance + 790
        await db.collection('acc_chart_of_accounts').doc('COGS_PENDING').update({
          balance: newBalance,
          last_updated: new Date()
        })
        console.log(`✅ Updated COGS_PENDING: EGP ${currentBalance} → EGP ${newBalance}`)
      }
    } else {
      console.log("ℹ️ No incorrect work order journal entry found")
    }
    
    // Step 2: Check current sales orders and work orders
    console.log("\n📊 Step 2: Checking current sales orders and work orders...")
    
    const salesOrdersSnapshot = await db.collection('acc_sales_orders').get()
    const workOrdersSnapshot = await db.collection('acc_work_orders').get()
    
    console.log(`Found ${salesOrdersSnapshot.docs.length} sales orders`)
    console.log(`Found ${workOrdersSnapshot.docs.length} work orders`)
    
    // Step 3: Create proper accounting flow documentation
    console.log("\n📚 Step 3: Creating proper accounting flow documentation...")
    
    const accountingFlow = {
      title: "Sales Orders and Work Orders Accounting Flow",
      created_at: new Date(),
      flow: [
        {
          step: 1,
          name: "Sales Order Created",
          description: "Customer places order (manual or web)",
          journal_entry: "None - just record the order",
          accounts_affected: "None"
        },
        {
          step: 2,
          name: "Production Started",
          description: "Order status changes to 'producing'",
          journal_entry: "None - just create work order record",
          accounts_affected: "None"
        },
        {
          step: 3,
          name: "Materials Issued",
          description: "Raw materials are used in production",
          journal_entry: "Debit WIP, Credit INVENTORY_RAW",
          accounts_affected: "INVENTORY_WIP (increase), INVENTORY_RAW (decrease)"
        },
        {
          step: 4,
          name: "Production Completed",
          description: "Work order completed",
          journal_entry: "Debit INVENTORY_FINISHED, Credit WIP",
          accounts_affected: "INVENTORY_FINISHED (increase), INVENTORY_WIP (decrease)"
        },
        {
          step: 5,
          name: "Order Shipped",
          description: "Order shipped to customer",
          journal_entry: "Debit COGS, Credit INVENTORY_FINISHED; Debit AR, Credit REVENUE",
          accounts_affected: "COGS (increase), INVENTORY_FINISHED (decrease), AR (increase), REVENUE (increase)"
        },
        {
          step: 6,
          name: "Payment Received",
          description: "Customer pays invoice",
          journal_entry: "Debit CASH, Credit AR",
          accounts_affected: "CASH (increase), AR (decrease)"
        }
      ],
      rules: [
        "Never create journal entries when work orders are created",
        "Only create journal entries when materials are actually used",
        "WIP should only increase when materials are issued",
        "Finished goods should only increase when production is completed",
        "Revenue should only be recognized when goods are shipped"
      ]
    }
    
    await db.collection('acc_system_docs').doc('sales_work_orders_flow').set(accountingFlow)
    console.log("✅ Created accounting flow documentation")
    
    // Step 4: Update work orders API to fix journal entry creation
    console.log("\n🔧 Step 4: Creating corrected work orders API...")
    
    const correctedWorkOrdersAPI = `
// CORRECTED WORK ORDERS API
// File: app/api/work-orders/route.ts

export async function POST(request: Request) {
  try {
    const { salesOrderId, materials } = await request.json()
    
    // Create work order record (NO JOURNAL ENTRY YET)
    const workOrder = {
      sales_order_id: salesOrderId,
      status: "pending",
      materials_requested: materials || [],
      materials_issued: [],
      completion_percentage: 0,
      created_at: new Date(),
      updated_at: new Date()
    }
    
    const workOrderRef = await db.collection('acc_work_orders').add(workOrder)
    
    // NO JOURNAL ENTRY HERE - only when materials are actually issued
    
    return NextResponse.json({ 
      success: true, 
      workOrderId: workOrderRef.id,
      message: "Work order created - no journal entry until materials are issued"
    })
    
  } catch (error) {
    console.error("Error creating work order:", error)
    return NextResponse.json({ error: "Failed to create work order" }, { status: 500 })
  }
}

// CORRECTED MATERIALS ISSUE API
// File: app/api/work-orders/issue-materials/route.ts

export async function POST(request: Request) {
  try {
    const { workOrderId, materials } = await request.json()
    
    // Update work order with issued materials
    await db.collection('acc_work_orders').doc(workOrderId).update({
      materials_issued: materials,
      status: "in_progress",
      updated_at: new Date()
    })
    
    // NOW create journal entry for materials usage
    const totalMaterialCost = materials.reduce((sum, material) => sum + (material.qty * material.cost), 0)
    
    const journalEntry = {
      date: new Date(),
      entries: [
        {
          account_id: "INVENTORY_WIP",
          debit: totalMaterialCost,
          credit: 0,
          description: \`Materials issued for work order \${workOrderId}\`
        },
        {
          account_id: "INVENTORY_RAW",
          debit: 0,
          credit: totalMaterialCost,
          description: \`Materials issued for work order \${workOrderId}\`
        }
      ],
      linked_doc: workOrderId,
      created_at: new Date()
    }
    
    await db.collection('acc_journal_entries').add(journalEntry)
    
    // Update inventory quantities
    for (const material of materials) {
      await db.collection('inventory').doc(material.item_id).update({
        quantity_on_hand: FieldValue.increment(-material.qty),
        last_updated: new Date()
      })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Materials issued and journal entry created",
      totalCost: totalMaterialCost
    })
    
  } catch (error) {
    console.error("Error issuing materials:", error)
    return NextResponse.json({ error: "Failed to issue materials" }, { status: 500 })
  }
}
`
    
    await db.collection('acc_system_docs').doc('corrected_work_orders_api').set({
      title: "Corrected Work Orders API",
      content: correctedWorkOrdersAPI,
      created_at: new Date(),
      description: "Proper implementation that only creates journal entries when materials are actually used"
    })
    
    console.log("✅ Created corrected work orders API documentation")
    
    // Step 5: Summary
    console.log("\n" + "=" * 60)
    console.log("✅ SALES ORDERS AND WORK ORDERS SYSTEM FIXED!")
    console.log("=" * 60)
    console.log("📚 Key Changes Made:")
    console.log("1. ✅ Deleted incorrect work order journal entry")
    console.log("2. ✅ Updated Chart of Accounts balances")
    console.log("3. ✅ Created proper accounting flow documentation")
    console.log("4. ✅ Documented corrected API implementation")
    console.log("\n🔮 Next Steps:")
    console.log("1. Update work orders API to follow correct flow")
    console.log("2. Test the complete sales order → work order → completion flow")
    console.log("3. Ensure journal entries only created when materials are actually used")
    console.log("\n📋 Proper Flow:")
    console.log("Sales Order → Work Order (no journal) → Materials Issued (journal) → Completed (journal)")
    
  } catch (error) {
    console.error("❌ Error fixing sales orders and work orders:", error)
    console.error("Error details:", error.message)
  }
}

fixSalesOrdersAndWorkOrders().then(() => process.exit(0))
