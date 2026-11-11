import { useState } from 'react'
import { formatAmount, formatDateTime } from '../domain/format'
import { type PaymentLink, getLinkStatus } from '../domain/paymentLink'
import { StatusBadge } from './StatusBadge'

interface LinkCardProps {
  link: PaymentLink
  now: number
  onMarkPaid: (id: string) => Promise<void>
}

export function LinkCard({ link, now, onMarkPaid }: LinkCardProps) {
  const status = getLinkStatus(link, now)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingId = `${link.id}-title`

  async function handleMarkPaid() {
    setPending(true)
    setError(null)
    try {
      await onMarkPaid(link.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the link')
      setPending(false)
    }
  }

  const expiryLabel = status === 'expired' ? 'Expired' : 'Expires'

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {formatAmount(link.amountPaise)}
          </p>
          <h3 id={headingId} className="mt-0.5 break-words text-sm text-slate-700">
            {link.description}
          </h3>
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</dt>
          {link.customer.email && <dd className="truncate text-slate-800" title={link.customer.email}>{link.customer.email}</dd>}
          {link.customer.phone && <dd className="text-slate-800">{link.customer.phone}</dd>}
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</dt>
          <dd className="text-slate-800">
            <time dateTime={link.createdAt}>{formatDateTime(link.createdAt)}</time>
          </dd>
        </div>
        <div>
          {status === 'paid' && link.paidAt ? (
            <>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Paid</dt>
              <dd className="text-slate-800">
                <time dateTime={link.paidAt}>{formatDateTime(link.paidAt)}</time>
              </dd>
            </>
          ) : (
            <>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{expiryLabel}</dt>
              <dd className="text-slate-800">
                {link.expiresAt ? <time dateTime={link.expiresAt}>{formatDateTime(link.expiresAt)}</time> : 'Never'}
              </dd>
            </>
          )}
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 truncate font-mono text-xs text-slate-500" title={link.url}>
          {link.url}
        </p>
        {status === 'active' && (
          <button
            type="button"
            onClick={handleMarkPaid}
            disabled={pending}
            aria-label={`Mark as paid: ${link.description}`}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {pending ? 'Updating…' : 'Mark as paid'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </article>
  )
}
