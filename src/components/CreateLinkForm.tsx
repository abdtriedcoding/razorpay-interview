import { type ChangeEvent, type FormEvent, useState } from 'react'
import { toDateTimeLocalValue } from '../domain/format'
import { type CreatePaymentLinkInput, DESCRIPTION_MAX_LENGTH, type PaymentLink } from '../domain/paymentLink'
import {
  EMPTY_FORM_VALUES,
  type PaymentLinkFormField,
  type PaymentLinkFormValues,
  hasErrors,
  toCreateInput,
  validatePaymentLinkForm,
} from '../domain/validation'
import { FieldError, FormField } from './FormField'
import { describedBy, inputClass } from './formUtils'

const FIELD_IDS: Record<keyof PaymentLinkFormValues, string> = {
  amount: 'link-amount',
  description: 'link-description',
  email: 'link-email',
  phone: 'link-phone',
  expiresAt: 'link-expires-at',
  allowPartial: 'link-allow-partial',
  minFirstPayment: 'link-min-first-payment',
}
const CONTACT_ERROR_ID = 'link-contact-error'
const ALLOW_PARTIAL_HINT_ID = 'link-allow-partial-hint'

/** Form fields edited through a text input (everything except the checkbox). */
type TextField = {
  [K in keyof PaymentLinkFormValues]: PaymentLinkFormValues[K] extends string ? K : never
}[keyof PaymentLinkFormValues]

/** Order in which the first invalid field receives focus after a failed submit. */
const FOCUS_ORDER: [PaymentLinkFormField, string][] = [
  ['amount', FIELD_IDS.amount],
  ['minFirstPayment', FIELD_IDS.minFirstPayment],
  ['description', FIELD_IDS.description],
  ['contact', FIELD_IDS.email],
  ['email', FIELD_IDS.email],
  ['phone', FIELD_IDS.phone],
  ['expiresAt', FIELD_IDS.expiresAt],
]

interface CreateLinkFormProps {
  now: number
  onCreate: (input: CreatePaymentLinkInput) => Promise<PaymentLink>
}

