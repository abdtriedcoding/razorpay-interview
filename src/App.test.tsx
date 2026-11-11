import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { type PaymentLinksApi, createInMemoryPaymentLinksApi } from './api/paymentLinksApi'

function renderApp(api: PaymentLinksApi = createInMemoryPaymentLinksApi()) {
  const user = userEvent.setup()
  render(<App api={api} />)
  return { user }
}

type User = ReturnType<typeof userEvent.setup>

/** Fills and submits the create form; returns the new link's card. */
async function createLink(
  user: User,
  {
    amount,
    description,
    minFirstPayment,
  }: { amount: string; description: string; minFirstPayment?: string },
) {
  await user.type(screen.getByLabelText(/^amount/i), amount)
  if (minFirstPayment !== undefined) {
    await user.click(screen.getByRole('checkbox', { name: /allow partial payments/i }))
    await user.type(screen.getByLabelText(/minimum first payment/i), minFirstPayment)
  }
  await user.type(screen.getByLabelText(/description/i), description)
  await user.type(screen.getByLabelText(/email/i), 'customer@example.com')
  await user.click(screen.getByRole('button', { name: /create payment link/i }))
  await screen.findByText(/payment link created/i)
  return within(linkList()).getByRole('article', { name: description })
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

    const amount = screen.getByLabelText(/^amount/i)
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

    await user.type(screen.getByLabelText(/^amount/i), '1499.99')
    await user.type(screen.getByLabelText(/description/i), 'Guitar lessons')
    await user.type(screen.getByLabelText(/phone/i), '9876543210')
    await user.click(screen.getByRole('button', { name: /create payment link/i }))

    expect(await screen.findByText(/payment link created/i)).toBeInTheDocument()
    const card = within(linkList()).getByRole('article', { name: 'Guitar lessons' })
    expect(card).toHaveTextContent('₹1,499.99')
    expect(card).toHaveTextContent('9876543210')
    expect(card).toHaveTextContent('Active')
    expect(screen.getByLabelText(/^amount/i)).toHaveValue('')
  })

  it('filters links by status and records a full payment', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: /load sample links/i }))
    await screen.findByRole('list', { name: /all payment links/i })

    await user.click(filterButton(/^expired/i))
    expect(within(linkList()).getAllByRole('article')).toHaveLength(1)
    expect(within(linkList()).getByRole('article')).toHaveTextContent('Expired')
    expect(
      within(linkList()).queryByRole('button', { name: /record payment/i }),
    ).not.toBeInTheDocument()

    await user.click(filterButton(/^active/i))
    expect(within(linkList()).getAllByRole('article')).toHaveLength(2)
    const cake = within(linkList()).getByRole('article', { name: /cake order/i })

    // Partial payments are off for this link, so the full amount due is suggested.
    await user.click(within(cake).getByRole('button', { name: /record payment/i }))
    expect(within(cake).getByLabelText(/payment amount/i)).toHaveValue('350')
    await user.click(within(cake).getByRole('button', { name: /save payment/i }))

    // The card leaves the Active filter; focus moves to the list heading instead of being lost.
    await waitFor(() => expect(within(linkList()).getAllByRole('article')).toHaveLength(1))
    expect(screen.getByRole('heading', { level: 2, name: /^payment links$/i })).toHaveFocus()
    expect(filterButton(/^active/i)).toHaveTextContent('1')
    await user.click(filterButton(/^paid/i))
    expect(within(linkList()).getAllByRole('article')).toHaveLength(2)
  })

  it('shows counts for every status when sample links are loaded', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: /load sample links/i }))
    await screen.findByRole('list', { name: /all payment links/i })

    expect(filterButton(/^all/i)).toHaveTextContent('5')
    expect(filterButton(/^active/i)).toHaveTextContent('2')
    expect(filterButton(/^partially paid/i)).toHaveTextContent('1')
    expect(filterButton(/^paid/i)).toHaveTextContent('1')
    expect(filterButton(/^expired/i)).toHaveTextContent('1')

    await user.click(filterButton(/^partially paid/i))
    const card = within(linkList()).getByRole('article')
    expect(card).toHaveTextContent('Partially Paid')
    expect(card).toHaveTextContent(/Total\s*₹15,000\.00/)
    expect(card).toHaveTextContent(/Paid\s*₹6,000\.00/)
    expect(card).toHaveTextContent(/Due\s*₹9,000\.00/)
  })

  it('shows an empty state for a filter with no matching links', async () => {
    const { user } = renderApp()
    await screen.findByText(/no payment links yet/i)
    await user.type(screen.getByLabelText(/^amount/i), '10')
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

  describe('partial payments', () => {
    it('reveals the minimum first payment field and rejects a minimum above the total', async () => {
      const { user } = renderApp()
      await screen.findByText(/no payment links yet/i)

      const partial = screen.getByRole('checkbox', { name: /allow partial payments/i })
      expect(partial).not.toBeChecked()
      expect(screen.queryByLabelText(/minimum first payment/i)).not.toBeInTheDocument()

      await user.click(partial)
      const min = screen.getByLabelText(/minimum first payment/i)
      expect(min).toHaveAccessibleDescription(/more than ₹0 and no more than the total/i)

      await user.type(screen.getByLabelText(/^amount/i), '1000')
      await user.type(min, '1500')
      await user.type(screen.getByLabelText(/description/i), 'Tutoring package')
      await user.type(screen.getByLabelText(/email/i), 'customer@example.com')
      await user.click(screen.getByRole('button', { name: /create payment link/i }))

      expect(min).toHaveFocus()
      expect(min).toHaveAttribute('aria-invalid', 'true')
      expect(min).toHaveAccessibleDescription(
        /minimum first payment cannot exceed the total amount of ₹1,000\.00/i,
      )
      expect(screen.getByText(/no payment links yet/i)).toBeInTheDocument()

      // Unchecking hides the field and drops its validation.
      await user.click(partial)
      expect(screen.queryByLabelText(/minimum first payment/i)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /create payment link/i }))
      expect(await screen.findByText(/payment link created/i)).toBeInTheDocument()
      expect(partial).not.toBeChecked()
      expect(
        within(linkList()).getByRole('article', { name: 'Tutoring package' }),
      ).not.toHaveTextContent(/partial payments allowed/i)
    })

    it('records partial payments until the link is fully paid', async () => {
      const { user } = renderApp()
      await screen.findByText(/no payment links yet/i)
      const card = await createLink(user, {
        amount: '1000',
        description: 'Tutoring package',
        minFirstPayment: '300',
      })

      expect(screen.getByRole('checkbox', { name: /allow partial payments/i })).not.toBeChecked()
      expect(card).toHaveTextContent('Active')
      expect(card).toHaveTextContent(/partial payments allowed · min first payment ₹300\.00/i)
      expect(card).toHaveTextContent(/Paid\s*₹0\.00/)
      expect(card).toHaveTextContent(/Due\s*₹1,000\.00/)

      const recordButton = within(card).getByRole('button', {
        name: 'Record payment: Tutoring package',
      })
      await user.click(recordButton)
      const input = within(card).getByLabelText(/payment amount/i)
      expect(input).toHaveFocus()
      expect(input).toHaveValue('300')
      expect(input).toHaveAccessibleDescription(
        /amount due: ₹1,000\.00 · first payment at least ₹300\.00/i,
      )

      await user.clear(input)
      await user.type(input, '400')
      await user.click(within(card).getByRole('button', { name: /save payment/i }))

      expect(await within(card).findByText('Partially Paid')).toBeInTheDocument()
      expect(card).toHaveTextContent(/Paid\s*₹400\.00/)
      expect(card).toHaveTextContent(/Due\s*₹600\.00/)
      expect(within(card).queryByLabelText(/payment amount/i)).not.toBeInTheDocument()
      expect(recordButton).toHaveFocus()
      expect(filterButton(/^partially paid/i)).toHaveTextContent('1')
      expect(filterButton(/^active/i)).toHaveTextContent('0')

      // Once the first payment is in, the form suggests the remaining balance.
      await user.click(recordButton)
      expect(within(card).getByLabelText(/payment amount/i)).toHaveValue('600')
      await user.click(within(card).getByRole('button', { name: /save payment/i }))

      await waitFor(() => expect(card).toHaveTextContent(/Due\s*₹0\.00/))
      expect(card).not.toHaveTextContent('Partially Paid')
      expect(card).toHaveTextContent(/Paid\s*₹1,000\.00/)
      expect(within(card).queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
      expect(within(card).getByRole('heading', { name: 'Tutoring package' })).toHaveFocus()
      expect(filterButton(/^paid/i)).toHaveTextContent('1')
      expect(filterButton(/^partially paid/i)).toHaveTextContent('0')
    })

    it('rejects payments above the amount due or below the first-payment minimum', async () => {
      const api = createInMemoryPaymentLinksApi()
      const recordPayment = vi.spyOn(api, 'recordPayment')
      const { user } = renderApp(api)
      await screen.findByText(/no payment links yet/i)
      const card = await createLink(user, {
        amount: '1000',
        description: 'Tutoring package',
        minFirstPayment: '300',
      })

      await user.click(within(card).getByRole('button', { name: /record payment/i }))
      const input = within(card).getByLabelText(/payment amount/i)
      const save = within(card).getByRole('button', { name: /save payment/i })

      await user.clear(input)
      await user.type(input, '200')
      await user.click(save)
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAccessibleDescription(/first payment must be at least ₹300\.00/i)
      expect(input).toHaveFocus()

      await user.clear(input)
      await user.type(input, '1500')
      await user.click(save)
      expect(input).toHaveAccessibleDescription(
        /payment cannot exceed the amount due of ₹1,000\.00/i,
      )

      expect(recordPayment).not.toHaveBeenCalled()
      expect(card).toHaveTextContent('Active')
      expect(card).toHaveTextContent(/Paid\s*₹0\.00/)

      // Escape closes the form and returns focus to the button.
      await user.keyboard('{Escape}')
      expect(within(card).queryByLabelText(/payment amount/i)).not.toBeInTheDocument()
      expect(within(card).getByRole('button', { name: /record payment/i })).toHaveFocus()
    })

    it('requires the full amount when partial payments are off and shows API errors inline', async () => {
      const api = createInMemoryPaymentLinksApi()
      const { user } = renderApp(api)
      await screen.findByText(/no payment links yet/i)
      const card = await createLink(user, { amount: '500', description: 'Tea set' })
      expect(card).not.toHaveTextContent(/partial payments allowed/i)

      await user.click(within(card).getByRole('button', { name: /record payment/i }))
      const input = within(card).getByLabelText(/payment amount/i)
      expect(input).toHaveValue('500')
      expect(input).toHaveAccessibleDescription(/amount due: ₹500\.00 · full amount required/i)
      await user.clear(input)
      await user.type(input, '250')
      await user.click(within(card).getByRole('button', { name: /save payment/i }))
      expect(input).toHaveAccessibleDescription(/partial payments are not allowed/i)

      vi.spyOn(api, 'recordPayment').mockRejectedValueOnce(new Error('Gateway timeout'))
      await user.clear(input)
      await user.type(input, '500')
      expect(input).toHaveAttribute('aria-invalid', 'false')
      await user.click(within(card).getByRole('button', { name: /save payment/i }))
      expect(await within(card).findByRole('alert')).toHaveTextContent('Gateway timeout')
      expect(card).toHaveTextContent('Active')

      await user.click(within(card).getByRole('button', { name: /save payment/i }))
      await waitFor(() => expect(card).toHaveTextContent(/Due\s*₹0\.00/))
      expect(card).toHaveTextContent(/Paid\s*₹500\.00/)
    })
  })
})
