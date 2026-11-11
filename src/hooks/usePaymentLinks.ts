import { useCallback, useEffect, useState } from 'react'
import type { PaymentLinksApi } from '../api/paymentLinksApi'
import type { CreatePaymentLinkInput, PaymentLink } from '../domain/paymentLink'

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong'

export function usePaymentLinks(api: PaymentLinksApi) {
  const [links, setLinks] = useState<PaymentLink[]>([])
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.list().then(
      (result) => {
        if (cancelled) return
        setLinks(result)
        setLoadState({ status: 'ready' })
      },
      (error: unknown) => {
        if (cancelled) return
        setLoadState({ status: 'error', message: errorMessage(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  const retry = useCallback(() => {
    setLoadState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  // Mutations reject on failure so the calling component can show an inline error.
  const createLink = useCallback(
    async (input: CreatePaymentLinkInput) => {
      const link = await api.create(input)
      setLinks((prev) => [link, ...prev])
      return link
    },
    [api],
  )

  const markPaid = useCallback(
    async (id: string) => {
      const updated = await api.markPaid(id)
      setLinks((prev) => prev.map((l) => (l.id === id ? updated : l)))
    },
    [api],
  )

  const loadSampleLinks = useCallback(async () => {
    setLinks(await api.loadSampleLinks())
  }, [api])

  return { links, loadState, retry, createLink, markPaid, loadSampleLinks }
}
