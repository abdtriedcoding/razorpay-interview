import {
  type CreatePaymentLinkInput,
  DESCRIPTION_MAX_LENGTH,
  MAX_AMOUNT_PAISE,
} from './paymentLink'

/** Raw values as typed into the form. */
export interface PaymentLinkFormValues {
  amount: string
  description: string
  email: string
  phone: string
  /** Value of a `datetime-local` input (`YYYY-MM-DDTHH:mm`, local time), or ''. */
  expiresAt: string
}

export type PaymentLinkFormField = keyof PaymentLinkFormValues | 'contact'
export type PaymentLinkFormErrors = Partial<Record<PaymentLinkFormField, string>>

export const EMPTY_FORM_VALUES: PaymentLinkFormValues = {
  amount: '',
  description: '',
  email: '',
  phone: '',
  expiresAt: '',
}

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** Indian mobile number: optional +91 / 91 / 0 prefix, then 10 digits starting with 6-9. */
const PHONE_PATTERN = /^(?:\+91|91|0)?[6-9]\d{9}$/

const cleanAmount = (raw: string) => raw.trim().replace(/,/g, '')

/**
 * Accepts "1500", "1,500.50" or "1500.5" and returns exact integer paise using string
 * arithmetic (no floating point). Returns null for anything else, including >2 decimals.
 */
export function parseAmountToPaise(raw: string): number | null {
  const cleaned = cleanAmount(raw)
  if (!AMOUNT_PATTERN.test(cleaned)) return null
  const [rupees, decimals = ''] = cleaned.split('.')
  if (decimals.length > 2) return null
  return Number(rupees) * 100 + Number(decimals.padEnd(2, '0'))
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

function validateAmount(raw: string): string | undefined {
  if (raw.trim() === '') return 'Amount is required'
  const cleaned = cleanAmount(raw)
  if (!AMOUNT_PATTERN.test(cleaned)) return 'Enter a valid amount, e.g. 1500 or 1500.50'
  const paise = parseAmountToPaise(cleaned)
  if (paise === null) return 'Amount can have at most 2 decimal places'
  if (paise <= 0) return 'Amount must be greater than ₹0'
  if (paise > MAX_AMOUNT_PAISE) return 'Amount cannot exceed ₹5,00,000'
  return undefined
}

function validateDescription(raw: string): string | undefined {
  const value = raw.trim()
  if (value === '') return 'Description is required'
  if (value.length > DESCRIPTION_MAX_LENGTH)
    return `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`
  return undefined
}

function validateExpiry(raw: string, now: number): string | undefined {
  if (raw.trim() === '') return undefined
  const time = Date.parse(raw)
  if (Number.isNaN(time)) return 'Enter a valid date and time'
  if (time <= now) return 'Expiry must be in the future'
  return undefined
}

export function validatePaymentLinkForm(
  values: PaymentLinkFormValues,
  now: number = Date.now(),
): PaymentLinkFormErrors {
  const errors: PaymentLinkFormErrors = {}

  const amount = validateAmount(values.amount)
  if (amount) errors.amount = amount

  const description = validateDescription(values.description)
  if (description) errors.description = description

  const email = values.email.trim()
  const phone = normalizePhone(values.phone.trim())
  if (email === '' && phone === '') {
    errors.contact = 'Provide a customer email or phone number'
  }
  if (email !== '' && !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address, e.g. name@example.com'
  }
  if (phone !== '' && !PHONE_PATTERN.test(phone)) {
    errors.phone = 'Enter a valid 10-digit mobile number, optionally prefixed with +91'
  }

  const expiresAt = validateExpiry(values.expiresAt, now)
  if (expiresAt) errors.expiresAt = expiresAt

  return errors
}

export function hasErrors(errors: PaymentLinkFormErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Converts validated form values into the API payload. Call only when there are no errors. */
export function toCreateInput(values: PaymentLinkFormValues): CreatePaymentLinkInput {
  const amountPaise = parseAmountToPaise(values.amount)
  if (amountPaise === null) throw new Error('toCreateInput called with an invalid amount')
  const email = values.email.trim()
  const phone = normalizePhone(values.phone.trim())
  return {
    amountPaise,
    description: values.description.trim(),
    customer: {
      ...(email && { email }),
      ...(phone && { phone }),
    },
    expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
  }
}
