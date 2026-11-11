import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { type PaymentLinksApi, createInMemoryPaymentLinksApi } from './api/paymentLinksApi'

function renderApp(api: PaymentLinksApi = createInMemoryPaymentLinksApi()) {
  const user = userEvent.setup()
  render(<App api={api} />)
  return { user }
}

const linkList = () => screen.getByRole('list', { name: /payment links/i })
const filterButton = (name: RegExp) =>
  within(screen.getByRole('group', { name: /filter by status/i })).getByRole('button', { name })

describe('Payment Links Manager', () => {
  it('shows a loading state, then an empty state when there are no links', async () => {
    renderApp()
    expect(screen.getByText(/loading payment links/i)).toBeInTheDocument()
    expect(await screen.findByText(/no payment links yet/i)).toBeInTheDocument()
  })

  it('shows validation errors and focuses the first invalid field on submit', async () => {
    const { user } = renderApp()
    await screen.findByText(/no payment links yet/i)

    await user.click(screen.getByRole('button', { name: /create payment link/i }))

    const amount = screen.getByLabelText(/amount/i)
    expect(amount).toHaveFocus()
    expect(amount).toHaveAccessibleDescription(/amount is required/i)
    expect(screen.getByLabelText(/description/i)).toHaveAccessibleDescription(
      /description is required/i,
    )
    expect(screen.getByText(/provide a customer email or phone number/i)).toBeInTheDocument()
    expect(screen.getByText(/no payment links yet/i)).toBeInTheDocument()
  })

  it('creates a link and lists it as Active', async () => {
    const { user } = renderApp()
    await screen.findByText(/no payment links yet/i)

    await user.type(screen.getByLabelText(/amount/i), '1499.99')
    await user.type(screen.getByLabelText(/description/i), 'Guitar lessons')
    await user.type(screen.getByLabelText(/phone/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /create payment link/i }))

    expect(await screen.findByText(/payment link created/i)).toBeInTheDocument()
    const card = within(linkList()).getByRole('article', { name: 'Guitar lessons' })
    expect(card).toHaveTextContent('₹1,499.99')
    expect(card).toHaveTextContent('9876543210')
    expect(card).toHaveTextContent('Active')
    expect(screen.getByLabelText(/amount/i)).toHaveValue('')
  })

  it('filters links by status and marks a link as paid', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: /load sample links/i }))
    await screen.findByRole('list', { name: /all payment links/i })

    await user.click(filterButton(/^expired/i))
    expect(within(linkList()).getAllByRole('article')).toHaveLength(1)
    expect(within(linkList()).getByRole('article')).toHaveTextContent('Expired')

    await user.click(filterButton(/^active/i))
    const active = within(linkList()).getAllByRole('article')
    expect(active).toHaveLength(2)

    await user.click(
      within(active[0]).getByRole('button', { name: /mark as paid/i }),
    )
    await user.click(filterButton(/^paid/i))
    expect(await within(linkList()).findAllByRole('article')).toHaveLength(2)
    expect(filterButton(/^active/i)).toHaveTextContent('1')
  })

  it('shows an empty state for a filter with no matching links', async () => {
    const { user } = renderApp()
    await screen.findByText(/no payment links yet/i)
    await user.type(screen.getByLabelText(/amount/i), '10')
    await user.type(screen.getByLabelText(/description/i), 'Tea')
    await user.type(screen.getByLabelText(/email/i), 'a@example.com')
    await user.click(screen.getByRole('button', { name: /create payment link/i }))
    await screen.findByText(/payment link created/i)

    await user.click(filterButton(/^paid/i))
    expect(screen.getByText(/no paid links/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show all links/i }))
    expect(filterButton(/^all/i)).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an error state when loading fails and recovers on retry', async () => {
    const api = createInMemoryPaymentLinksApi()
    const list = vi
      .spyOn(api, 'list')
      .mockRejectedValueOnce(new Error('Network unavailable'))
    const { user } = renderApp(api)

    expect(await screen.findByRole('alert')).toHaveTextContent(/network unavailable/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(/no payment links yet/i)).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })
})
