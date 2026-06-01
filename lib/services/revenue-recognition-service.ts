import { supabase, TABLES, getServiceSupabase } from "../supabase"
import { ACCOUNT_CODES, getAccountName } from "../accounting/account-types"
import { formatCurrency } from "@/lib/utils"
import { JournalEntryService, JournalEntryType } from "./journal-entry-service"

export interface Contract {
  id: string
  salesOrderId: string
  customerId: string
  customerName: string
  description: string
  contractPrice: number
  totalEstimatedCost: number
  startDate: string
  estimatedCompletionDate: string
  actualCompletionDate?: string
  method: "cost_to_cost" | "point_in_time"
  overTimeCriterion: "no_alternative_use" | "customer_controls" | "simultaneous_receipt"
  costsIncurredToDate: number
  revenueRecognizedToDate: number
  amountsBilledToDate: number
  percentageComplete: number
  contractAsset: number
  contractLiability: number
  isOnerous: boolean
  expectedLoss: number
  lossProvisionRecognized: boolean
  lossProvisionEntryId?: string
  status: "active" | "completed" | "terminated" | "onerous"
  createdAt: string
  updatedAt: string
}

export interface RevenueRecognitionEntry {
  periodStart: string
  periodEnd: string
  contractId: string
  percentageComplete: number
  revenueThisPeriod: number
  costsThisPeriod: number
  grossProfitThisPeriod: number
  journalEntryId?: string
}

