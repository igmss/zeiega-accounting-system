// Script to add the loan of EGP 40,000
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

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

async function addLoanNow() {
  try {
    console.log("💰 Adding loan of EGP 40,000...")
    
    const now = new Date()
    const loanAmount = 40000
    
    // 1. Create journal entry for the loan
    const journalEntry = {
      date: now,
      entries: [
        {
          account_id: "CASH",
          debit: loanAmount,
          credit: 0,
          description: `Business loan received - EGP ${loanAmount.toLocaleString()}`
        },
        {
          account_id: "SHORT_TERM_DEBT",
          debit: 0,
          credit: loanAmount,
          description: `Loan payable - EGP ${loanAmount.toLocaleString()}`
        }
      ],
      linked_doc: `LOAN_${Date.now()}`,
      created_at: now
    }
    
    await db.collection('acc_journal_entries').add(journalEntry)
    console.log(`✅ Created journal entry for loan: EGP ${loanAmount.toLocaleString()}`)
    
    // 2. Update CASH balance in Chart of Accounts
    const cashRef = db.collection('acc_chart_of_accounts').doc('CASH')
    const cashDoc = await cashRef.get()
    const currentCashBalance = cashDoc.data()?.balance || 0
    const newCashBalance = currentCashBalance + loanAmount
    
    await cashRef.update({
      balance: newCashBalance,
      last_updated: now
    })
    
    console.log(`✅ Updated CASH balance:`)
    console.log(`  Previous: EGP ${currentCashBalance.toLocaleString()}`)
    console.log(`  New: EGP ${newCashBalance.toLocaleString()}`)
    
    // 3. Update SHORT_TERM_DEBT balance in Chart of Accounts
    const debtRef = db.collection('acc_chart_of_accounts').doc('SHORT_TERM_DEBT')
    const debtDoc = await debtRef.get()
    const currentDebtBalance = debtDoc.data()?.balance || 0
    const newDebtBalance = currentDebtBalance + loanAmount
    
    await debtRef.update({
      balance: newDebtBalance,
      last_updated: now
    })
    
    console.log(`✅ Updated SHORT_TERM_DEBT balance:`)
    console.log(`  Previous: EGP ${currentDebtBalance.toLocaleString()}`)
    console.log(`  New: EGP ${newDebtBalance.toLocaleString()}`)
    
    // 4. Show accounting impact
    console.log(`\n📊 Accounting Impact:`)
    console.log(`  Assets (CASH): +EGP ${loanAmount.toLocaleString()}`)
    console.log(`  Liabilities (SHORT_TERM_DEBT): +EGP ${loanAmount.toLocaleString()}`)
    console.log(`  Balance Sheet: Still balanced ✅`)
    
    // 5. Show updated Balance Sheet preview
    console.log(`\n📋 Updated Balance Sheet Preview:`)
    console.log(`  Current Assets:`)
    console.log(`    Cash: EGP ${newCashBalance.toLocaleString()}`)
    console.log(`  Current Liabilities:`)
    console.log(`    Short-term Debt: EGP ${newDebtBalance.toLocaleString()}`)
    
    console.log(`\n🎯 Loan successfully recorded!`)
    console.log(`  You now have EGP ${loanAmount.toLocaleString()} more cash`)
    console.log(`  You owe EGP ${loanAmount.toLocaleString()} in short-term debt`)
    console.log(`\n🔄 Please refresh your browser to see the updated Balance Sheet!`)
    
  } catch (error) {
    console.error("Error adding loan:", error)
  }
}

addLoanNow().then(() => process.exit(0))
