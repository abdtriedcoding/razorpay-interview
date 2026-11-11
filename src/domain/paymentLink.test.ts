import { formatAmount } from './format'
import {
  type Payment,
  type PaymentLink,
  STATUS_FILTERS,
  canRecordPayment,
  countByStatus,
  filterLinks,
  getAmountDue,
  getAmountPaid,
  getLinkStatus,
  getPaidAt,
} from './paymentLink'

const NOW = Date.parse('2026-06-15T10:00:00Z')

function makeLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'plink_1',
    url: 'https://pay.example.com/l/abc',
    amountPaise: 10_000,
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

let paymentSeq = 0
function pay(amountPaise: number, paidAt = '2026-06-10T10:00:00Z'): Payment {
  paymentSeq += 1
  return { id: `pay_${paymentSeq}`, amountPaise, paidAt }
}

describe('balance calculations', () => {
  it('has nothing paid and the full amount due with no payments', () => {
    const link = makeLink()
    expect(getAmountPaid(link)).toBe(0)
    expect(getAmountDue(link)).toBe(10_000)
    expect(getPaidAt(link)).toBeNull()
  })

  it('subtracts a single partial payment from the amount due', () => {
    const link = makeLink({ allowPartial: true, payments: [pay(2_500)] })
    expect(getAmountPaid(link)).toBe(2_500)
    expect(getAmountDue(link)).toBe(7_500)
    expect(getPaidAt(link)).toBeNull()
  })

  it('sums multiple payments', () => {
    const link = makeLink({ allowPartial: true, payments: [pay(2_500), pay(1_000), pay(499)] })
    expect(getAmountPaid(link)).toBe(3_999)
    expect(getAmountDue(link)).toBe(6_001)
    expect(getPaidAt(link)).toBeNull()
  })

  it('reports the time of the settling payment once fully paid', () => {
    const link = makeLink({
      allowPartial: true,
      payments: [pay(4_000, '2026-06-05T08:00:00Z'), pay(6_000, '2026-06-12T09:30:00Z')],
    })
    expect(getAmountPaid(link)).toBe(10_000)
    expect(getAmountDue(link)).toBe(0)
    expect(getPaidAt(link)).toBe('2026-06-12T09:30:00Z')
  })

  it('reports the payment time for a single full payment', () => {
    const link = makeLink({ payments: [pay(10_000, '2026-06-11T12:00:00Z')] })
    expect(getPaidAt(link)).toBe('2026-06-11T12:00:00Z')
  })
})

describe('getLinkStatus', () => {
  it('keeps a link without expiry active', () => {
    expect(getLinkStatus(makeLink(), NOW)).toBe('active')
  })

  it('keeps a link active until its expiry time', () => {
    const link = makeLink({ expiresAt: '2026-06-15T10:00:01Z' })
    expect(getLinkStatus(link, NOW)).toBe('active')
  })

  it('marks an unpaid link expired once the expiry time is reached (boundary inclusive)', () => {
    const link = makeLink({ expiresAt: '2026-06-15T10:00:00Z' })
    expect(getLinkStatus(link, NOW - 1)).toBe('active')
    expect(getLinkStatus(link, NOW)).toBe('expired')
    expect(getLinkStatus(link, NOW + 60_000)).toBe('expired')
  })

  it('transitions automatically as time passes', () => {
    const link = makeLink({ expiresAt: '2026-06-15T11:00:00Z' })
    expect(getLinkStatus(link, NOW)).toBe('active')
    expect(getLinkStatus(link, NOW + 60 * 60 * 1000)).toBe('expired')
  })

  it('moves active -> partially_paid -> paid as payments are added', () => {
    const active = makeLink({ allowPartial: true, expiresAt: '2026-06-20T00:00:00Z' })
    expect(getLinkStatus(active, NOW)).toBe('active')

    const partial = { ...active, payments: [pay(3_000)] }
    expect(getLinkStatus(partial, NOW)).toBe('partially_paid')

    const stillPartial = { ...partial, payments: [...partial.payments, pay(6_999)] }
    expect(getLinkStatus(stillPartial, NOW)).toBe('partially_paid')

    const paid = { ...stillPartial, payments: [...stillPartial.payments, pay(1)] }
    expect(getLinkStatus(paid, NOW)).toBe('paid')
  })

  it('marks a partially paid link expired once the expiry time is reached', () => {
    const link = makeLink({
      allowPartial: true,
      expiresAt: '2026-06-15T10:00:00Z',
      payments: [pay(3_000)],
    })
    expect(getLinkStatus(link, NOW - 1)).toBe('partially_paid')
    expect(getLinkStatus(link, NOW)).toBe('expired')
  })

  it('never marks a fully paid link as expired, even with expiry in the past', () => {
    const link = makeLink({ expiresAt: '2026-06-14T00:00:00Z', payments: [pay(10_000)] })
    expect(getLinkStatus(link, NOW)).toBe('paid')
  })

  it('never marks a link fully paid in instalments as expired', () => {
    const link = makeLink({
      allowPartial: true,
      expiresAt: '2026-06-14T00:00:00Z',
      payments: [pay(4_000), pay(6_000)],
    })
    expect(getLinkStatus(link, NOW)).toBe('paid')
  })
})