export class RevenueRecognitionService {
  private static readonly TABLE = TABLES.CONTRACTS
  private static readonly RECOGNITION_TABLE = TABLES.REVENUE_RECOGNITION

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
    userId: string | null = null
  ): Promise<{ success: boolean; contractId?: string; error?: string }> {
    try {
      if (contractPrice <= 0 || totalEstimatedCost <= 0) {
        return { success: false, error: "Contract price and estimated cost must be positive" }
      }

      const contractId = `CTR-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
      const now = new Date().toISOString()

      const contract: Contract = {
        id: contractId,
        salesOrderId,
        customerId,
        customerName,
        description,
        contractPrice,
        totalEstimatedCost,
        startDate: now,
        estimatedCompletionDate: estimatedCompletionDate.toISOString(),
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

      const { error } = await getServiceSupabase().from(this.TABLE).insert(contract)
      if (error) throw error
      console.log(`✅ Contract ${contractId} created (${method}, ${formatCurrency(contractPrice)})`)
      return { success: true, contractId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to create contract" }
    }
  }

  static async getContract(contractId: string): Promise<Contract | null> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE).select("*").eq("id", contractId).single()
      return (!error && data) ? (data as Contract) : null
    } catch {
      return null
    }
  }

  static async recognizeRevenue(
    contractId: string,
    costsIncurredThisPeriod: number,
    userId: string | null = null
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

      contract.costsIncurredToDate += costsIncurredThisPeriod

      const pctComplete = Math.min(
        (contract.costsIncurredToDate / contract.totalEstimatedCost) * 100,
        100
      )

      const revenueToDate = (pctComplete / 100) * contract.contractPrice
      const revenueThisPeriod = revenueToDate - contract.revenueRecognizedToDate

      if (revenueThisPeriod <= 0 && pctComplete < 100) {
        return {
          success: true,
          recognition: {
            periodStart: new Date().toISOString(),
            periodEnd: new Date().toISOString(),
            contractId,
            percentageComplete: pctComplete,
            revenueThisPeriod: 0,
            costsThisPeriod: costsIncurredThisPeriod,
            grossProfitThisPeriod: -costsIncurredThisPeriod,
          },
          contract,
        }
      }

      contract.percentageComplete = pctComplete
      contract.revenueRecognizedToDate = revenueToDate
      contract.contractAsset = Math.max(0, revenueToDate - contract.amountsBilledToDate)
      contract.contractLiability = Math.max(0, contract.amountsBilledToDate - revenueToDate)

      if (pctComplete >= 100 || contract.costsIncurredToDate > contract.totalEstimatedCost) {
        if (contract.totalEstimatedCost > contract.contractPrice && !contract.lossProvisionRecognized) {
          contract.isOnerous = true
          contract.expectedLoss = contract.totalEstimatedCost - contract.contractPrice
        }
        if (pctComplete >= 100) {
          contract.status = "completed"
          contract.actualCompletionDate = new Date().toISOString()
        }
      }

      const entryId = `REV-${contractId}-${Date.now()}`
      const now = new Date().toISOString()

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.GENERAL,
        [
          {
            accountCode: ACCOUNT_CODES.CONTRACT_ASSET,
            accountName: "Contract Asset (Unbilled Revenue)",
            debit: revenueThisPeriod,
            credit: 0,
            description: `Revenue recognized: ${pctComplete.toFixed(1)}% complete`,
          },
          {
            accountCode: ACCOUNT_CODES.SALES_CUSTOM_MTO,
            accountName: getAccountName(ACCOUNT_CODES.SALES_CUSTOM_MTO),
            debit: 0,
            credit: revenueThisPeriod,
            description: `MTO contract revenue — ${contract.description}`,
          },
        ],
        contractId,
        `IFRS 15 revenue recognition: ${contract.description} (${pctComplete.toFixed(1)}%)`,
        userId
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      contract.updatedAt = now
      const { error: updErr } = await getServiceSupabase().from(this.TABLE).upsert(contract, { onConflict: "id" })
      if (updErr) throw updErr

      const recognition: RevenueRecognitionEntry = {
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        contractId,
        percentageComplete: pctComplete,
        revenueThisPeriod,
        costsThisPeriod: costsIncurredThisPeriod,
        grossProfitThisPeriod: revenueThisPeriod - costsIncurredThisPeriod,
        journalEntryId: result.entryId,
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

  static async recordMilestoneBilling(
    contractId: string,
    invoiceId: string,
    billingAmount: number,
    userId: string | null = null
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const contract = await this.getContract(contractId)
      if (!contract) {
        return { success: false, error: "Contract not found" }
      }

      const now = new Date().toISOString()
      contract.amountsBilledToDate += billingAmount

      const billed = contract.amountsBilledToDate
      const recognized = contract.revenueRecognizedToDate
      contract.contractAsset = Math.max(0, recognized - billed)
      contract.contractLiability = Math.max(0, billed - recognized)

      const isOverBilling = billed > recognized
      const liabilityAccount = ACCOUNT_CODES.CUSTOMER_DEPOSITS_LIABILITY

      const entries = [
        {
          account_id: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
          account_name: getAccountName(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE),
          debit: billingAmount,
          credit: 0,
          description: `Milestone billing: Invoice ${invoiceId}`,
        },
        {
          account_id: isOverBilling ? liabilityAccount : ACCOUNT_CODES.CONTRACT_ASSET,
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

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.SALES_INVOICE,
        entries.map(e => ({
          accountCode: e.account_id,
          accountName: e.account_name,
          debit: e.debit,
          credit: e.credit,
          description: e.description,
        })),
        invoiceId,
        `Milestone billing for contract ${contractId}: ${formatCurrency(billingAmount)}`,
        userId
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      contract.updatedAt = now
      await getServiceSupabase().from(this.TABLE).upsert(contract, { onConflict: "id" })

      console.log(`✅ Milestone billed: ${formatCurrency(billingAmount)} (Total billed: ${formatCurrency(contract.amountsBilledToDate)})`)
      return { success: true, entryId: result.entryId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to record milestone billing"
      }
    }
  }

  static async recordAdvancePayment(
    contractId: string,
    amount: number,
    accountCode: string = ACCOUNT_CODES.BANK_MAIN,
    userId: string | null = null
  ): Promise<{ success: boolean; entryId?: string; error?: string }> {
    try {
      const now = new Date().toISOString()

      const result = await JournalEntryService.createJournalEntry(
        JournalEntryType.PAYMENT_RECEIVED,
        [
          {
            accountCode: accountCode,
            accountName: getAccountName(accountCode),
            debit: amount,
            credit: 0,
            description: `Advance received from customer`,
          },
          {
            accountCode: ACCOUNT_CODES.CUSTOMER_DEPOSITS_LIABILITY,
            accountName: getAccountName(ACCOUNT_CODES.CUSTOMER_DEPOSITS_LIABILITY),
            debit: 0,
            credit: amount,
            description: `Contract liability for advance`,
          },
        ],
        contractId,
        `Advance payment for contract ${contractId}: ${formatCurrency(amount)}`,
        userId
      )

      if (!result.success) {
        return { success: false, error: result.error }
      }

      const contract = await this.getContract(contractId)
      if (contract) {
        contract.amountsBilledToDate += amount
        contract.contractLiability = Math.max(0, contract.amountsBilledToDate - contract.revenueRecognizedToDate)
        contract.updatedAt = now
        await getServiceSupabase().from(this.TABLE).upsert(contract, { onConflict: "id" })
      }

      console.log(`✅ Advance payment ${formatCurrency(amount)} recorded for contract ${contractId}`)
      return { success: true, entryId: result.entryId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to record advance" }
    }
  }

  static async recognizeOnerousContract(
    contractId: string,
    revisedTotalEstimatedCost: number,
    userId: string | null = null
  ): Promise<{ success: boolean; expectedLoss?: number; entryId?: string; error?: string }> {
    try {
      const contract = await this.getContract(contractId)
      if (!contract) {
        return { success: false, error: "Contract not found" }
      }

      contract.totalEstimatedCost = revisedTotalEstimatedCost

      if (revisedTotalEstimatedCost > contract.contractPrice) {
        const expectedLoss = revisedTotalEstimatedCost - contract.contractPrice

        if (contract.lossProvisionRecognized) {
          return {
            success: true,
            expectedLoss,
            error: `Onerous contract already provisioned. Current expected loss: ${formatCurrency(expectedLoss)}`
          }
        }

        const now = new Date().toISOString()

        const result = await JournalEntryService.createJournalEntry(
          JournalEntryType.GENERAL,
          [
            {
              accountCode: ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE,
              accountName: getAccountName(ACCOUNT_CODES.REWORK_SPOILAGE_EXPENSE),
              debit: expectedLoss,
              credit: 0,
              description: `Expected loss on contract ${contractId}`,
            },
            {
              accountCode: ACCOUNT_CODES.PROVISION_ONEROUS_CONTRACTS,
              accountName: getAccountName(ACCOUNT_CODES.PROVISION_ONEROUS_CONTRACTS),
              debit: 0,
              credit: expectedLoss,
              description: `Onerous contract provision per IAS 37`,
            },
          ],
          contractId,
          `Onerous contract provision: ${formatCurrency(expectedLoss)} loss on ${contract.description}`,
          userId
        )

        if (!result.success) {
          return { success: false, error: result.error }
        }

        contract.isOnerous = true
        contract.expectedLoss = expectedLoss
        contract.lossProvisionRecognized = true
        contract.lossProvisionEntryId = result.entryId
        contract.status = "onerous"
        contract.updatedAt = now

        await getServiceSupabase().from(this.TABLE).upsert(contract, { onConflict: "id" })

        console.log(`⚠️ Onerous contract ${contractId}: ${formatCurrency(expectedLoss)} loss provisioned`)
        return { success: true, expectedLoss, entryId: result.entryId }
      }

      contract.updatedAt = new Date().toISOString()
      await getServiceSupabase().from(this.TABLE).upsert(contract, { onConflict: "id" })
      return { success: true, expectedLoss: 0 }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to recognize onerous contract"
      }
    }
  }

  static async applyChangeOrder(
    contractId: string,
    description: string,
    revisedContractPrice: number,
    revisedEstimatedCost: number,
    treatment: "new_contract" | "cumulative_catchup" | "prospective",
    approvedBy: string,
    userId: string | null = null
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

      const now = new Date().toISOString()

      if (treatment === "cumulative_catchup") {
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
                  accountCode: ACCOUNT_CODES.CONTRACT_ASSET,
                  accountName: "Contract Asset (Unbilled Revenue)",
                  debit: amount,
                  credit: 0,
                  description: `Change order cumulative catch-up — ${description}`,
                },
                {
                  accountCode: ACCOUNT_CODES.SALES_CUSTOM_MTO,
                  accountName: getAccountName(ACCOUNT_CODES.SALES_CUSTOM_MTO),
                  debit: 0,
                  credit: amount,
                  description: `Revenue uplift from contract modification`,
                },
              ]
            : [
                {
                  accountCode: ACCOUNT_CODES.SALES_CUSTOM_MTO,
                  accountName: getAccountName(ACCOUNT_CODES.SALES_CUSTOM_MTO),
                  debit: amount,
                  credit: 0,
                  description: `Revenue reduction from contract modification`,
                },
                {
                  accountCode: ACCOUNT_CODES.CONTRACT_ASSET,
                  accountName: "Contract Asset (Unbilled Revenue)",
                  debit: 0,
                  credit: amount,
                  description: `Contract asset reduction — ${description}`,
                },
              ]

          const result = await JournalEntryService.createJournalEntry(
            JournalEntryType.GENERAL,
            lines,
            contractId,
            `IFRS 15.18 change order catch-up: ${description}`,
            userId
          )

          if (result.success && result.entryId) {
            entryId = result.entryId
          }
        }

        contract.contractPrice           = revisedContractPrice
        contract.totalEstimatedCost      = revisedEstimatedCost
        contract.percentageComplete      = newPctComplete
        contract.revenueRecognizedToDate = newPctComplete / 100 * revisedContractPrice
        contract.contractAsset           = Math.max(0, contract.revenueRecognizedToDate - contract.amountsBilledToDate)
        contract.contractLiability       = Math.max(0, contract.amountsBilledToDate - contract.revenueRecognizedToDate)

      } else if (treatment === "prospective") {
        contract.contractPrice      = revisedContractPrice
        contract.totalEstimatedCost = revisedEstimatedCost
      }

      if (revisedEstimatedCost > revisedContractPrice && !contract.lossProvisionRecognized) {
        contract.isOnerous    = true
        contract.expectedLoss = revisedEstimatedCost - revisedContractPrice
        contract.status       = "onerous"
      }

      contract.updatedAt = now
      await getServiceSupabase().from(this.TABLE).upsert(contract, { onConflict: "id" })

      const changeOrderId = `CHG-${contractId}-${Date.now()}`
      await getServiceSupabase().from(TABLES.CHANGE_ORDERS).insert({
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

  static async getActiveContracts(): Promise<Contract[]> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE)
        .select("*")
        .in("status", ["active", "onerous"])
      if (error) throw error
      return (data || []) as Contract[]
    } catch {
      return []
    }
  }

  static async getAtRiskContracts(): Promise<Contract[]> {
    try {
      const { data, error } = await getServiceSupabase().from(this.TABLE)
        .select("*")
        .eq("status", "active")
      if (error) throw error
      return ((data || []) as Contract[])
        .filter(c => c.costsIncurredToDate > 0 && c.totalEstimatedCost > c.contractPrice * 0.9)
    } catch {
      return []
    }
  }
}
