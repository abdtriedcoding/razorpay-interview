import { formatAmount } from './format'
import {
  type Payment,
  type PaymentLink,
  canRecordPayment,
  getAmountDue,
} from './paymentLink'
import { parseMoney } from './validation'

/**
 * Business rules for a payment against a link (amount already in paise):
 * - only Active / Partially Paid links accept payments
 * - amount > ₹0 and <= the amount due
 * - partial payments disabled: the payment must settle the full amount due
 * - partial payments enabled: the first payment must be >= the minimum first payment
 */
export function getPaymentError(
  link: PaymentLink,
  amountPaise: number,
  now: number = Date.now(),
): string | undefined {
  if (!canRecordPayment(link, now)) return 'This link can no longer accept payments'
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return 'Payment amount must be greater than ₹0'
  }
  const due = getAmountDue(link)
  if (amountPaise > due) return `Payment cannot exceed the amount due of ${formatAmount(due)}`
  if (!link.allowPartial && amountPaise !== due) {
    return `Partial payments are not allowed. Pay the full ${formatAmount(due)}`
  }
  const isFirstPayment = link.payments.length === 0
  if (
    link.allowPartial &&
    isFirstPayment &&
    link.minFirstPaymentPaise !== null &&
    amountPaise < link.minFirstPaymentPaise
  ) {
    return `First payment must be at least ${formatAmount(link.minFirstPaymentPaise)}`
  }
  return undefined
}

/** Validates the raw "Record payment" input. */
export function validatePaymentInput(
  link: PaymentLink,
  raw: string,
  now: number = Date.now(),
): { amountPaise: number; error?: undefined } | { amountPaise?: undefined; error: string } {
  const parsed = parseMoney(raw, 'Payment amount')
  if (parsed.error !== undefined) return { error: parsed.error }
  const error = getPaymentError(link, parsed.paise, now)
  return error ? { error } : { amountPaise: parsed.paise }
}

/** Returns a new link with the payment appended. Throws if the payment breaks a rule. */
export function recordPayment(
  link: PaymentLink,
  payment: Payment,
  now: number = Date.now(),
): PaymentLink {
  const error = getPaymentError(link, payment.amountPaise, now)
  if (error) throw new Error(error)
  return { ...link, payments: [...link.payments, payment] }
}

/** Sensible default for the "Record payment" input: the minimum for a first partial payment, else the full amount due. */
export function suggestedPaymentPaise(link: PaymentLink): number {
  const due = getAmountDue(link)
  if (link.allowPartial && link.payments.length === 0 && link.minFirstPaymentPaise !== null) {
    return Math.min(link.minFirstPaymentPaise, due)
  }
  return due
}
