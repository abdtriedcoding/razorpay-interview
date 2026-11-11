import { type ChangeEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { formatAmount } from '../domain/format'
import { suggestedPaymentPaise, validatePaymentInput } from '../domain/payment'
import { type PaymentLink, getAmountDue } from '../domain/paymentLink'
import { FormField } from './FormField'
import { inputClass, paiseToInputValue } from './formUtils'

interface RecordPaymentFormProps {
  id: string
  link: PaymentLink
  /** Resolves once the payment is saved; rejects with a user-facing message. */
  onSave: (amountPaise: number) => Promise<void>
  onCancel: () => void
}

function paymentHint(link: PaymentLink): string {
  const due = `Amount due: ${formatAmount(getAmountDue(link))}`
  if (!link.allowPartial) return `${due} · Full amount required`
  if (link.payments.length === 0 && link.minFirstPaymentPaise !== null) {
    return `${due} · First payment at least ${formatAmount(link.minFirstPaymentPaise)}`
  }
  return due
}

export function RecordPaymentForm({ id, link, onSave, onCancel }: RecordPaymentFormProps) {
  const inputId = `${link.id}-payment-amount`
  const inputRef = useRef<HTMLInputElement>(null)
  const [raw, setRaw] = useState(() => paiseToInputValue(suggestedPaymentPaise(link)))
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setRaw(value)
    setSaveError(null)
    // After a failed attempt, re-validate as the user corrects the value.
    if (attempted) setError(validatePaymentInput(link, value, Date.now()).error)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaveError(null)
    const result = validatePaymentInput(link, raw, Date.now())
    if (result.error !== undefined) {
      setAttempted(true)
      setError(result.error)
      inputRef.current?.focus()
      return
    }
    setError(undefined)
    setSaving(true)
    try {
      await onSave(result.amountPaise)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not record the payment. Try again.')
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <form
      id={id}
      noValidate
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      aria-label={`Record payment for ${link.description}`}
      className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4"
    >
      <FormField id={inputId} label="Payment amount (₹)" required error={error} hint={paymentHint(link)}>
        {(aria) => (
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
              ₹
            </span>
            <input
              {...aria}
              ref={inputRef}
              name="paymentAmount"
              value={raw}
              onChange={handleChange}
              readOnly={saving}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              placeholder="0.00"
              className={`${inputClass} pl-7`}
            />
          </div>
        )}
      </FormField>

      {saveError && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save payment'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
