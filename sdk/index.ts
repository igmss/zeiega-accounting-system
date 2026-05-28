import createClient from "openapi-fetch"
import type { paths } from "./types"

export type { paths as AccuFinancePaths }

export function createAccuFinanceClient(config: {
  baseUrl?: string
  apiKey?: string
}) {
  const baseUrl = config.baseUrl || "https://zeiega-accounting-system.vercel.app"

  return createClient<paths>({
    baseUrl,
    headers: config.apiKey
      ? { Authorization: `Bearer ${config.apiKey}` }
      : undefined,
  })
}

export type AccuFinanceClient = ReturnType<typeof createAccuFinanceClient>
