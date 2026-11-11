import { type LinkStatus, STATUS_LABELS } from '../domain/paymentLink'

const STYLES: Record<LinkStatus, string> = {
  active: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  partially_paid: 'bg-amber-50 text-amber-800 ring-amber-600/30',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  expired: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

const DOTS: Record<LinkStatus, string> = {
  active: 'bg-blue-500',
  partially_paid: 'bg-amber-500',
  paid: 'bg-emerald-500',
  expired: 'bg-slate-400',
}

export function StatusBadge({ status }: { status: LinkStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOTS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  )
}