describe('canRecordPayment', () => {
  it.each([
    ['active', makeLink(), true],
    ['partially_paid', makeLink({ allowPartial: true, payments: [pay(1_000)] }), true],
    ['paid', makeLink({ payments: [pay(10_000)] }), false],
    ['expired', makeLink({ expiresAt: '2026-06-01T00:00:00Z' }), false],
    [
      'expired after partial payment',
      makeLink({ allowPartial: true, expiresAt: '2026-06-01T00:00:00Z', payments: [pay(1_000)] }),
      false,
    ],
  ] as const)('%s -> %s', (_label, link, expected) => {
    expect(canRecordPayment(link, NOW)).toBe(expected)
  })
})

describe('filterLinks / countByStatus', () => {
  const links = [
    makeLink({ id: 'active' }),
    makeLink({ id: 'paid', payments: [pay(10_000)] }),
    makeLink({ id: 'expired', expiresAt: '2026-06-01T00:00:00Z' }),
    makeLink({ id: 'expiring', expiresAt: '2026-06-16T00:00:00Z' }),
    makeLink({ id: 'partial', allowPartial: true, payments: [pay(2_000)] }),
    makeLink({
      id: 'partial-expired',
      allowPartial: true,
      expiresAt: '2026-06-01T00:00:00Z',
      payments: [pay(2_000)],
    }),
    makeLink({
      id: 'paid-late-expiry',
      allowPartial: true,
      expiresAt: '2026-06-01T00:00:00Z',
      payments: [pay(5_000), pay(5_000)],
    }),
  ]

  it('exposes a filter for every status', () => {
    expect(STATUS_FILTERS).toEqual(['all', 'active', 'partially_paid', 'paid', 'expired'])
  })

  it.each([
    [
      'all',
      ['active', 'paid', 'expired', 'expiring', 'partial', 'partial-expired', 'paid-late-expiry'],
    ],
    ['active', ['active', 'expiring']],
    ['partially_paid', ['partial']],
    ['paid', ['paid', 'paid-late-expiry']],
    ['expired', ['expired', 'partial-expired']],
  ] as const)('filters by %s', (filter, ids) => {
    expect(filterLinks(links, filter, NOW).map((l) => l.id)).toEqual(ids)
  })

  it('counts links per derived status', () => {
    expect(countByStatus(links, NOW)).toEqual({
      all: 7,
      active: 2,
      partially_paid: 1,
      paid: 2,
      expired: 2,
    })
  })

  it('re-derives counts as time passes', () => {
    // 'expiring' expires at 2026-06-16T00:00Z.
    expect(countByStatus(links, Date.parse('2026-06-16T00:00:00Z'))).toEqual({
      all: 7,
      active: 1,
      partially_paid: 1,
      paid: 2,
      expired: 3,
    })
  })
})

describe('formatAmount', () => {
  it('uses Indian digit grouping', () => {
    expect(formatAmount(50_000_000)).toBe('₹5,00,000.00')
    expect(formatAmount(150_050)).toBe('₹1,500.50')
  })
})
