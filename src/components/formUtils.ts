export const inputClass =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/30'

export function describedBy(...ids: (string | false | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

/** 50000 -> "500", 25050 -> "250.50": a plain value for a rupee text input. */
export function paiseToInputValue(paise: number): string {
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`
}
