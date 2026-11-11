import {
  type CreatePaymentLinkInput,
  type PaymentLink,
  getLinkStatus,
} from '../domain/paymentLink'

/**
 * The boundary the UI talks to. The in-memory implementation below stands in for a
 * real backend; swapping in an HTTP client would not require UI changes.
 */
export interface PaymentLinksApi {
  list(): Promise<PaymentLink[]>
  create(input: CreatePaymentLinkInput): Promise<PaymentLink>
  markPaid(id: string): Promise<PaymentLink>
  /** Adds demo links covering every status. */
  loadSampleLinks(): Promise<PaymentLink[]>
}

interface InMemoryApiOptions {
  /** Simulated network latency in ms. */
  latencyMs?: number
  initialLinks?: PaymentLink[]
  now?: () => number
}

const LINK_BASE_URL = 'https://pay.example.com/l/'

function randomCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

export function createInMemoryPaymentLinksApi({
  latencyMs = 0,
  initialLinks = [],
  now = Date.now,
}: InMemoryApiOptions = {}): PaymentLinksApi {
  let links: PaymentLink[] = [...initialLinks]

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
      status: 'active',
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: input.expiresAt,
    }
  }

  return {
    list: () => respond(links),

    create(input) {
      const link = newLink(input, now())
      links = [link, ...links]
      return respond(link)
    },

    markPaid(id) {
      const link = links.find((l) => l.id === id)
      if (!link) return fail('Payment link not found')
      if (getLinkStatus(link, now()) !== 'active') {
        return fail('Only active links can be marked as paid')
      }
      const paid: PaymentLink = { ...link, status: 'paid', paidAt: new Date(now()).toISOString() }
      links = links.map((l) => (l.id === id ? paid : l))
      return respond(paid)
    },

    loadSampleLinks() {
      const t = now()
      const hour = 60 * 60 * 1000
      const day = 24 * hour
      const samples: PaymentLink[] = [
        newLink(
          {
            amountPaise: 2_499_00,
            description: 'Annual design subscription',
            customer: { email: 'ananya.rao@example.com', phone: '+919876543210' },
            expiresAt: new Date(t + 7 * day).toISOString(),
          },
          t - 2 * hour,
        ),
        {
          ...newLink(
            {
              amountPaise: 15_000_00,
              description: 'Website development – milestone 1',
              customer: { email: 'vikram@example.com' },
              expiresAt: null,
            },
            t - 3 * day,
          ),
          status: 'paid',
          paidAt: new Date(t - 2 * day).toISOString(),
        },
        newLink(
          {
            amountPaise: 799_50,
            description: 'Yoga class – March batch',
            customer: { phone: '9123456780' },
            expiresAt: new Date(t - day).toISOString(),
          },
          t - 10 * day,
        ),
        newLink(
          {
            amountPaise: 350_00,
            description: 'Cake order #1042',
            customer: { phone: '+919820011223' },
            // Expires shortly so the automatic Active -> Expired transition is visible.
            expiresAt: new Date(t + 2 * 60 * 1000).toISOString(),
          },
          t - 5 * 60 * 1000,
        ),
      ]
      links = [...links, ...samples].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return respond(links)
    },
  }
}

/** App-wide instance: in-memory, with a small delay so loading states are visible. */
export const paymentLinksApi = createInMemoryPaymentLinksApi({ latencyMs: 400 })
