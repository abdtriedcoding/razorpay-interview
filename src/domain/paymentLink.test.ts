import { formatAmount } from './format'
import { type PaymentLink, countByStatus, filterLinks, getLinkStatus } from './paymentLink'

const NOW = Date.parse('2026-06-15T10:00:00Z')

function makeLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'plink_1',
    url: 'https://pay.example.com/l/abc',
    amountPaise: 10_000,
    description: 'Test',
    customer: { email: 'a@example.com' },
    status: 'active',
    createdAt: '2026-06-01T10:00:00Z',
    expiresAt: null,
    ...overrides,
  }
}

describe('getLinkStatus', () => {
  it('keeps a link without expiry active', () => {
    expect(getLinkStatus(makeLink(), NOW)).toBe('active')
  })

  it('keeps a link active until its expiry time', () => {
    const link = makeLink({ expiresAt: '2026-06-15T10:00:01Z' })
    expect(getLinkStatus(link, NOW)).toBe('active')
  })

  it('marks an unpaid link expired once the expiry time is reached', () => {
    const link = makeLink({ expiresAt: '2026-06-15T10:00:00Z' })
    expect(getLinkStatus(link, NOW)).toBe('expired')
    expect(getLinkStatus(link, NOW + 60_000)).toBe('expired')
  })

  it('never marks a paid link as expired', () => {
    const link = makeLink({ status: 'paid', expiresAt: '2026-06-14T00:00:00Z' })
    expect(getLinkStatus(link, NOW)).toBe('paid')
  })

  it('transitions automatically as time passes', () => {
    const link = makeLink({ expiresAt: '2026-06-15T11:00:00Z' })
    expect(getLinkStatus(link, NOW)).toBe('active')
    expect(getLinkStatus(link, NOW + 60 * 60 * 1000)).toBe('expired')
  })
})

describe('filterLinks / countByStatus', () => {
  const links = [
    makeLink({ id: 'active' }),
    makeLink({ id: 'paid', status: 'paid' }),
    makeLink({ id: 'expired', expiresAt: '2026-06-01T00:00:00Z' }),
    makeLink({ id: 'expiring', expiresAt: '2026-06-16T00:00:00Z' }),
  ]

  it.each([
    ['all', ['active', 'paid', 'expired', 'expiring']],
    ['active', ['active', 'expiring']],
    ['paid', ['paid']],
    ['expired', ['expired']],
  ] as const)('filters by %s', (filter, ids) => {
    expect(filterLinks(links, filter, NOW).map((l) => l.id)).toEqual(ids)
  })

  it('counts links per derived status', () => {
    expect(countByStatus(links, NOW)).toEqual({ all: 4, active: 2, paid: 1, expired: 1 })
  })
})

describe('formatAmount', () => {
  it('uses Indian digit grouping', () => {
    expect(formatAmount(50_000_000)).toBe('₹5,00,000.00')
    expect(formatAmount(150_050)).toBe('₹1,500.50')
  })
})