export function CreateLinkForm({ now, onCreate }: CreateLinkFormProps) {
  const [values, setValues] = useState<PaymentLinkFormValues>(EMPTY_FORM_VALUES)
  const [touched, setTouched] = useState<Partial<Record<keyof PaymentLinkFormValues, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdLink, setCreatedLink] = useState<PaymentLink | null>(null)

  const errors = validatePaymentLinkForm(values, now)
  // Show errors once a field has been visited, or for everything after a submit attempt.
  const visibleError = (field: keyof PaymentLinkFormValues) =>
    submitAttempted || touched[field] ? errors[field] : undefined
  const contactError =
    submitAttempted || (touched.email && touched.phone) ? errors.contact : undefined

  const bind = (field: TextField) => ({
    name: field,
    value: values[field],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [field]: e.target.value })),
    onBlur: () => setTouched((prev) => ({ ...prev, [field]: true })),
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitAttempted(true)
    setSubmitError(null)
    setCreatedLink(null)

    const currentErrors = validatePaymentLinkForm(values, Date.now())
    if (hasErrors(currentErrors)) {
      const firstInvalid = FOCUS_ORDER.find(([field]) => currentErrors[field])
      if (firstInvalid) document.getElementById(firstInvalid[1])?.focus()
      return
    }

    setSubmitting(true)
    try {
      const link = await onCreate(toCreateInput(values))
      setValues(EMPTY_FORM_VALUES)
      setTouched({})
      setSubmitAttempted(false)
      setCreatedLink(link)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Could not create the payment link. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const descriptionLength = values.description.trim().length

  return (
    <form noValidate onSubmit={handleSubmit} aria-labelledby="create-link-heading" className="space-y-5">
      <h2 id="create-link-heading" className="text-lg font-semibold text-slate-900">
        Create payment link
      </h2>

      <FormField id={FIELD_IDS.amount} label="Amount (₹)" required error={visibleError('amount')} hint="Up to ₹5,00,000, max 2 decimal places">
        {(aria) => (
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
              ₹
            </span>
            <input
              {...aria}
              {...bind('amount')}
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

      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          <input
            id={FIELD_IDS.allowPartial}
            name="allowPartial"
            type="checkbox"
            checked={values.allowPartial}
            onChange={(e) => {
              const allowPartial = e.target.checked
              setValues((prev) => ({ ...prev, allowPartial }))
            }}
            aria-describedby={ALLOW_PARTIAL_HINT_ID}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-slate-300 accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          />
          <div>
            <label htmlFor={FIELD_IDS.allowPartial} className="block cursor-pointer text-sm font-medium text-slate-700">
              Allow partial payments
            </label>
            <p id={ALLOW_PARTIAL_HINT_ID} className="text-xs text-slate-500">
              Let the customer pay in instalments.
            </p>
          </div>
        </div>

        {values.allowPartial && (
          <div className="border-l-2 border-slate-200 pl-4">
            <FormField
              id={FIELD_IDS.minFirstPayment}
              label="Minimum first payment (₹)"
              required
              error={visibleError('minFirstPayment')}
              hint="Must be more than ₹0 and no more than the total"
            >
              {(aria) => (
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                    ₹
                  </span>
                  <input
                    {...aria}
                    {...bind('minFirstPayment')}
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
          </div>
        )}
      </div>

      <FormField
        id={FIELD_IDS.description}
        label="Description"
        required
        error={visibleError('description')}
        hint={
          <span className={descriptionLength > DESCRIPTION_MAX_LENGTH ? 'text-red-600' : undefined}>
            {descriptionLength}/{DESCRIPTION_MAX_LENGTH} characters
          </span>
        }
      >
        {(aria) => (
          <textarea
            {...aria}
            {...bind('description')}
            rows={2}
            required
            placeholder="What is this payment for?"
            className={`${inputClass} resize-y`}
          />
        )}
      </FormField>

      <fieldset aria-describedby={describedBy('customer-hint', contactError && CONTACT_ERROR_ID)} className="space-y-4">
        <legend className="text-sm font-medium text-slate-700">
          Customer
          <span aria-hidden="true" className="ml-0.5 text-red-600">
            *
          </span>
        </legend>
        <p id="customer-hint" className="-mt-2 text-xs text-slate-500">
          Provide an email, a phone number, or both.
        </p>
        <FieldError id={CONTACT_ERROR_ID} message={contactError} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <FormField id={FIELD_IDS.email} label="Email" error={visibleError('email')}>
            {(aria) => (
              <input
                {...aria}
                {...bind('email')}
                aria-invalid={aria['aria-invalid'] || Boolean(contactError)}
                type="email"
                autoComplete="email"
                placeholder="customer@example.com"
                className={inputClass}
              />
            )}
          </FormField>
          <FormField id={FIELD_IDS.phone} label="Phone" error={visibleError('phone')}>
            {(aria) => (
              <input
                {...aria}
                {...bind('phone')}
                aria-invalid={aria['aria-invalid'] || Boolean(contactError)}
                type="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                className={inputClass}
              />
            )}
          </FormField>
        </div>
      </fieldset>

      <FormField
        id={FIELD_IDS.expiresAt}
        label="Expiry date (optional)"
        error={visibleError('expiresAt')}
        hint="Leave empty for a link that never expires."
      >
        {(aria) => (
          <input
            {...aria}
            {...bind('expiresAt')}
            type="datetime-local"
            min={toDateTimeLocalValue(now)}
            className={inputClass}
          />
        )}
      </FormField>

      {submitError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Creating…' : 'Create payment link'}
      </button>

      <div role="status" aria-live="polite">
        {createdLink && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <p className="font-medium">Payment link created</p>
            <p className="mt-0.5 break-all font-mono text-xs">{createdLink.url}</p>
          </div>
        )}
      </div>
    </form>
  )
}
