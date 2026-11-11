/** Status persisted for a link. "Expired" is never stored: it is derived from `expiresAt`. */
export type StoredLinkStatus = 'active' | 'paid'

/** Status shown to the merchant. */
export type LinkStatus = 'active' | 'paid' | 'expired'

export type StatusFilter = 'all' | LinkStatus

export interface Customer {
  email?: string
  phone?: string
}

export interface PaymentLink {
  id: string
  url: string
  /** Amount in paise (integer) to avoid floating-point rounding issues. */
  amountPaise: number
  description: string
  customer: Customer
  status: StoredLinkStatus
  /** ISO timestamp. */
  createdAt: string
  /** ISO timestamp, or null when the link never expires. */
  expiresAt: string | null
  /** ISO timestamp, set when the link is paid. */
  paidAt?: string
}

export interface CreatePaymentLinkInput {
  amountPaise: number
  description: string
  customer: Customer
  expiresAt: string | null
}

export const MAX_AMOUNT_PAISE = 5_00_000 * 100
export const DESCRIPTION_MAX_LENGTH = 100

export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'active', 'paid', 'expired']

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  active: 'Active',
  paid: 'Paid',
  expired: 'Expired',
}

/**
 * Derives the status the merchant sees. A paid link stays paid forever; an unpaid
 * link becomes expired as soon as `now` reaches its expiry time.
 */
export function getLinkStatus(link: PaymentLink, now: number = Date.now()): LinkStatus {
  if (link.status === 'paid') return 'paid'
  if (link.expiresAt !== null && Date.parse(link.expiresAt) <= now) return 'expired'
  return 'active'
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
  const counts: Record<StatusFilter, number> = { all: links.length, active: 0, paid: 0, expired: 0 }
  for (const link of links) counts[getLinkStatus(link, now)] += 1
  return counts
}
