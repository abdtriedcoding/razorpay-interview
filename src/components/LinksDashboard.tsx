import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import {
  type PaymentLink,
  STATUS_FILTERS,
  STATUS_LABELS,
  type StatusFilter,
  countByStatus,
  filterLinks,
} from '../domain/paymentLink'
import type { LoadState } from '../hooks/usePaymentLinks'
import { LinkCard } from './LinkCard'

interface LinksDashboardProps {
  links: PaymentLink[]
  loadState: LoadState
  now: number
  onRetry: () => void
  onRecordPayment: (id: string, amountPaise: number) => Promise<unknown>
  onLoadSamples: () => Promise<void>
}

const secondaryButton =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60'

export function LinksDashboard({
  links,
  loadState,
  now,
  onRetry,
  onRecordPayment,
  onLoadSamples,
}: LinksDashboardProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeading = useCallback(() => headingRef.current?.focus(), [])

  const counts = useMemo(() => countByStatus(links, now), [links, now])
  const visibleLinks = useMemo(
    () =>
      filterLinks(links, filter, now).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [links, filter, now],
  )

  return (
    <section aria-labelledby="links-heading" className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="links-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-slate-900 focus:outline-none">
          Payment links
        </h2>
        <div
          role="group"
          aria-label="Filter by status"
          className="-m-1 flex min-w-0 gap-1 overflow-x-auto p-1"
        >
          {STATUS_FILTERS.map((option) => {
            const selected = filter === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(option)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  selected
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {STATUS_LABELS[option]}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${selected ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}
                >
                  {loadState.status === 'ready' ? counts[option] : '–'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <DashboardBody
        loadState={loadState}
        hasAnyLinks={links.length > 0}
        visibleCount={visibleLinks.length}
        filter={filter}
        onShowAll={() => setFilter('all')}
        onRetry={onRetry}
        onLoadSamples={onLoadSamples}
      >
        <ul className="space-y-3" aria-label={`${STATUS_LABELS[filter]} payment links`}>
          {visibleLinks.map((link) => (
            <li key={link.id}>
              <LinkCard link={link} now={now} onRecordPayment={onRecordPayment} onFocusLost={focusHeading} />
            </li>
          ))}
        </ul>
      </DashboardBody>
    </section>
  )
}

interface DashboardBodyProps {
  loadState: LoadState
  hasAnyLinks: boolean
  visibleCount: number
  filter: StatusFilter
  onShowAll: () => void
  onRetry: () => void
  onLoadSamples: () => Promise<void>
  children: ReactNode
}

function DashboardBody({
  loadState,
  hasAnyLinks,
  visibleCount,
  filter,
  onShowAll,
  onRetry,
  onLoadSamples,
  children,
}: DashboardBodyProps) {
  if (loadState.status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        <span className="sr-only">Loading payment links…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" className="h-36 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    )
  }

  if (loadState.status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-800">Couldn’t load payment links</p>
        <p className="mt-1 text-sm text-red-700">{loadState.message}</p>
        <button type="button" onClick={onRetry} className={`${secondaryButton} mt-4`}>
          Try again
        </button>
      </div>
    )
  }

  if (!hasAnyLinks) {
    return (
      <EmptyState
        title="No payment links yet"
        body="Create your first payment link using the form. It will show up here."
      >
        <SampleDataButton onLoadSamples={onLoadSamples} />
      </EmptyState>
    )
  }

  if (visibleCount === 0) {
    return (
      <EmptyState
        title={`No ${STATUS_LABELS[filter].toLowerCase()} links`}
        body="Try a different status filter."
      >
        <button type="button" onClick={onShowAll} className={secondaryButton}>
          Show all links
        </button>
      </EmptyState>
    )
  }

  return <>{children}</>
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto size-10 text-slate-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
      <p className="mt-3 font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

function SampleDataButton({ onLoadSamples }: { onLoadSamples: () => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      await onLoadSamples()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sample links')
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={loading} className={secondaryButton}>
        {loading ? 'Loading…' : 'Load sample links'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </>
  )
}
