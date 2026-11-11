import { useEffect, useRef, useState } from 'react'
import { formatAmount, formatDateTime } from '../domain/format'
import {
  type PaymentLink,
  canRecordPayment,
  getAmountDue,
  getAmountPaid,
  getLinkStatus,
  getPaidAt,
} from '../domain/paymentLink'
import { RecordPaymentForm } from './RecordPaymentForm'
import { StatusBadge } from './StatusBadge'

interface LinkCardProps {
  link: PaymentLink
  now: number
  onRecordPayment: (id: string, amountPaise: number) => Promise<unknown>
  /** Called if the card disappears (e.g. filtered out) right after a payment, so focus is not lost. */
  onFocusLost?: () => void
}

const termClass = 'text-xs font-medium uppercase tracking-wide text-slate-500'

export function LinkCard({ link, now, onRecordPayment, onFocusLost }: LinkCardProps) {
  const status = getLinkStatus(link, now)
  const canRecord = canRecordPayment(link, now)
  const total = link.amountPaise
  const paid = getAmountPaid(link)
  const due = getAmountDue(link)
  const paidAt = status === 'paid' ? getPaidAt(link) : null
  const progress = total > 0 ? Math.min(100, (paid / total) * 100) : 0

  const [formOpen, setFormOpen] = useState(false)
  const headingId = `${link.id}-title`
  const formId = `${link.id}-payment-form`
  const recordButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Focus management after a successful save: the Record payment button may have
  // disappeared (link now Paid), or the whole card may have been filtered out.
  const savingRef = useRef(false)
  const restoreFocusRef = useRef(false)
  const onFocusLostRef = useRef(onFocusLost)
  useEffect(() => {
    onFocusLostRef.current = onFocusLost
  })
  useEffect(() => {
    if (!restoreFocusRef.current) return
    restoreFocusRef.current = false
    ;(recordButtonRef.current ?? headingRef.current)?.focus()
  })
  useEffect(
    () => () => {
      if (savingRef.current || restoreFocusRef.current) onFocusLostRef.current?.()
    },
    [],
  )

  async function handleSave(amountPaise: number) {
    savingRef.current = true
    try {
      await onRecordPayment(link.id, amountPaise)
    } finally {
      savingRef.current = false
    }
    restoreFocusRef.current = true
    setFormOpen(false)
  }

  function handleCancel() {
    setFormOpen(false)
    recordButtonRef.current?.focus()
  }

  const expiryLabel = status === 'expired' ? 'Expired' : 'Expires'

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 break-words text-sm font-medium text-slate-900 focus:outline-none sm:text-base"
        >
          {link.description}
        </h3>
        <StatusBadge status={status} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
        <div className="min-w-0">
          <dt className={termClass}>Total</dt>
          <dd className="text-sm font-semibold tabular-nums text-slate-900 sm:text-lg">{formatAmount(total)}</dd>
        </div>
        <div className="min-w-0">
          <dt className={termClass}>Paid</dt>
          <dd className={`text-sm font-semibold tabular-nums sm:text-lg ${paid > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
            {formatAmount(paid)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={termClass}>Due</dt>
          <dd className={`text-sm font-semibold tabular-nums sm:text-lg ${due > 0 ? 'text-slate-900' : 'text-slate-500'}`}>
            {formatAmount(due)}
          </dd>
        </div>
      </dl>
      <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {link.allowPartial && (
        <p className="mt-2 text-xs text-slate-500">
          Partial payments allowed
          {link.minFirstPaymentPaise !== null && ` · min first payment ${formatAmount(link.minFirstPaymentPaise)}`}
        </p>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className={termClass}>Customer</dt>
          {link.customer.email && <dd className="truncate text-slate-800" title={link.customer.email}>{link.customer.email}</dd>}
          {link.customer.phone && <dd className="text-slate-800">{link.customer.phone}</dd>}
        </div>
        <div>
          <dt className={termClass}>Created</dt>
          <dd className="text-slate-800">
            <time dateTime={link.createdAt}>{formatDateTime(link.createdAt)}</time>
          </dd>
        </div>
        <div>
          {paidAt ? (
            <>
              <dt className={termClass}>Paid</dt>
              <dd className="text-slate-800">
                <time dateTime={paidAt}>{formatDateTime(paidAt)}</time>
              </dd>
            </>
          ) : (
            <>
              <dt className={termClass}>{expiryLabel}</dt>
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
        {canRecord && (
          <button
            ref={recordButtonRef}
            type="button"
            onClick={() => (formOpen ? handleCancel() : setFormOpen(true))}
            aria-label={`Record payment: ${link.description}`}
            aria-expanded={formOpen}
            aria-controls={formOpen ? formId : undefined}
            className="shrink-0 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:self-auto"
          >
            Record payment
          </button>
        )}
      </div>
      {canRecord && formOpen && (
        <RecordPaymentForm id={formId} link={link} onSave={handleSave} onCancel={handleCancel} />
      )}
    </article>
  )
}
