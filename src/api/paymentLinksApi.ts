import { recordPayment as applyPayment } from '../domain/payment'
import type { CreatePaymentLinkInput, PaymentLink } from '../domain/paymentLink'
import { type LinkStorage, STORAGE_KEY, loadLinks, saveLinks } from './storage'

/**
 * The boundary the UI talks to. The in-memory implementation below stands in for a
 * real backend; swapping in an HTTP client would not require UI changes.
 */
export interface PaymentLinksApi {
  list(): Promise<PaymentLink[]>
  create(input: CreatePaymentLinkInput): Promise<PaymentLink>
  /** Records a payment of `amountPaise` against the link. Rejects with a user-facing message. */
  recordPayment(id: string, amountPaise: number): Promise<PaymentLink>
  /** Adds demo links covering every status. */
  loadSampleLinks(): Promise<PaymentLink[]>
}

interface InMemoryApiOptions {
  /** Simulated network latency in ms. */
  latencyMs?: number
  /** Used when storage is absent or holds nothing usable. */
  initialLinks?: PaymentLink[]
  now?: () => number
  /** Where links are persisted between page loads. No persistence when omitted/null. */
  storage?: LinkStorage | null
  storageKey?: string
}

const LINK_BASE_URL = 'https://pay.example.com/l/'

function randomCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

export function createInMemoryPaymentLinksApi({
  latencyMs = 0,
  initialLinks = [],
  now = Date.now,
  storage = null,
  storageKey = STORAGE_KEY,
}: InMemoryApiOptions = {}): PaymentLinksApi {
  let links: PaymentLink[] = (storage && loadLinks(storage, storageKey)) ?? [...initialLinks]

  const commit = (next: PaymentLink[]) => {
    links = next
    if (storage) saveLinks(storage, links, storageKey)
  }

  // Return copies so callers can never mutate the "server" state.
  const respond = <T>(value: T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), latencyMs))

  const fail = (message: string): Promise<never> =>
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), latencyMs))

  const newLink = (input: CreatePaymentLinkInput, createdAt: number): PaymentLink => {
    const code = randomCode()
    return {
      id: `plink_${code}`,
      url: `${LINK_BASE_URL}${code}`,
      amountPaise: input.amountPaise,
      description: input.description,
      customer: { ...input.customer },
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: input.expiresAt,
      allowPartial: input.allowPartial,
      minFirstPaymentPaise: input.allowPartial ? input.minFirstPaymentPaise : null,
      payments: [],
    }
  }

  const newPaymentId = () => `pay_${randomCode()}`

  /** Sample-data helper: attaches already-settled payments ([amountPaise, paidAt][]). */
  const withPayments = (link: PaymentLink, payments: [number, number][]): PaymentLink => ({
    ...link,
    payments: payments.map(([amountPaise, paidAt]) => ({
      id: newPaymentId(),
      amountPaise,
      paidAt: new Date(paidAt).toISOString(),
    })),
  })

  return {
    list: () => respond(links),

    create(input) {
      const link = newLink(input, now())
      commit([link, ...links])
      return respond(link)
    },

    recordPayment(id, amountPaise) {
      const link = links.find((l) => l.id === id)
      if (!link) return fail('Payment link not found')
      const t = now()
      let updated: PaymentLink
      try {
        updated = applyPayment(
          link,
          { id: newPaymentId(), amountPaise, paidAt: new Date(t).toISOString() },
          t,
        )
      } catch (error) {
        return fail(error instanceof Error ? error.message : 'Payment could not be recorded')
      }
      commit(links.map((l) => (l.id === id ? updated : l)))
      return respond(updated)
    },

    loadSampleLinks() {
      const t = now()
      const minute = 60 * 1000
      const hour = 60 * minute
      const day = 24 * hour
      const samples: PaymentLink[] = [
        // Active, accepts partial payments with a minimum first payment.
        newLink(
          {
            amountPaise: 2_499_00,
            description: 'Annual design subscription',
            customer: { email: 'ananya.rao@example.com', phone: '+919876543210' },
            expiresAt: new Date(t + 7 * day).toISOString(),
            allowPartial: true,
            minFirstPaymentPaise: 500_00,
          },
          t - 2 * hour,
        ),
        // Partially Paid: one payment recorded, balance remains.
        withPayments(
          newLink(
            {
              amountPaise: 15_000_00,
              description: 'Website development – milestone 1',
              customer: { email: 'vikram@example.com' },
              expiresAt: new Date(t + 14 * day).toISOString(),
              allowPartial: true,
              minFirstPaymentPaise: 5_000_00,
            },
            t - 3 * day,
          ),
          [[6_000_00, t - 2 * day]],
        ),
        // Paid: settled in two instalments.
        withPayments(
          newLink(
            {
              amountPaise: 12_000_00,
              description: 'Interior consultation',
              customer: { email: 'meera.iyer@example.com', phone: '+919845012345' },
              expiresAt: null,
              allowPartial: true,
              minFirstPaymentPaise: 4_000_00,
            },
            t - 6 * day,
          ),
          [
            [4_000_00, t - 5 * day],
            [8_000_00, t - 1 * day],
          ],
        ),
        // Expired: past expiry, nothing paid.
        newLink(
          {
            amountPaise: 799_50,
            description: 'Yoga class – March batch',
            customer: { phone: '9123456780' },
            expiresAt: new Date(t - day).toISOString(),
            allowPartial: false,
            minFirstPaymentPaise: null,
          },
          t - 10 * day,
        ),
        newLink(
          {
            amountPaise: 350_00,
            description: 'Cake order #1042',
            customer: { phone: '+919820011223' },
            // Expires shortly so the automatic Active -> Expired transition is visible.
            expiresAt: new Date(t + 2 * minute).toISOString(),
            allowPartial: false,
            minFirstPaymentPaise: null,
          },
          t - 5 * minute,
        ),
      ]
      commit([...links, ...samples].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      return respond(links)
    },
  }
}

/** App-wide instance: persisted to localStorage, with a small delay so loading states are visible. */
export const paymentLinksApi = createInMemoryPaymentLinksApi({
  latencyMs: 400,
  storage: typeof window !== 'undefined' ? safeLocalStorage() : null,
})

/** Accessing window.localStorage itself can throw (e.g. storage disabled by the browser). */
function safeLocalStorage(): LinkStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
