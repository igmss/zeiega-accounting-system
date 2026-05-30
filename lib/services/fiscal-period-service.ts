import { supabase, TABLES, getServiceSupabase } from "../supabase"

export enum PeriodStatus {
    OPEN = "open",
    CLOSED = "closed",
    LOCKED = "locked",
}

export interface FiscalPeriod {
    id: string
    year: number
    month: number
    startDate: string
    endDate: string
    status: PeriodStatus
    closedAt?: string
    closedBy?: string
    createdAt: string
}

export interface FiscalYear {
    id: string
    year: number
    startDate: string
    endDate: string
    isCurrent: boolean
    isClosed: boolean
    periods: string[]
    createdAt: string
}

export class FiscalPeriodService {

    static async initializeFiscalYear(year: number): Promise<{ success: boolean; error?: string }> {
        try {
            const yearId = `FY-${year}`
            const startDate = new Date(year, 0, 1).toISOString()
            const endDate = new Date(year, 11, 31).toISOString()

            const { data: existing } = await getServiceSupabase().from(TABLES.FISCAL_YEARS).select("id").eq("id", yearId).single()
            if (existing) {
                return { success: false, error: `Fiscal year ${year} already exists` }
            }

            const periodIds: string[] = []
            const now = new Date().toISOString()

            for (let month = 0; month < 12; month++) {
                const periodId = `${yearId}-${String(month + 1).padStart(2, "0")}`
                const periodStart = new Date(year, month, 1).toISOString()
                const periodEnd = new Date(year, month + 1, 0).toISOString()

                const period: FiscalPeriod = {
                    id: periodId,
                    year,
                    month: month + 1,
                    startDate: periodStart,
                    endDate: periodEnd,
                    status: PeriodStatus.OPEN,
                    createdAt: now,
                }

                const { error } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).insert({
                    id: periodId,
                    year,
                    month: month + 1,
                    start_date: periodStart,
                    end_date: periodEnd,
                    status: PeriodStatus.OPEN,
                    created_at: now,
                })
                if (error) throw error
                periodIds.push(periodId)
            }

            const fiscalYear: FiscalYear = {
                id: yearId,
                year,
                startDate,
                endDate,
                isCurrent: true,
                isClosed: false,
                periods: periodIds,
                createdAt: now,
            }

            const { error: fyErr } = await getServiceSupabase().from(TABLES.FISCAL_YEARS).insert(fiscalYear)
            if (fyErr) throw fyErr

            const prevYearId = `FY-${year - 1}`
            const { data: prevYear } = await getServiceSupabase().from(TABLES.FISCAL_YEARS).select("id").eq("id", prevYearId).single()
            if (prevYear) {
                await getServiceSupabase().from(TABLES.FISCAL_YEARS).update({ isCurrent: false }).eq("id", prevYearId)
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

    static async getCurrentPeriod(): Promise<FiscalPeriod | null> {
        try {
            const now = new Date()
            const year = now.getFullYear()
            const month = now.getMonth() + 1
            const periodId = `FY-${year}-${String(month).padStart(2, "0")}`

            const { data, error } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).select("*").eq("id", periodId).single()
            if (error || !data) {
                await this.initializeFiscalYear(year)
                const { data: newData } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).select("*").eq("id", periodId).single()
                return newData ? this.rowToPeriod(newData) : null
            }

            return this.rowToPeriod(data)
        } catch (error) {
            console.error("Error getting current period:", error)
            return null
        }
    }

    static async getPeriodForDate(date: Date): Promise<FiscalPeriod | null> {
        try {
            const year = date.getFullYear()
            const month = date.getMonth() + 1
            const periodId = `FY-${year}-${String(month).padStart(2, "0")}`

            const { data, error } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).select("*").eq("id", periodId).single()
            return (!error && data) ? this.rowToPeriod(data) : null
        } catch (error) {
            console.error("Error getting period for date:", error)
            return null
        }
    }

    static async isPeriodOpen(date: Date): Promise<boolean> {
        const period = await this.getPeriodForDate(date)
        return period?.status === PeriodStatus.OPEN
    }

    static async closePeriod(
        periodId: string,
        closedBy: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { data, error } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).select("*").eq("id", periodId).single()
            if (error || !data) {
                return { success: false, error: "Period not found" }
            }

            const period = this.rowToPeriod(data)
            if (period.status !== PeriodStatus.OPEN) {
                return { success: false, error: "Period is already closed or locked" }
            }

            const { error: updErr } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).update({
                status: PeriodStatus.CLOSED,
                closed_at: new Date().toISOString(),
                closed_by: closedBy,
            }).eq("id", periodId)
            if (updErr) throw updErr

            console.log(`✅ Closed fiscal period ${periodId}`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to close period",
            }
        }
    }

    static async reopenPeriod(
        periodId: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { data, error } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).select("*").eq("id", periodId).single()
            if (error || !data) {
                return { success: false, error: "Period not found" }
            }

            const period = this.rowToPeriod(data)
            if (period.status === PeriodStatus.LOCKED) {
                return { success: false, error: "Locked periods cannot be reopened" }
            }

            const { error: updErr } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).update({
                status: PeriodStatus.OPEN,
                closed_at: null,
                closed_by: null,
            }).eq("id", periodId)
            if (updErr) throw updErr

            console.log(`✅ Reopened fiscal period ${periodId}`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to reopen period",
            }
        }
    }

    static async lockPeriod(
        periodId: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { data, error } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).select("*").eq("id", periodId).single()
            if (error || !data) {
                return { success: false, error: "Period not found" }
            }

            const period = this.rowToPeriod(data)
            if (period.status !== PeriodStatus.CLOSED) {
                return { success: false, error: "Period must be closed before locking" }
            }

            const { error: updErr } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS).update({
                status: PeriodStatus.LOCKED,
            }).eq("id", periodId)
            if (updErr) throw updErr

            console.log(`🔒 Locked fiscal period ${periodId}`)
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to lock period",
            }
        }
    }

    static async getPeriodsForYear(year: number): Promise<FiscalPeriod[]> {
        try {
            const { data, error } = await getServiceSupabase().from(TABLES.FISCAL_PERIODS)
                .select("*")
                .eq("year", year)
                .order("month", { ascending: true })
            if (error) throw error

            return (data || []).map((row: any) => this.rowToPeriod(row))
        } catch (error) {
            console.error("Error getting periods:", error)
            return []
        }
    }

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

    private static rowToPeriod(data: any): FiscalPeriod {
        return {
            id: data.id,
            year: data.year,
            month: data.month,
            startDate: data.start_date || new Date().toISOString(),
            endDate: data.end_date || new Date().toISOString(),
            status: data.status as PeriodStatus,
            closedAt: data.closed_at || undefined,
            closedBy: data.closed_by,
            createdAt: data.created_at || new Date().toISOString(),
        }
    }
}
