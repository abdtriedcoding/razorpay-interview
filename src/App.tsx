import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-4 text-slate-900">
      <h1 className="text-3xl font-bold tracking-tight">Vite + React + TypeScript</h1>
      <p className="text-slate-600">
        Styled with Tailwind CSS, tested with Vitest, React Testing Library and Playwright.
      </p>
      <button
        type="button"
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        onClick={() => setCount((c) => c + 1)}
      >
        Count is {count}
      </button>
    </main>
  )
}

export default App
