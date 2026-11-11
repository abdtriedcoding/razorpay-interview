import {
  getPaymentError,
  recordPayment,
  suggestedPaymentPaise,
  validatePaymentInput,
} from './payment'
import {
  type Payment,
  type PaymentLink,
  getAmountDue,
  getAmountPaid,
  getLinkStatus,
  getPaidAt,
} from './paymentLink'

const NOW = Date.parse('2026-06-15T10:00:00Z')

/** ₹1,500.00 total by default. */
function makeLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'plink_1',
    url: 'https://pay.example.com/l/abc',
    amountPaise: 150_000,
    description: 'Test',
    customer: { email: 'a@example.com' },
    createdAt: '2026-06-01T10:00:00Z',
    expiresAt: null,
    allowPartial: false,
    minFirstPaymentPaise: null,
    payments: [],
    ...overrides,
  }
}

/** Partial payments on, ₹500.00 minimum first payment. */
const partialLink = (overrides: Partial<PaymentLink> = {}) =>
  makeLink({ allowPartial: true, minFirstPaymentPaise: 50_000, ...overrides })

let paymentSeq = 0
function pay(amountPaise: number, paidAt = '2026-06-15T09:00:00Z'): Payment {
  paymentSeq += 1
  return { id: `pay_${paymentSeq}`, amountPaise, paidAt }
}

describe('getPaymentError', () => {
  it.each([0, -100, 10.5])('rejects a non-positive or fractional paise amount (%s)', (amount) => {
    expect(getPaymentError(partialLink(), amount, NOW)).toBe(
      'Payment amount must be greater than ₹0',
    )
  })

  it('rejects a payment above the amount due', () => {
    expect(getPaymentError(makeLink(), 150_001, NOW)).toBe(
      'Payment cannot exceed the amount due of ₹1,500.00',
    )
  })

  it('rejects a payment above the remaining balance after earlier payments', () => {
    const link = partialLink({ payments: [pay(100_000)] })
    expect(getPaymentError(link, 50_001, NOW)).toBe(
      'Payment cannot exceed the amount due of ₹500.00',
    )
    expect(getPaymentError(link, 50_000, NOW)).toBeUndefined()
  })

  describe('partial payments disabled', () => {
    it('requires the payment to settle the full amount due', () => {
      expect(getPaymentError(makeLink(), 100_000, NOW)).toBe(
        'Partial payments are not allowed. Pay the full ₹1,500.00',
      )
      expect(getPaymentError(makeLink(), 150_000, NOW)).toBeUndefined()
    })
  })

  describe('partial payments enabled', () => {
    it('requires the first payment to meet the minimum', () => {
      expect(getPaymentError(partialLink(), 49_999, NOW)).toBe(
        'First payment must be at least ₹500.00',
      )
      expect(getPaymentError(partialLink(), 50_000, NOW)).toBeUndefined()
      expect(getPaymentError(partialLink(), 150_000, NOW)).toBeUndefined()
    })

    it('allows later payments below the minimum', () => {
      const link = partialLink({ payments: [pay(50_000)] })
      expect(getPaymentError(link, 100, NOW)).toBeUndefined()
    })
  })

  it('rejects payments on a paid link', () => {
    const link = partialLink({ payments: [pay(150_000)] })
    expect(getLinkStatus(link, NOW)).toBe('paid')
    expect(getPaymentError(link, 100, NOW)).toBe('This link can no longer accept payments')
  })

  it.each([
    ['unpaid', makeLink({ expiresAt: '2026-06-15T10:00:00Z' })],
    ['partially paid', partialLink({ expiresAt: '2026-06-15T10:00:00Z', payments: [pay(50_000)] })],
  ])('rejects payments on an expired %s link', (_label, link) => {
    expect(getLinkStatus(link, NOW)).toBe('expired')
    expect(getPaymentError(link, getAmountDue(link), NOW)).toBe(
      'This link can no longer accept payments',
    )
  })
})

describe('validatePaymentInput', () => {
  it.each([
    ['', 'Payment amount is required'],
    ['   ', 'Payment amount is required'],
    ['abc', 'Enter a valid amount, e.g. 1500 or 1500.50'],
    ['-5', 'Enter a valid amount, e.g. 1500 or 1500.50'],
    ['10.999', 'Payment amount can have at most 2 decimal places'],
    ['0', 'Payment amount must be greater than ₹0'],
  ])('rejects raw input %j', (raw, error) => {
    expect(validatePaymentInput(partialLink(), raw, NOW)).toEqual({ error })
  })

  it('returns parsed paise for valid input', () => {
    expect(validatePaymentInput(partialLink(), '1,000.50', NOW)).toEqual({ amountPaise: 100_050 })
  })

  it('applies the business rules after parsing', () => {
    expect(validatePaymentInput(partialLink(), '499.99', NOW)).toEqual({
      error: 'First payment must be at least ₹500.00',
    })
    expect(validatePaymentInput(makeLink(), '1500.01', NOW)).toEqual({
      error: 'Payment cannot exceed the amount due of ₹1,500.00',
    })
  })
})

describe('recordPayment', () => {
  it('returns a new link with the payment appended, leaving the input untouched', () => {
    const link = partialLink()
    const payment = pay(60_000)
    const updated = recordPayment(link, payment, NOW)

    expect(updated).not.toBe(link)
    expect(updated.payments).toEqual([payment])
    expect(link.payments).toEqual([])
    expect(getAmountDue(updated)).toBe(90_000)
    expect(getLinkStatus(updated, NOW)).toBe('partially_paid')
  })

  it('throws with the rule message when the payment is invalid', () => {
    const link = partialLink()
    expect(() => recordPayment(link, pay(100), NOW)).toThrow(
      'First payment must be at least ₹500.00',
    )
    expect(link.payments).toEqual([])
  })

  it('throws when the link has expired', () => {
    const link = makeLink({ expiresAt: '2026-06-15T09:00:00Z' })
    expect(() => recordPayment(link, pay(150_000), NOW)).toThrow(
      'This link can no longer accept payments',
    )
  })

  it('settles a link over a sequence of payments', () => {
    let link = partialLink()
    link = recordPayment(link, pay(50_000, '2026-06-15T08:00:00Z'), NOW)
    expect(getLinkStatus(link, NOW)).toBe('partially_paid')
    link = recordPayment(link, pay(25_000, '2026-06-15T08:30:00Z'), NOW)
    expect(getLinkStatus(link, NOW)).toBe('partially_paid')
    link = recordPayment(link, pay(75_000, '2026-06-15T09:00:00Z'), NOW)

    expect(getLinkStatus(link, NOW)).toBe('paid')
    expect(getAmountDue(link)).toBe(0)
    expect(getAmountPaid(link)).toBe(150_000)
    expect(getPaidAt(link)).toBe('2026-06-15T09:00:00Z')
    expect(() => recordPayment(link, pay(1), NOW)).toThrow(
      'This link can no longer accept payments',
    )
  })
})

describe('suggestedPaymentPaise', () => {
  it('suggests the full amount when partial payments are off', () => {
    expect(suggestedPaymentPaise(makeLink())).toBe(150_000)
  })

  it('suggests the minimum for the first partial payment', () => {
    expect(suggestedPaymentPaise(partialLink())).toBe(50_000)
  })

  it('suggests the remaining balance after the first partial payment', () => {
    expect(suggestedPaymentPaise(partialLink({ payments: [pay(60_000)] }))).toBe(90_000)
  })
})
