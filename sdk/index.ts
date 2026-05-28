import createClient from "openapi-fetch"
import type { paths } from "./types"

export type { paths as AccuFinancePaths }

export interface AccuFinanceConfig {
  /** Your AccuFinance API server URL. Required. */
  baseUrl: string
  /** Admin token (API_SECRET or API_ADMIN_TOKENS entry). Required. */
  apiKey: string
}

export function createAccuFinanceClient(config: AccuFinanceConfig) {
  return createClient<paths>({
    baseUrl: config.baseUrl,
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })
}

export type AccuFinanceClient = ReturnType<typeof createAccuFinanceClient>
