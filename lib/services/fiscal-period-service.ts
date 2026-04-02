/**
 * Fiscal Period Management Service
 * Handles fiscal years, monthly periods, and period locking
 */

import { db, COLLECTIONS } from "../firebase"

/**
 * Fiscal Period Status
 */
export enum PeriodStatus {
    OPEN = "open",
    CLOSED = "closed",
    LOCKED = "locked",
}

/**
 * Fiscal Period Interface
 */
export interface FiscalPeriod {
    id: string
    year: number
    month: number
    startDate: Date
    endDate: Date
    status: PeriodStatus
    closedAt?: Date
    closedBy?: string
    createdAt: Date
}

/**
 * Fiscal Year Interface
 */
export interface FiscalYear {
    id: string
    year: number
    startDate: Date
    endDate: Date
    isCurrent: boolean
    isClosed: boolean
    periods: string[]  // Period IDs
    createdAt: Date
}

/**
 * Fiscal Period Service
 */
export class FiscalPeriodService {

    /**
     * Initialize fiscal year and monthly periods
     */
    static async initializeFiscalYear(year: number): Promise<{ success: boolean; error?: string }> {
        try {
            const yearId = `FY-${year}`
            const startDate = new Date(year, 0, 1)  // January 1
            const endDate = new Date(year, 11, 31)  // December 31

            // Check if year already exists
            const existing = await db.collection(COLLECTIONS.FISCAL_YEARS).doc(yearId).get()
            if (existing.exists) {
                return { success: false, error: `Fiscal year ${year} already exists` }
            }

            const periodIds: string[] = []

            // Create 12 monthly periods
            for (let month = 0; month < 12; month++) {
                const periodId = `${yearId}-${String(month + 1).padStart(2, "0")}`
                const periodStart = new Date(year, month, 1)
                const periodEnd = new Date(year, month + 1, 0)  // Last day of month

                const period: FiscalPeriod = {
                    id: periodId,
                    year,
                    month: month + 1,
                    startDate: periodStart,
                    endDate: periodEnd,
                    status: PeriodStatus.OPEN,
                    createdAt: new Date(),
                }

                await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).set(period)
                periodIds.push(periodId)
            }

            // Create fiscal year record
            const fiscalYear: FiscalYear = {
                id: yearId,
                year,
                startDate,
                endDate,
                isCurrent: true,
                isClosed: false,
                periods: periodIds,
                createdAt: new Date(),
            }

            await db.collection(COLLECTIONS.FISCAL_YEARS).doc(yearId).set(fiscalYear)

            // Mark previous year as not current
            const prevYearId = `FY-${year - 1}`
            const prevYear = await db.collection(COLLECTIONS.FISCAL_YEARS).doc(prevYearId).get()
            if (prevYear.exists) {
                await db.collection(COLLECTIONS.FISCAL_YEARS).doc(prevYearId).update({ isCurrent: false })
            }

            console.log(`✅ Initialized fiscal year ${year} with 12 periods`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to initialize fiscal year",
            }
        }
    }

    /**
     * Get current fiscal period
     */
    static async getCurrentPeriod(): Promise<FiscalPeriod | null> {
        try {
            const now = new Date()
            const year = now.getFullYear()
            const month = now.getMonth() + 1
            const periodId = `FY-${year}-${String(month).padStart(2, "0")}`

            const doc = await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).get()
            if (!doc.exists) {
                // Auto-initialize current year if not exists
                await this.initializeFiscalYear(year)
                const newDoc = await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).get()
                return newDoc.exists ? this.docToPeriod(newDoc) : null
            }

            return this.docToPeriod(doc)
        } catch (error) {
            console.error("Error getting current period:", error)
            return null
        }
    }

    /**
     * Get period for a specific date
     */
    static async getPeriodForDate(date: Date): Promise<FiscalPeriod | null> {
        try {
            const year = date.getFullYear()
            const month = date.getMonth() + 1
            const periodId = `FY-${year}-${String(month).padStart(2, "0")}`

            const doc = await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).get()
            return doc.exists ? this.docToPeriod(doc) : null
        } catch (error) {
            console.error("Error getting period for date:", error)
            return null
        }
    }

    /**
     * Check if a period is open for posting
     */
    static async isPeriodOpen(date: Date): Promise<boolean> {
        const period = await this.getPeriodForDate(date)
        return period?.status === PeriodStatus.OPEN
    }

    /**
     * Close a fiscal period
     */
    static async closePeriod(
        periodId: string,
        closedBy: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const doc = await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).get()
            if (!doc.exists) {
                return { success: false, error: "Period not found" }
            }

            const period = this.docToPeriod(doc)
            if (period.status !== PeriodStatus.OPEN) {
                return { success: false, error: "Period is already closed or locked" }
            }

            await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).update({
                status: PeriodStatus.CLOSED,
                closedAt: new Date(),
                closedBy,
            })

            console.log(`✅ Closed fiscal period ${periodId}`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to close period",
            }
        }
    }

    /**
     * Reopen a closed period (admin only)
     */
    static async reopenPeriod(
        periodId: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const doc = await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).get()
            if (!doc.exists) {
                return { success: false, error: "Period not found" }
            }

            const period = this.docToPeriod(doc)
            if (period.status === PeriodStatus.LOCKED) {
                return { success: false, error: "Locked periods cannot be reopened" }
            }

            await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).update({
                status: PeriodStatus.OPEN,
                closedAt: null,
                closedBy: null,
            })

            console.log(`✅ Reopened fiscal period ${periodId}`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to reopen period",
            }
        }
    }

    /**
     * Lock a period (permanent, cannot be undone)
     */
    static async lockPeriod(
        periodId: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const doc = await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).get()
            if (!doc.exists) {
                return { success: false, error: "Period not found" }
            }

            const period = this.docToPeriod(doc)
            if (period.status !== PeriodStatus.CLOSED) {
                return { success: false, error: "Period must be closed before locking" }
            }

            await db.collection(COLLECTIONS.FISCAL_PERIODS).doc(periodId).update({
                status: PeriodStatus.LOCKED,
            })

            console.log(`🔒 Locked fiscal period ${periodId}`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to lock period",
            }
        }
    }

    /**
     * Get all periods for a fiscal year
     */
    static async getPeriodsForYear(year: number): Promise<FiscalPeriod[]> {
        try {
            const snapshot = await db.collection(COLLECTIONS.FISCAL_PERIODS)
                .where("year", "==", year)
                .orderBy("month", "asc")
                .get()

            return snapshot.docs.map(doc => this.docToPeriod(doc))
        } catch (error) {
            console.error("Error getting periods:", error)
            return []
        }
    }

    /**
     * Validate that a date can be used for posting
     */
    static async validatePostingDate(date: Date): Promise<{ valid: boolean; error?: string }> {
        const period = await this.getPeriodForDate(date)

        if (!period) {
            return { valid: false, error: "No fiscal period found for this date" }
        }

        if (period.status === PeriodStatus.CLOSED) {
            return { valid: false, error: "Fiscal period is closed" }
        }

        if (period.status === PeriodStatus.LOCKED) {
            return { valid: false, error: "Fiscal period is locked" }
        }

        return { valid: true }
    }

    /**
     * Convert Firestore doc to FiscalPeriod
     */
    private static docToPeriod(doc: FirebaseFirestore.DocumentSnapshot): FiscalPeriod {
        const data = doc.data()!
        return {
            id: doc.id,
            year: data.year,
            month: data.month,
            startDate: data.startDate?.toDate?.() || new Date(data.startDate),
            endDate: data.endDate?.toDate?.() || new Date(data.endDate),
            status: data.status as PeriodStatus,
            closedAt: data.closedAt?.toDate?.(),
            closedBy: data.closedBy,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        }
    }
}
