import type { Payment, PaymentLink } from '../domain/paymentLink'

/** The subset of the Web Storage API we need (window.localStorage satisfies it). */
export type LinkStorage = Pick<Storage, 'getItem' | 'setItem'>

export const STORAGE_KEY = 'payment-links-manager'
export const STORAGE_VERSION = 1

interface StoredEnvelope {
  version: typeof STORAGE_VERSION
  links: PaymentLink[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringOrNull = (value: unknown) => value === null || typeof value === 'string'
const isNumberOrNull = (value: unknown) => value === null || typeof value === 'number'

function isPayment(value: unknown): value is Payment {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.amountPaise === 'number' &&
    typeof value.paidAt === 'string'
  )
}

/** Shallow shape check: enough to keep the UI from crashing on hand-edited or stale data. */
function isPaymentLink(value: unknown): value is PaymentLink {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.url === 'string' &&
    typeof value.amountPaise === 'number' &&
    typeof value.description === 'string' &&
    isRecord(value.customer) &&
    typeof value.createdAt === 'string' &&
    isStringOrNull(value.expiresAt) &&
    typeof value.allowPartial === 'boolean' &&
    isNumberOrNull(value.minFirstPaymentPaise) &&
    Array.isArray(value.payments) &&
    value.payments.every(isPayment)
  )
}

/**
 * Reads persisted links. Returns null when nothing usable is stored (missing key,
 * unparseable JSON, unknown version, malformed links, or storage access throwing).
 */
export function loadLinks(storage: LinkStorage, key: string = STORAGE_KEY): PaymentLink[] | null {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return null
    const { links } = parsed
    if (!Array.isArray(links) || !links.every(isPaymentLink)) return null
    return links
  } catch {
    return null
  }
}

/** Persists links. Failures (private mode, quota exceeded) are ignored: data stays in memory. */
export function saveLinks(
  storage: LinkStorage,
  links: readonly PaymentLink[],
  key: string = STORAGE_KEY,
): void {
  const envelope: StoredEnvelope = { version: STORAGE_VERSION, links: [...links] }
  try {
    storage.setItem(key, JSON.stringify(envelope))
  } catch {
    // Best effort only.
  }
}
