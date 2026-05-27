import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formats a value as currency (defaults to EGP). Accepts number-like inputs and
// guards against NaN/Infinity so UIs don't show "EGP NaN".
export function formatCurrency(
  value: number | string | null | undefined,
  locale: string = "en-US",
  currency: string = "EGP",
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
) {
  const num = typeof value === "string" ? Number(value) : (value as number)
  const safe = Number.isFinite(num) ? (num as number) : 0
  const minimumFractionDigits = options?.minimumFractionDigits ?? 2
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(safe)
}

export function formatNumber(
  value: number | string | null | undefined,
  locale = "en-US",
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
) {
  const num = typeof value === "string" ? Number(value) : (value as number)
  const safe = Number.isFinite(num) ? (num as number) : 0
  const minimumFractionDigits = options?.minimumFractionDigits ?? 0
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(safe)
}
