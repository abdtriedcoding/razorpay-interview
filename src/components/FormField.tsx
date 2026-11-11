import type { ReactNode } from 'react'
import { describedBy } from './formUtils'

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1.5 text-sm text-red-600">
      {message}
    </p>
  )
}

interface FormFieldProps {
  id: string
  label: string
  required?: boolean
  hint?: ReactNode
  error?: string
  /** Render prop so the field can wire up aria attributes on its own input. */
  children: (aria: {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
  }) => ReactNode
}

export function FormField({ id, label, required, hint, error, children }: FormFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-600">
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy(hint !== undefined && hintId, error && errorId),
      })}
      {hint !== undefined && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  )
}
