import { type Locator, type Page, expect, test } from '@playwright/test'

/**
 * End-to-end walkthrough in a real browser. Every step asserts behaviour before
 * capturing a screenshot into docs/screenshots/. Time is frozen with page.clock so
 * the timestamps in the screenshots are deterministic.
 */

const OUT = 'docs/screenshots'
const START = new Date('2026-06-15T10:00:00+05:30')

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' })

type StatusLabel = 'All' | 'Active' | 'Partially Paid' | 'Paid' | 'Expired'

async function shot(page: Page, name: string) {
  // Full-page captures render the sticky create form where the viewport currently is,
  // so always capture from the top.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, animations: 'disabled' })
}
const viewportShot = (page: Page, name: string) =>
  page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' })

const createForm = (page: Page) => page.getByRole('form', { name: 'Create payment link' })
const filters = (page: Page) => page.getByRole('group', { name: 'Filter by status' })
const filter = (page: Page, label: StatusLabel) =>
  filters(page).getByRole('button', { name: new RegExp(`^${label}\\s*[\\d–]*$`) })
const cards = (page: Page) => page.getByRole('list', { name: /payment links/i }).getByRole('article')
const card = (page: Page, description: string) => page.getByRole('article', { name: description })
/** The status badge sits right after the card heading. */
const statusBadge = (link: Locator) => link.locator('h3 + span')
const balance = (link: Locator, term: 'Total' | 'Paid' | 'Due') =>
  link.locator(`dt:text-is("${term}") + dd`).first()
const recordButton = (link: Locator) => link.getByRole('button', { name: /^Record payment/ })
const paymentInput = (link: Locator) => link.getByLabel('Payment amount (₹)')

async function expectCounts(page: Page, counts: Record<StatusLabel, number>) {
  for (const [label, count] of Object.entries(counts)) {
    await expect(filter(page, label as StatusLabel)).toHaveAccessibleName(
      new RegExp(`^${label}\\s*${count}$`),
    )
  }
}

async function expectBalances(link: Locator, b: { total: string; paid: string; due: string }) {
  await expect(balance(link, 'Total')).toHaveText(b.total)
  await expect(balance(link, 'Paid')).toHaveText(b.paid)
  await expect(balance(link, 'Due')).toHaveText(b.due)
}

async function fillForm(
  page: Page,
  v: {
    amount?: string
    minFirstPayment?: string
    description?: string
    email?: string
    phone?: string
    expiresAt?: string
  },
) {
  const form = createForm(page)
  if (v.amount !== undefined) await form.getByLabel('Amount').fill(v.amount)
  if (v.minFirstPayment !== undefined) {
    await form.getByLabel('Allow partial payments').check()
    await form.getByLabel('Minimum first payment (₹)').fill(v.minFirstPayment)
  }
  if (v.description !== undefined) await form.getByLabel('Description').fill(v.description)
  if (v.email !== undefined) await form.getByLabel('Email').fill(v.email)
  if (v.phone !== undefined) await form.getByLabel('Phone').fill(v.phone)
  if (v.expiresAt !== undefined) await form.getByLabel('Expiry date').fill(v.expiresAt)
}

async function submit(page: Page) {
  await createForm(page).getByRole('button', { name: 'Create payment link' }).click()
}

async function createLink(page: Page, v: Parameters<typeof fillForm>[1]) {
  await fillForm(page, v)
  await submit(page)
  await expect(page.getByRole('status').filter({ hasText: 'Payment link created' })).toBeVisible()
}

async function savePayment(link: Locator, amount: string) {
  if ((await link.getByRole('form').count()) === 0) await recordButton(link).click()
  await paymentInput(link).fill(amount)
  await link.getByRole('button', { name: 'Save payment' }).click()
}

async function recordPayment(link: Locator, amount: string) {
  await savePayment(link, amount)
  await expect(link.getByRole('form')).toHaveCount(0)
}

