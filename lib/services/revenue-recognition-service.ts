import { db, COLLECTIONS } from "../firebase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"

/**
 * Contract for IFRS 15 over-time revenue recognition.
 * Applies to MTO/ETO contracts where the asset has no alternative use
 * AND the entity has an enforceable right to payment for performance to date.
 */
export interface Contract {
  id: string
  salesOrderId: string
  customerId: string
  customerName: string
  description: string
  contractPrice: number
  totalEstimatedCost: number
  startDate: Date
  estimatedCompletionDate: Date
  actualCompletionDate?: Date

  // Revenue recognition method
  method: "cost_to_cost" | "point_in_time"
  overTimeCriterion: "no_alternative_use" | "customer_controls" | "simultaneous_receipt"

  // Progress tracking
  costsIncurredToDate: number
  revenueRecognizedToDate: number
  amountsBilledToDate: number
  percentageComplete: number  // 0-100

  // Contract balances
  contractAsset: number       // Revenue recognized > billed
  contractLiability: number   // Amount billed > revenue recognized (advances)

  // Onerous contract
  isOnerous: boolean
  expectedLoss: number
  lossProvisionRecognized: boolean
  lossProvisionEntryId?: string

  status: "active" | "completed" | "terminated" | "onerous"
  createdAt: Date
  updatedAt: Date
}

export interface RevenueRecognitionEntry {
  periodStart: Date
  periodEnd: Date
  contractId: string
  percentageComplete: number
  revenueThisPeriod: number
  costsThisPeriod: number
  grossProfitThisPeriod: number
  journalEntryId?: string
}

/**
 * IFRS 15 Revenue Recognition Service
 *
 * 5-Step Model applied to MTO/ETO contracts:
 * Step 1: Identify the contract (Contract entity)
 * Step 2: Identify performance obligations (assumed single PO for manufacturing)
 * Step 3: Determine transaction price (contractPrice)
 * Step 4: Allocate transaction price (single PO → all to the contract)
 * Step 5: Recognize revenue over time using cost-to-cost input method
 *
 * Over-time criterion met when (IFRS 15.35):
 * - The asset has no alternative use to the entity, AND
 * - The entity has an enforceable right to payment for performance to date
 *   (common in MTO/ETO with milestone billing or cost-plus contracts)
 */
export class RevenueRecognitionService {
  private static readonly COLLECTION = "acc_contracts"
  private static readonly RECOGNITION_COLLECTION = "acc_revenue_recognition"

