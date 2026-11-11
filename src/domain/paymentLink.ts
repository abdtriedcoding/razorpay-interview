/**
 * Status shown to the merchant. Status is never stored: it is derived from the
 * recorded payments and the expiry time (see getLinkStatus).
 */
export type LinkStatus = 'active' | 'partially_paid' | 'paid' | 'expired'

export type StatusFilter = 'all' | LinkStatus

export interface Customer {
  email?: string
  phone?: string
}

export interface Payment {
  id: string
  /** Amount in paise (integer). */
  amountPaise: number
  /** ISO timestamp. */
  paidAt: string
}

export interface PaymentLink {
  id: string
  url: string
  /** Total amount in paise (integer) to avoid floating-point rounding issues. */
  amountPaise: number
  description: string
  customer: Customer
  /** ISO timestamp. */
  createdAt: string
  /** ISO timestamp, or null when the link never expires. */
  expiresAt: string | null
  /** When false, a payment must settle the full amount due. */
  allowPartial: boolean
  /** Minimum for the first payment when allowPartial is true; otherwise null. */
  minFirstPaymentPaise: number | null
  /** Payments in the order they were recorded. */
  payments: Payment[]
}

export interface CreatePaymentLinkInput {
  amountPaise: number
  description: string
  customer: Customer
  expiresAt: string | null
  allowPartial: boolean
  minFirstPaymentPaise: number | null
}

export const MAX_AMOUNT_PAISE = 5_00_000 * 100
export const DESCRIPTION_MAX_LENGTH = 100

export const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  'active',
  'partially_paid',
  'paid',
  'expired',
]

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  active: 'Active',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  expired: 'Expired',
}

export function getAmountPaid(link: PaymentLink): number {
  return link.payments.reduce((sum, p) => sum + p.amountPaise, 0)
}

export function getAmountDue(link: PaymentLink): number {
  return Math.max(0, link.amountPaise - getAmountPaid(link))
}

/** Time of the payment that settled the link, or null if it is not fully paid. */
export function getPaidAt(link: PaymentLink): string | null {
  if (getAmountDue(link) > 0 || link.payments.length === 0) return null
  return link.payments[link.payments.length - 1].paidAt
}

/**
 * Derives the status the merchant sees, in priority order:
 * 1. Paid: nothing left to pay. A fully paid link never becomes Expired.
 * 2. Expired: the expiry time has been reached (beats Active and Partially Paid).
 * 3. Partially Paid: some payment received, balance remains.
 * 4. Active: nothing paid yet.
 */
export function getLinkStatus(link: PaymentLink, now: number = Date.now()): LinkStatus {
  if (getAmountDue(link) === 0) return 'paid'
  if (link.expiresAt !== null && Date.parse(link.expiresAt) <= now) return 'expired'
  if (getAmountPaid(link) > 0) return 'partially_paid'
  return 'active'
}

/** Only Active and Partially Paid links accept payments. */
export function canRecordPayment(link: PaymentLink, now: number = Date.now()): boolean {
  const status = getLinkStatus(link, now)
  return status === 'active' || status === 'partially_paid'
}

export function filterLinks(
  links: readonly PaymentLink[],
  filter: StatusFilter,
  now: number = Date.now(),
): PaymentLink[] {
  if (filter === 'all') return [...links]
  return links.filter((link) => getLinkStatus(link, now) === filter)
}

export function countByStatus(
  links: readonly PaymentLink[],
  now: number = Date.now(),
): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: links.length,
    active: 0,
    partially_paid: 0,
    paid: 0,
    expired: 0,
  }
  for (const link of links) counts[getLinkStatus(link, now)] += 1
  return counts
}