const WORKSHOP = 'Photography workshop – weekend batch'
const TIFFIN = 'Monthly tiffin plan'
const VOUCHER = 'Flash sale voucher'
const WEBSITE = 'Website redesign – milestone 1'

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test('loading state', async ({ page }) => {
    // Freeze time before the app boots so the mock API's latency never elapses.
    await page.clock.install({ time: new Date(START.getTime() - 1000) })
    await page.clock.pauseAt(START)
    await page.goto('/')
    await expect(page.getByText('Loading payment links…')).toBeAttached()
    await expect(filter(page, 'All')).toContainText('–')
    await shot(page, '01-loading-state')

    await page.clock.runFor(500)
    await expect(page.getByText('No payment links yet')).toBeVisible()
  })

  test('create, record payments, expire, filter and reload', async ({ page }) => {
    await page.clock.install({ time: START })
    await page.goto('/')

    await test.step('empty state', async () => {
      await expect(page.getByText('No payment links yet')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Load sample links' })).toBeVisible()
      await shot(page, '02-empty-state')
    })

    await test.step('required-field errors on empty submit', async () => {
      await submit(page)
      await expect(createForm(page).getByLabel('Amount')).toBeFocused()
      await expect(page.getByText('Amount is required')).toBeVisible()
      await expect(page.getByText('Description is required')).toBeVisible()
      await expect(page.getByText('Provide a customer email or phone number')).toBeVisible()
      await expect(createForm(page).getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true')
      await shot(page, '03-required-errors')
    })

    await test.step('format errors', async () => {
      await fillForm(page, {
        amount: '10.999',
        description: 'x'.repeat(101),
        email: 'priya@',
        phone: '12345',
        expiresAt: '2026-06-15T09:00',
      })
      await submit(page)
      await expect(page.getByText('Amount can have at most 2 decimal places')).toBeVisible()
      await expect(page.getByText('Description must be 100 characters or fewer')).toBeVisible()
      await expect(page.getByText(/Enter a valid email address/)).toBeVisible()
      await expect(page.getByText(/Enter a valid 10-digit mobile number/)).toBeVisible()
      await expect(page.getByText('Expiry must be in the future')).toBeVisible()
      await expect(cards(page)).toHaveCount(0)
      await shot(page, '04-format-errors')

      await fillForm(page, { amount: '600000' })
      await expect(page.getByText('Amount cannot exceed ₹5,00,000')).toBeVisible()
      await fillForm(page, { amount: '0' })
      await expect(page.getByText('Amount must be greater than ₹0')).toBeVisible()
    })

    await test.step('partial payments: minimum first payment above the total', async () => {
      const form = createForm(page)
      await expect(form.getByLabel('Minimum first payment (₹)')).toHaveCount(0)
      await fillForm(page, {
        amount: '2,500',
        minFirstPayment: '3,000',
        description: WORKSHOP,
        email: 'meera@example.com',
        phone: '+91 98765 43210',
        expiresAt: '',
      })
      await expect(form.getByLabel('Allow partial payments')).toBeChecked()
      await expect(
        page.getByText('Minimum first payment cannot exceed the total amount of ₹2,500.00'),
      ).toBeVisible()
      await expect(form.getByLabel('Minimum first payment (₹)')).toHaveAttribute('aria-invalid', 'true')
      await expect(form.getByText(/is required|Enter a valid|must be/)).toHaveCount(0)
      await form.getByLabel('Minimum first payment (₹)').focus()
      await shot(page, '05-partial-min-error')
    })

    await test.step('valid partial-payment form creates an Active link', async () => {
      const form = createForm(page)
      await form.getByLabel('Minimum first payment (₹)').fill('500')
      await expect(form.getByLabel('Minimum first payment (₹)')).toHaveAttribute('aria-invalid', 'false')
      await shot(page, '06-valid-form')
      await submit(page)
      await expect(page.getByText('Payment link created')).toBeVisible()
      const workshop = card(page, WORKSHOP)
      await expectBalances(workshop, { total: '₹2,500.00', paid: '₹0.00', due: '₹2,500.00' })
      await expect(workshop).toContainText('Partial payments allowed · min first payment ₹500.00')
      await expect(workshop).toContainText('meera@example.com')
      await expect(workshop).toContainText('+919876543210')
      await expect(statusBadge(workshop)).toHaveText('Active')
      await expect(workshop).toContainText('15 Jun 2026')
      await expect(workshop).toContainText('Never')
      await expect(form.getByLabel('Amount')).toHaveValue('')
      await expect(form.getByLabel('Allow partial payments')).not.toBeChecked()
      await shot(page, '07-link-created')
    })

    await test.step('create more links, one expiring in 5 minutes', async () => {
      await createLink(page, { amount: '799.50', description: TIFFIN, phone: '9123456780' })
      await createLink(page, {
        amount: '149',
        description: VOUCHER,
        email: 'shopper@example.com',
        expiresAt: '2026-06-15T10:05',
      })
      await createLink(page, {
        amount: '15,000',
        minFirstPayment: '5,000',
        description: WEBSITE,
        email: 'vikram@example.com',
      })
      await expect(cards(page)).toHaveCount(4)
      await expectCounts(page, { All: 4, Active: 4, 'Partially Paid': 0, Paid: 0, Expired: 0 })
    })

    await test.step('filter with no matches shows an empty state', async () => {
      await filter(page, 'Paid').click()
      await expect(page.getByText('No paid links')).toBeVisible()
      await shot(page, '08-filter-empty')
      await page.getByRole('button', { name: 'Show all links' }).click()
      await expect(filter(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    })

    await test.step('record payment form opens prefilled with the minimum', async () => {
      const website = card(page, WEBSITE)
      await recordButton(website).click()
      await expect(recordButton(website)).toHaveAttribute('aria-expanded', 'true')
      await expect(paymentInput(website)).toBeFocused()
      await expect(paymentInput(website)).toHaveValue('5000')
      await expect(website).toContainText('Amount due: ₹15,000.00 · First payment at least ₹5,000.00')
      await shot(page, '09-record-payment-form')
    })

    await test.step('payment below the minimum shows an inline error', async () => {
      const website = card(page, WEBSITE)
      await savePayment(website, '2,000')
      await expect(website.getByText('First payment must be at least ₹5,000.00')).toBeVisible()
      await expect(paymentInput(website)).toHaveAttribute('aria-invalid', 'true')
      await expect(statusBadge(website)).toHaveText('Active')
      await expectBalances(website, { total: '₹15,000.00', paid: '₹0.00', due: '₹15,000.00' })
      await shot(page, '10-payment-error')
    })

    await test.step('first instalment makes the link Partially Paid', async () => {
      const website = card(page, WEBSITE)
      await recordPayment(website, '6,000')
      await expect(statusBadge(website)).toHaveText('Partially Paid')
      await expectBalances(website, { total: '₹15,000.00', paid: '₹6,000.00', due: '₹9,000.00' })
      await expect(recordButton(website)).toBeVisible()
      // Paying more than the balance is rejected.
      await savePayment(website, '10,000')
      await expect(website.getByText('Payment cannot exceed the amount due of ₹9,000.00')).toBeVisible()
      await website.getByRole('button', { name: 'Cancel' }).click()
      await expect(website.getByRole('form')).toHaveCount(0)
      await expectCounts(page, { All: 4, Active: 3, 'Partially Paid': 1, Paid: 0, Expired: 0 })
      await shot(page, '11-partially-paid')
    })

    await test.step('full payment marks a link Paid', async () => {
      const tiffin = card(page, TIFFIN)
      await recordButton(tiffin).click()
      await expect(paymentInput(tiffin)).toHaveValue('799.50')
      await recordPayment(tiffin, '799.50')
      await expect(statusBadge(tiffin)).toHaveText('Paid')
      await expectBalances(tiffin, { total: '₹799.50', paid: '₹799.50', due: '₹0.00' })
      await expect(recordButton(tiffin)).toHaveCount(0)
    })

    await test.step('link auto-expires when its expiry passes', async () => {
      const voucher = card(page, VOUCHER)
      await expect(statusBadge(voucher)).toHaveText('Active')
      await page.clock.fastForward('06:00')
      await expect(statusBadge(voucher)).toHaveText('Expired')
      await expect(recordButton(voucher)).toHaveCount(0)
      await expect(statusBadge(card(page, WORKSHOP))).toHaveText('Active')
      await expect(statusBadge(card(page, WEBSITE))).toHaveText('Partially Paid')
      await expect(statusBadge(card(page, TIFFIN))).toHaveText('Paid')
      await expectCounts(page, { All: 4, Active: 1, 'Partially Paid': 1, Paid: 1, Expired: 1 })
      await shot(page, '12-all-statuses')
    })

    const filterSteps: [StatusLabel, string, string][] = [
      ['Active', WORKSHOP, '13-filter-active'],
      ['Partially Paid', WEBSITE, '14-filter-partially-paid'],
      ['Paid', TIFFIN, '15-filter-paid'],
      ['Expired', VOUCHER, '16-filter-expired'],
    ]
    for (const [label, description, name] of filterSteps) {
      await test.step(`filter: ${label}`, async () => {
        await filter(page, label).click()
        await expect(filter(page, label)).toHaveAttribute('aria-pressed', 'true')
        await expect(cards(page)).toHaveCount(1)
        await expect(card(page, description)).toBeVisible()
        await expect(statusBadge(card(page, description))).toHaveText(label)
        await shot(page, name)
      })
    }

    await test.step('links, payments and statuses survive a reload', async () => {
      await page.reload()
      await expect(cards(page)).toHaveCount(4)
      await expect(filter(page, 'All')).toHaveAttribute('aria-pressed', 'true')
      await expectCounts(page, { All: 4, Active: 1, 'Partially Paid': 1, Paid: 1, Expired: 1 })
      await expectBalances(card(page, WEBSITE), {
        total: '₹15,000.00',
        paid: '₹6,000.00',
        due: '₹9,000.00',
      })
      await expectBalances(card(page, TIFFIN), { total: '₹799.50', paid: '₹799.50', due: '₹0.00' })
      await expect(statusBadge(card(page, VOUCHER))).toHaveText('Expired')
      await shot(page, '17-after-reload')
    })

    await test.step('keyboard: skip link and filter operable by keyboard', async () => {
      // Clicking the page title sets the focus-navigation start point; the skip link
      // is the only focusable element before it.
      await page.getByRole('heading', { name: 'Payment Links', level: 1 }).click()
      await page.keyboard.press('Shift+Tab')
      const skip = page.getByRole('link', { name: 'Skip to payment links' })
      await expect(skip).toBeFocused()
      await expect(skip).toBeVisible()
      await shot(page, '18-keyboard-skip-link')

      await filter(page, 'All').focus()
      await page.keyboard.press('Tab') // move focus by keyboard to "Active"
      await page.keyboard.press('Tab') // ... and on to "Partially Paid"
      await expect(filter(page, 'Partially Paid')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(filter(page, 'Partially Paid')).toHaveAttribute('aria-pressed', 'true')
      await expect(cards(page)).toHaveCount(1)
      await shot(page, '19-keyboard-filter')
    })
  })
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('responsive layout', async ({ page }) => {
    await page.clock.install({ time: START })
    await page.goto('/')
    await expect(page.getByText('No payment links yet')).toBeVisible()

    await submit(page)
    await expect(page.getByText('Amount is required')).toBeVisible()
    await shot(page, '20-mobile-form-errors')

    await page.getByRole('button', { name: 'Load sample links' }).click()
    await expect(cards(page)).toHaveCount(5)
    await expectCounts(page, { All: 5, Active: 2, 'Partially Paid': 1, Paid: 1, Expired: 1 })

    const overflows = () =>
      page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(await overflows(), 'page should not scroll horizontally on a phone').toBe(false)

    const milestone = card(page, 'Website development – milestone 1')
    await expect(statusBadge(milestone)).toHaveText('Partially Paid')
    await expectBalances(milestone, { total: '₹15,000.00', paid: '₹6,000.00', due: '₹9,000.00' })

    await page
      .getByRole('heading', { name: 'Payment links', level: 2 })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await viewportShot(page, '21-mobile-dashboard')
    await shot(page, '22-mobile-full-page')

    await recordButton(milestone).click()
    await expect(paymentInput(milestone)).toHaveValue('9000')
    await expect(milestone).toContainText('Amount due: ₹9,000.00')
    expect(await overflows(), 'record payment form should fit on a phone').toBe(false)
    await milestone.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await viewportShot(page, '23-mobile-record-payment')
  })
})