  /**
   * Create a new contract for over-time revenue recognition
   */
  static async createContract(
    salesOrderId: string,
    customerId: string,
    customerName: string,
    description: string,
    contractPrice: number,
    totalEstimatedCost: number,
    estimatedCompletionDate: Date,
    method: Contract["method"] = "cost_to_cost",
    overTimeCriterion: Contract["overTimeCriterion"] = "no_alternative_use",
    userId: string = "system"
  ): Promise<{ success: boolean; contractId?: string; error?: string }> {
    try {
      if (contractPrice <= 0 || totalEstimatedCost <= 0) {
        return { success: false, error: "Contract price and estimated cost must be positive" }
      }

      const contractId = `CTR-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
      const now = new Date()

      const contract: Contract = {
        id: contractId,
        salesOrderId,
        customerId,
        customerName,
        description,
        contractPrice,
        totalEstimatedCost,
        startDate: now,
        estimatedCompletionDate,
        method,
        overTimeCriterion,
        costsIncurredToDate: 0,
        revenueRecognizedToDate: 0,
        amountsBilledToDate: 0,
        percentageComplete: 0,
        contractAsset: 0,
        contractLiability: 0,
        isOnerous: false,
        expectedLoss: 0,
        lossProvisionRecognized: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }

      await db.collection(this.COLLECTION).doc(contractId).set(contract)
      console.log(`✅ Contract ${contractId} created (${method}, ${formatCurrency(contractPrice)})`)
      return { success: true, contractId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create contract" }
    }
  }

  /**
   * Get contract by ID
   */
  static async getContract(contractId: string): Promise<Contract | null> {
    try {
      const doc = await db.collection(this.COLLECTION).doc(contractId).get()
      return doc.exists ? (doc.data() as Contract) : null
    } catch {
      return null
    }
  }

  /**
   * Recognize revenue for a contract using cost-to-cost percentage of completion.
   *
   * Formula:
   *   % Complete = Costs Incurred to Date ÷ Total Estimated Costs
   *   Revenue This Period = (% Complete × Contract Price) − Revenue Recognized in Prior Periods
   *
   * Journal Entry:
   *   DR Contract Asset (Unbilled Receivable)   Revenue for period
   *   DR COGS                                     Costs for period
   *       CR Revenue from Contracts                    Revenue for period
   *       CR WIP Inventory                             Costs for period
   */
  static async recognizeRevenue(
    contractId: string,
    costsIncurredThisPeriod: number,
    userId: string = "system"
  ): Promise<{
    success: boolean
    recognition?: RevenueRecognitionEntry
    contract?: Contract
    error?: string
  }> {
    try {
      const contract = await this.getContract(contractId)
      if (!contract) {
        return { success: false, error: "Contract not found" }
      }
      if (contract.status === "completed" || contract.status === "terminated") {
        return { success: false, error: `Contract is ${contract.status}` }
      }
      if (contract.totalEstimatedCost <= 0) {
        return { success: false, error: "Total estimated cost must be positive" }
      }

      // Update costs incurred
      contract.costsIncurredToDate += costsIncurredThisPeriod

      // Calculate % complete — capped at 100%
      const pctComplete = Math.min(
        (contract.costsIncurredToDate / contract.totalEstimatedCost) * 100,
        100
      )

      // Revenue to date per POC
      const revenueToDate = (pctComplete / 100) * contract.contractPrice

      // Revenue this period
      const revenueThisPeriod = revenueToDate - contract.revenueRecognizedToDate

      if (revenueThisPeriod <= 0 && pctComplete < 100) {
        return {
          success: true,
          recognition: {
            periodStart: new Date(),
            periodEnd: new Date(),
            contractId,
            percentageComplete: pctComplete,
            revenueThisPeriod: 0,
            costsThisPeriod: costsIncurredThisPeriod,
            grossProfitThisPeriod: -costsIncurredThisPeriod,
          },
          contract,
        }
      }

      // Update contract balances
      contract.percentageComplete = pctComplete
      contract.revenueRecognizedToDate = revenueToDate

      // Contract asset = revenue recognized - amount billed
      contract.contractAsset = Math.max(0, revenueToDate - contract.amountsBilledToDate)
      contract.contractLiability = Math.max(0, contract.amountsBilledToDate - revenueToDate)

      // Check for onerous contract
      if (pctComplete >= 100 || contract.costsIncurredToDate > contract.totalEstimatedCost) {
        if (contract.totalEstimatedCost > contract.contractPrice && !contract.lossProvisionRecognized) {
          contract.isOnerous = true
          contract.expectedLoss = contract.totalEstimatedCost - contract.contractPrice
        }
        if (pctComplete >= 100) {
          contract.status = "completed"
          contract.actualCompletionDate = new Date()
        }
      }

      // Journal entry for revenue recognition
      const entryId = `REV-${contractId}-${Date.now()}`
      const now = new Date()

      const entries = [
        // Contract Asset — unbilled revenue (IFRS 15, account 1113)
        {
          account_id: ACCOUNT_CODES.CONTRACT_ASSET, // 1113
          account_name: "Contract Asset (Unbilled Revenue)",
          debit: revenueThisPeriod,
          credit: 0,
          description: `Revenue recognized: ${pctComplete.toFixed(1)}% complete`,
        },
        // Revenue
        {
          account_id: ACCOUNT_CODES.SALES_CUSTOM_MTO,
          account_name: getAccountName(ACCOUNT_CODES.SALES_CUSTOM_MTO),
          debit: 0,
          credit: revenueThisPeriod,
          description: `MTO contract revenue — ${contract.description}`,
        },
      ]

      const journalEntry = {
        id: entryId,
        date: now,
        type: "REVENUE_RECOGNITION",
        reference_doc: contractId,
        description: `IFRS 15 revenue recognition: ${contract.description} (${pctComplete.toFixed(1)}%)`,
        entries,
        account_ids: entries.map(e => e.account_id),
        total_debits: revenueThisPeriod,
        total_credits: revenueThisPeriod,
        created_at: now,
        created_by: userId,
      }

      // Save journal entry
      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

      // Save contract update
      contract.updatedAt = now
      await db.collection(this.COLLECTION).doc(contractId).set(contract, { merge: true })

      const recognition: RevenueRecognitionEntry = {
        periodStart: new Date(),
        periodEnd: new Date(),
        contractId,
        percentageComplete: pctComplete,
        revenueThisPeriod,
        costsThisPeriod: costsIncurredThisPeriod,
        grossProfitThisPeriod: revenueThisPeriod - costsIncurredThisPeriod,
        journalEntryId: entryId,
      }

      console.log(
        `✅ Revenue recognized: ${pctComplete.toFixed(1)}% → ${formatCurrency(revenueThisPeriod)} ` +
        `(total: ${formatCurrency(revenueToDate)} / ${formatCurrency(contract.contractPrice)})`
      )

      return { success: true, recognition, contract }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to recognize revenue"
      }
    }
  }

  /**
   * Record milestone billing — customer is invoiced but revenue recognized separately
   *
   * Journal Entry:
   *   DR Accounts Receivable     Amount billed
   *       CR Contract Asset (or Contract Liability)     Amount billed
   */
  static async recordMilestoneBilling(
    contractId: string,
    invoiceId: string,
    billingAmount: number,
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const contract = await this.getContract(contractId)
      if (!contract) {
        return { success: false, error: "Contract not found" }
      }

      const now = new Date()
      const entryId = `BILL-${contractId}-${Date.now()}`

      // Update amounts billed
      contract.amountsBilledToDate += billingAmount

      // Recalculate contract asset/liability
      const billed = contract.amountsBilledToDate
      const recognized = contract.revenueRecognizedToDate
      contract.contractAsset = Math.max(0, recognized - billed)
      contract.contractLiability = Math.max(0, billed - recognized)

      // Determine if this billing is to contract asset or creates a liability
      const isOverBilling = billed > recognized
      const liabilityAccount = ACCOUNT_CODES.CUSTOMER_DEPOSITS_LIABILITY // 2105

      const entries = [
        // Debit AR for billed amount
        {
          account_id: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
          account_name: getAccountName(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE),
          debit: billingAmount,
          credit: 0,
          description: `Milestone billing: Invoice ${invoiceId}`,
        },
        // Credit Contract Asset (1113) or Contract Liability (2105)
        {
          account_id: isOverBilling ? liabilityAccount : ACCOUNT_CODES.CONTRACT_ASSET, // 1113
          account_name: isOverBilling
            ? getAccountName(liabilityAccount)
            : "Contract Asset (Unbilled Revenue)",
          debit: 0,
          credit: billingAmount,
          description: isOverBilling
            ? `Advance billing (contract liability)`
            : `Reduce unbilled contract asset`,
        },
      ]

      const journalEntry = {
        id: entryId,
        date: now,
        type: "SALES_INVOICE",
        reference_doc: invoiceId,
        description: `Milestone billing for contract ${contractId}: ${formatCurrency(billingAmount)}`,
        entries,
        account_ids: entries.map(e => e.account_id),
        total_debits: billingAmount,
        total_credits: billingAmount,
        created_at: now,
        created_by: userId,
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

      // Update contract
      contract.updatedAt = now
      await db.collection(this.COLLECTION).doc(contractId).set(contract, { merge: true })

      console.log(`✅ Milestone billed: ${formatCurrency(billingAmount)} (Total billed: ${formatCurrency(contract.amountsBilledToDate)})`)
      return { success: true, entryId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to record milestone billing"
      }
    }
  }

  /**
   * Record advance payment from customer before performance
   *
   * Journal Entry:
   *   DR Cash/Bank              Amount
   *       CR Contract Liability (Customer Deposits)     Amount
   */
  static async recordAdvancePayment(
    contractId: string,
    amount: number,
    accountCode: string = ACCOUNT_CODES.BANK_MAIN,
    userId: string = "system"
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const entryId = `ADV-${contractId}-${Date.now()}`
      const now = new Date()

      const journalEntry = {
        id: entryId,
        date: now,
        type: "PAYMENT_RECEIVED",
        reference_doc: contractId,
        description: `Advance payment for contract ${contractId}: ${formatCurrency(amount)}`,
        entries: [
          {
            account_id: accountCode,
            account_name: getAccountName(accountCode),
            debit: amount,
            credit: 0,
            description: `Advance received from customer`,
          },
          {
            account_id: ACCOUNT_CODES.CUSTOMER_DEPOSITS_LIABILITY,
            account_name: getAccountName(ACCOUNT_CODES.CUSTOMER_DEPOSITS_LIABILITY),
            debit: 0,
            credit: amount,
            description: `Contract liability for advance`,
          },
        ],
        account_ids: [accountCode, ACCOUNT_CODES.CUSTOMER_DEPOSITS_LIABILITY],
        total_debits: amount,
        total_credits: amount,
        created_at: now,
        created_by: userId,
      }

      await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

      // Update contract amounts billed
      const contract = await this.getContract(contractId)
      if (contract) {
        contract.amountsBilledToDate += amount
        contract.contractLiability = Math.max(0, contract.amountsBilledToDate - contract.revenueRecognizedToDate)
        contract.updatedAt = now
        await db.collection(this.COLLECTION).doc(contractId).set(contract, { merge: true })
      }

      console.log(`✅ Advance payment ${formatCurrency(amount)} recorded for contract ${contractId}`)
      return { success: true, entryId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to record advance" }
    }
  }

  /**
   * Check and record onerous contract provision
   * When total estimated costs exceed contract price, recognize the expected loss immediately.
   *
   * Per IAS 37 / IFRS 15.BC258:
   *   DR Loss on Onerous Contract (expense)
   *       CR Provision for Onerous Contract (liability)
   */
  static async recognizeOnerousContract(
    contractId: string,
    revisedTotalEstimatedCost: number,
    userId: string = "system"
  ): Promise<{ success: boolean; expectedLoss?: number; entryId?: string; error?: string }> {
    try {
      const contract = await this.getContract(contractId)
      if (!contract) {
        return { success: false, error: "Contract not found" }
      }

      // Update estimated costs
      contract.totalEstimatedCost = revisedTotalEstimatedCost

      // Calculate expected loss
      if (revisedTotalEstimatedCost > contract.contractPrice) {
        const expectedLoss = revisedTotalEstimatedCost - contract.contractPrice

        if (contract.lossProvisionRecognized) {
          return {
            success: true,
            expectedLoss,
            error: `Onerous contract already provisioned. Current expected loss: ${formatCurrency(expectedLoss)}`
          }
        }

        const entryId = `ONEROUS-${contractId}-${Date.now()}`
        const now = new Date()

        const journalEntry = {
          id: entryId,
          date: now,
          type: "GENERAL",
          reference_doc: contractId,
          description: `Onerous contract provision: ${formatCurrency(expectedLoss)} loss on ${contract.description}`,
          entries: [
            {
              account_id: "7002", // Penalties & Fines — or dedicated loss account
              account_name: "Loss on Onerous Contract",
              debit: expectedLoss,
              credit: 0,
              description: `Expected loss on contract ${contractId}`,
            },
            {
              account_id: "2150", // Provision - Expenses
              account_name: "Provision for Onerous Contract",
              debit: 0,
              credit: expectedLoss,
              description: `Onerous contract provision per IAS 37`,
            },
          ],
          account_ids: ["7002", "2150"],
          total_debits: expectedLoss,
          total_credits: expectedLoss,
          created_at: now,
          created_by: userId,
        }

        await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(entryId).set(journalEntry)

        contract.isOnerous = true
        contract.expectedLoss = expectedLoss
        contract.lossProvisionRecognized = true
        contract.lossProvisionEntryId = entryId
        contract.status = "onerous"
        contract.updatedAt = now

        await db.collection(this.COLLECTION).doc(contractId).set(contract, { merge: true })

        console.log(`⚠️ Onerous contract ${contractId}: ${formatCurrency(expectedLoss)} loss provisioned`)
        return { success: true, expectedLoss, entryId }
      }

      // Not onerous — just update costs
      contract.updatedAt = new Date()
      await db.collection(this.COLLECTION).doc(contractId).set(contract, { merge: true })
      return { success: true, expectedLoss: 0 }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to recognize onerous contract"
      }
    }
  }

  /**
   * Apply a change order / contract modification per IFRS 15.18–21.
   *
   * Treatment logic:
   *  - "new_contract"      → Treat as separate contract (new price/cost do not affect existing %).
   *  - "cumulative_catchup"→ Update totals and re-calculate revenue to date; record catch-up in current period.
   *  - "prospective"       → Update totals; apply to remaining performance only (no catch-up).
   *
   * The most common MTO/ETO treatment is cumulative_catchup when the modification changes
   * the remaining performance obligation without adding distinct new goods.
   */
  static async applyChangeOrder(
    contractId: string,
    description: string,
    revisedContractPrice: number,
    revisedEstimatedCost: number,
    treatment: "new_contract" | "cumulative_catchup" | "prospective",
    approvedBy: string,
    userId: string = "system"
  ): Promise<{
    success: boolean
    changeOrderId?: string
    revenueAdjustment?: number
    entryId?: string
    error?: string
  }> {
    try {
      const contract = await this.getContract(contractId)
      if (!contract) return { success: false, error: "Contract not found" }
      if (contract.status === "completed" || contract.status === "terminated") {
        return { success: false, error: `Cannot modify a ${contract.status} contract` }
      }
      if (revisedContractPrice <= 0 || revisedEstimatedCost <= 0) {
        return { success: false, error: "Revised price and cost must be positive" }
      }

      const originalContractPrice  = contract.contractPrice
      const originalEstimatedCost  = contract.totalEstimatedCost
      let revenueAdjustment        = 0
      let entryId: string | undefined

      const now = new Date()

      if (treatment === "cumulative_catchup") {
        // Recalculate % complete with revised estimates
        const newPctComplete = Math.min(
          (contract.costsIncurredToDate / revisedEstimatedCost) * 100,
          100
        )
        const newRevenueToDate = (newPctComplete / 100) * revisedContractPrice
        revenueAdjustment = newRevenueToDate - contract.revenueRecognizedToDate

        if (Math.abs(revenueAdjustment) > 0.01) {
          const isUpward = revenueAdjustment > 0
          const amount   = Math.abs(revenueAdjustment)

          const lines = isUpward
            ? [
                {
                  accountCode: ACCOUNT_CODES.CONTRACT_ASSET, // 1113
                  accountName: "Contract Asset (Unbilled Revenue)",
                  debit: amount,
                  credit: 0,
                  description: `Change order cumulative catch-up — ${description}`,
                },
                {
                  accountCode: ACCOUNT_CODES.SALES_CUSTOM_MTO, // 4003
                  accountName: getAccountName(ACCOUNT_CODES.SALES_CUSTOM_MTO),
                  debit: 0,
                  credit: amount,
                  description: `Revenue uplift from contract modification`,
                },
              ]
            : [
                {
                  accountCode: ACCOUNT_CODES.SALES_CUSTOM_MTO, // 4003
                  accountName: getAccountName(ACCOUNT_CODES.SALES_CUSTOM_MTO),
                  debit: amount,
                  credit: 0,
                  description: `Revenue reduction from contract modification`,
                },
                {
                  accountCode: ACCOUNT_CODES.CONTRACT_ASSET, // 1113
                  accountName: "Contract Asset (Unbilled Revenue)",
                  debit: 0,
                  credit: amount,
                  description: `Contract asset reduction — ${description}`,
                },
              ]

          // Use a simple journal entry structure matching the existing pattern
          const jeId = `CO-${contractId}-${Date.now()}`
          const journalEntry = {
            id: jeId,
            date: now,
            type: "GENERAL",
            reference_doc: contractId,
        description: `IFRS 15.18 change order catch-up: ${description}`,
            entries: lines.map(l => ({
              account_id: l.accountCode,
              account_name: l.accountName,
              debit: l.debit,
              credit: l.credit,
              description: l.description,
            })),
            account_ids: lines.map(l => l.accountCode),
            total_debits: amount,
            total_credits: amount,
            created_at: now,
            created_by: userId,
          }
          await db.collection(COLLECTIONS.JOURNAL_ENTRIES).doc(jeId).set(journalEntry)
          entryId = jeId
        }

        // Update contract with revised values
        contract.contractPrice           = revisedContractPrice
        contract.totalEstimatedCost      = revisedEstimatedCost
        contract.percentageComplete      = newPctComplete
        contract.revenueRecognizedToDate = newPctComplete / 100 * revisedContractPrice
        contract.contractAsset           = Math.max(0, contract.revenueRecognizedToDate - contract.amountsBilledToDate)
        contract.contractLiability       = Math.max(0, contract.amountsBilledToDate - contract.revenueRecognizedToDate)

      } else if (treatment === "prospective") {
        // No catch-up; just update totals — remaining performance re-priced
        contract.contractPrice      = revisedContractPrice
        contract.totalEstimatedCost = revisedEstimatedCost

      } else {
        // new_contract — do not modify existing contract; caller should create a new one
        // We still record the change order document for audit trail
      }

      // Check if revised estimates create an onerous position
      if (revisedEstimatedCost > revisedContractPrice && !contract.lossProvisionRecognized) {
        contract.isOnerous    = true
        contract.expectedLoss = revisedEstimatedCost - revisedContractPrice
        contract.status       = "onerous"
      }

      contract.updatedAt = now
      await db.collection(this.COLLECTION).doc(contractId).set(contract, { merge: true })

      // Persist change order record
      const changeOrderId = `CHG-${contractId}-${Date.now()}`
      await db.collection(COLLECTIONS.CHANGE_ORDERS).doc(changeOrderId).set({
        id: changeOrderId,
        contractId,
        description,
        originalContractPrice,
        revisedContractPrice,
        originalEstimatedCost,
        revisedEstimatedCost,
        treatment,
        revenueAdjustment,
        journalEntryId: entryId,
        approvedBy,
        created_at: now,
      })

      console.log(
        `✅ Change order ${changeOrderId}: ${treatment} treatment, ` +
        `${formatCurrency(originalContractPrice)} → ${formatCurrency(revisedContractPrice)}, ` +
        `revenue adjustment: ${formatCurrency(revenueAdjustment)}`
      )
      return { success: true, changeOrderId, revenueAdjustment, entryId }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to apply change order",
      }
    }
  }

  /**
   * Get all active contracts with summary
   */
  static async getActiveContracts(): Promise<Contract[]> {
    try {
      const snapshot = await db.collection(this.COLLECTION)
        .where("status", "in", ["active", "onerous"])
        .get()
      return snapshot.docs.map(d => d.data() as Contract)
    } catch {
      return []
    }
  }

  /**
   * Get contracts that may become onerous (costs > 90% of price but not yet flagged)
   */
  static async getAtRiskContracts(): Promise<Contract[]> {
    try {
      const snapshot = await db.collection(this.COLLECTION)
        .where("status", "==", "active")
        .get()
      return snapshot.docs
        .map(d => d.data() as Contract)
        .filter(c => c.costsIncurredToDate > 0 && c.totalEstimatedCost > c.contractPrice * 0.9)
    } catch {
      return []
    }
  }
}
