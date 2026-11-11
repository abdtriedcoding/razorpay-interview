import { type PaymentLinksApi, paymentLinksApi } from './api/paymentLinksApi'
import { CreateLinkForm } from './components/CreateLinkForm'
import { LinksDashboard } from './components/LinksDashboard'
import { useNow } from './hooks/useNow'
import { usePaymentLinks } from './hooks/usePaymentLinks'

interface AppProps {
  /** Injectable for tests; defaults to the in-memory mock backend. */
  api?: PaymentLinksApi
}

function App({ api = paymentLinksApi }: AppProps) {
  const now = useNow()
  const { links, loadState, retry, createLink, recordPayment, loadSampleLinks } = usePaymentLinks(api)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#links-heading"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-700 focus:shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Skip to payment links
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            ₹
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight">Payment Links</h1>
            <p className="text-xs text-slate-500">Create and track links to collect payments</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:py-8">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:sticky lg:top-6">
          <CreateLinkForm now={now} onCreate={createLink} />
        </div>
        <LinksDashboard
          links={links}
          loadState={loadState}
          now={now}
          onRetry={retry}
          onRecordPayment={recordPayment}
          onLoadSamples={loadSampleLinks}
        />
      </main>
    </div>
  )
}

export default App
