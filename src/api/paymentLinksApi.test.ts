import { formatAmount } from '../domain/format'
import {
  type CreatePaymentLinkInput,
  getAmountDue,
  getAmountPaid,
  getLinkStatus,
} from '../domain/paymentLink'
import { createInMemoryPaymentLinksApi } from './paymentLinksApi'
import { type LinkStorage, STORAGE_KEY } from './storage'

const NOW = Date.parse('2026-06-15T10:00:00Z')
const HOUR = 60 * 60 * 1000

function fakeStorage(initial: Record<string, string> = {}): LinkStorage & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

function input(overrides: Partial<CreatePaymentLinkInput> = {}): CreatePaymentLinkInput {
  return {
    amountPaise: 10_000_00,
    description: 'Consulting',
    customer: { email: 'a@example.com' },
    expiresAt: new Date(NOW + 24 * HOUR).toISOString(),
    allowPartial: true,
    minFirstPaymentPaise: 2_000_00,
    ...overrides,
  }
}

function makeApi(options: { storage?: LinkStorage | null; now?: () => number } = {}) {
  return createInMemoryPaymentLinksApi({ latencyMs: 0, now: () => NOW, ...options })
}

describe('create', () => {
  it('stores partial-payment settings and starts with no payments', async () => {
    const api = makeApi()
    const link = await api.create(input())
    expect(link).toMatchObject({ allowPartial: true, minFirstPaymentPaise: 2_000_00, payments: [] })
    expect(getLinkStatus(link, NOW)).toBe('active')
    expect(await api.list()).toEqual([link])
  })
})

describe('recordPayment', () => {
  it('moves a link from active to partially paid to paid', async () => {
    const api = makeApi()
    const link = await api.create(input())

    const partial = await api.recordPayment(link.id, 3_000_00)
    expect(partial.payments).toHaveLength(1)
    expect(partial.payments[0]).toMatchObject({
      amountPaise: 3_000_00,
      paidAt: new Date(NOW).toISOString(),
    })
    expect(partial.payments[0].id).toMatch(/^pay_/)
    expect(getAmountPaid(partial)).toBe(3_000_00)
    expect(getAmountDue(partial)).toBe(7_000_00)
    expect(getLinkStatus(partial, NOW)).toBe('partially_paid')

    const paid = await api.recordPayment(link.id, 7_000_00)
    expect(paid.payments).toHaveLength(2)
    expect(getAmountDue(paid)).toBe(0)
    expect(getLinkStatus(paid, NOW)).toBe('paid')
    expect(await api.list()).toEqual([paid])
  })

  it('rejects a payment above the amount due', async () => {
    const api = makeApi()
    const link = await api.create(input())
    await expect(api.recordPayment(link.id, 10_000_01)).rejects.toThrow(
      `Payment cannot exceed the amount due of ${formatAmount(10_000_00)}`,
    )
    expect((await api.list())[0].payments).toEqual([])
  })

  it('rejects a first payment below the minimum', async () => {
    const api = makeApi()
    const link = await api.create(input())
    await expect(api.recordPayment(link.id, 1_999_00)).rejects.toThrow(
      `First payment must be at least ${formatAmount(2_000_00)}`,
    )
  })

  it('rejects a payment on an expired link', async () => {
    let t = NOW
    const api = makeApi({ now: () => t })
    const link = await api.create(input({ expiresAt: new Date(NOW + HOUR).toISOString() }))
    t = NOW + 2 * HOUR
    await expect(api.recordPayment(link.id, 5_000_00)).rejects.toThrow(
      'This link can no longer accept payments',
    )
  })

  it('rejects an unknown link id', async () => {
    const api = makeApi()
    await expect(api.recordPayment('plink_missing', 100)).rejects.toThrow('Payment link not found')
  })
})

describe('loadSampleLinks', () => {
  it('adds links covering every status, newest first, after existing links', async () => {
    const api = makeApi()
    const mine = await api.create(input())
    const links = await api.loadSampleLinks()

    expect(links.map((l) => l.id)).toContain(mine.id)
    const statuses = links.map((l) => getLinkStatus(l, NOW))
    expect(new Set(statuses)).toEqual(new Set(['active', 'partially_paid', 'paid', 'expired']))
    const createdAt = links.map((l) => l.createdAt)
    expect(createdAt).toEqual([...createdAt].sort().reverse())
    expect(links.some((l) => l.allowPartial && l.minFirstPaymentPaise !== null && getLinkStatus(l, NOW) === 'active')).toBe(true)
    expect(links.some((l) => getLinkStatus(l, NOW) === 'paid' && l.payments.length === 2)).toBe(true)
  })
})

describe('persistence', () => {
  it('makes links visible to a new instance sharing the same storage (page reload)', async () => {
    const storage = fakeStorage()
    const first = makeApi({ storage })
    const link = await first.create(input())
    const updated = await first.recordPayment(link.id, 3_000_00)

    const stored = JSON.parse(storage.data[STORAGE_KEY])
    expect(stored.version).toBe(1)

    const second = makeApi({ storage })
    expect(await second.list()).toEqual([updated])
  })

  it('persists sample links', async () => {
    const storage = fakeStorage()
    const samples = await makeApi({ storage }).loadSampleLinks()
    expect(await makeApi({ storage }).list()).toEqual(samples)
  })

  it.each([
    ['corrupt JSON', '{not json'],
    ['a wrong version', JSON.stringify({ version: 99, links: [] })],
    ['links that are not an array', JSON.stringify({ version: 1, links: 'nope' })],
    ['implausible links', JSON.stringify({ version: 1, links: [{ id: 'x', status: 'paid' }] })],
  ])('starts empty when storage holds %s', async (_, value) => {
    const api = makeApi({ storage: fakeStorage({ [STORAGE_KEY]: value }) })
    expect(await api.list()).toEqual([])
  })

  it('starts empty when reading storage throws', async () => {
    const storage: LinkStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(await makeApi({ storage }).list()).toEqual([])
  })

  it('keeps working in memory when saving throws', async () => {
    const storage: LinkStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const api = makeApi({ storage })
    const link = await api.create(input())
    expect(await api.list()).toEqual([link])
  })

  it('does not persist anything without storage', async () => {
    const storage = fakeStorage()
    await makeApi().create(input())
    expect(await makeApi({ storage }).list()).toEqual([])
  })
})
