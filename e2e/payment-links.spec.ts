import { type Locator, type Page, expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Kolkata' })

type StatusLabel = 'All' | 'Active' | 'Partially Paid' | 'Paid' | 'Expired'

const createForm = (page: Page) => page.getByRole('form', { name: 'Create payment link' })
const filters = (page: Page) => page.getByRole('group', { name: 'Filter by status' })
const filter = (page: Page, label: StatusLabel) =>
  filters(page).getByRole('button', { name: new RegExp(`^${label}\\s*\\d*$`) })
const linkList = (page: Page) => page.getByRole('list', { name: /payment links/i })
const cards = (page: Page) => linkList(page).getByRole('article')
const card = (page: Page, description: string) => page.getByRole('article', { name: description })

/** The status badge sits right after the card heading. */
const statusBadge = (link: Locator) => link.locator('h3 + span')
/** Value of a balance term on a card: "Total", "Paid" or "Due". */
const balance = (link: Locator, term: 'Total' | 'Paid' | 'Due') =>
  link.locator(`dt:text-is("${term}") + dd`).first()
const recordButton = (link: Locator) => link.getByRole('button', { name: /^Record payment/ })

async function createLink(
  page: Page,
  link: {
    amount: string
    description: string
    email?: string
    phone?: string
    expiresAt?: string
    minFirstPayment?: string
  },
) {
  const form = createForm(page)
  await form.getByLabel('Amount').fill(link.amount)
  if (link.minFirstPayment !== undefined) {
    await form.getByLabel('Allow partial payments').check()
    await form.getByLabel('Minimum first payment (₹)').fill(link.minFirstPayment)
  }
  await form.getByLabel('Description').fill(link.description)
  if (link.email) await form.getByLabel('Email').fill(link.email)
  if (link.phone) await form.getByLabel('Phone').fill(link.phone)
  if (link.expiresAt) await form.getByLabel('Expiry date').fill(link.expiresAt)
  await form.getByRole('button', { name: 'Create payment link' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Payment link created' })).toBeVisible()
  await expect(card(page, link.description)).toBeVisible()
}

/** Opens the inline form on a card, enters an amount and submits it. */
async function submitPayment(link: Locator, amount: string) {
  if ((await link.getByRole('form').count()) === 0) await recordButton(link).click()
  await link.getByLabel('Payment amount (₹)').fill(amount)
  await link.getByRole('button', { name: 'Save payment' }).click()
}

async function recordPayment(link: Locator, amount: string) {
  await submitPayment(link, amount)
  await expect(link.getByRole('form')).toHaveCount(0)
}

async function expectBalances(link: Locator, b: { total?: string; paid: string; due: string }) {
  if (b.total) await expect(balance(link, 'Total')).toHaveText(b.total)
  await expect(balance(link, 'Paid')).toHaveText(b.paid)
  await expect(balance(link, 'Due')).toHaveText(b.due)
}

async function expectCounts(page: Page, counts: Record<StatusLabel, number>) {
  for (const [label, count] of Object.entries(counts)) {
    await expect(filter(page, label as StatusLabel)).toHaveAccessibleName(
      new RegExp(`^${label}\\s*${count}$`),
    )
  }
}

test('create links, then filter them by status', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('No payment links yet')).toBeVisible()

  // An invalid submit surfaces errors and creates nothing.
  await createForm(page).getByRole('button', { name: 'Create payment link' }).click()
  await expect(page.getByText('Amount is required')).toBeVisible()
  await expect(createForm(page).getByLabel('Amount')).toBeFocused()

  await createLink(page, {
    amount: '2,500',
    description: 'Photography workshop',
    email: 'meera@example.com',
  })
  await createLink(page, {
    amount: '799.50',
    description: 'Monthly tiffin plan',
    phone: '+91 98765 43210',
  })

  const workshop = card(page, 'Photography workshop')
  const tiffin = card(page, 'Monthly tiffin plan')
  await expect(balance(workshop, 'Total')).toHaveText('₹2,500.00')
  await expect(workshop).toContainText('meera@example.com')
  await expect(balance(tiffin, 'Total')).toHaveText('₹799.50')
  await expect(cards(page)).toHaveCount(2)

  // The customer pays the tiffin link in full (the form is prefilled with the amount due).
  await recordButton(tiffin).click()
  await expect(tiffin.getByLabel('Payment amount (₹)')).toHaveValue('799.50')
  await tiffin.getByRole('button', { name: 'Save payment' }).click()
  await expect(statusBadge(tiffin)).toHaveText('Paid')
  await expect(recordButton(tiffin)).toHaveCount(0)

  await filter(page, 'Active').click()
  await expect(cards(page)).toHaveCount(1)
  await expect(workshop).toBeVisible()
  await expect(tiffin).toBeHidden()

  await filter(page, 'Paid').click()
  await expect(cards(page)).toHaveCount(1)
  await expect(tiffin).toBeVisible()

  await filter(page, 'Expired').click()
  await expect(page.getByText('No expired links')).toBeVisible()

  await filter(page, 'All').click()
  await expect(cards(page)).toHaveCount(2)
})

test('an active link is automatically marked expired when its expiry passes', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-06-15T10:00:00+05:30') })
  await page.goto('/')
  await expect(page.getByText('No payment links yet')).toBeVisible()

  await createLink(page, {
    amount: '100',
    description: 'Flash sale voucher',
    email: 'shopper@example.com',
    expiresAt: '2026-06-15T10:05',
  })
  const voucher = card(page, 'Flash sale voucher')
  await expect(statusBadge(voucher)).toHaveText('Active')

  await page.clock.fastForward('06:00')

  await expect(statusBadge(voucher)).toHaveText('Expired')
  await expect(recordButton(voucher)).toHaveCount(0)
  await filter(page, 'Expired').click()
  await expect(cards(page)).toHaveCount(1)
})

test('records partial payments against the minimum and the amount due until the link is paid', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('No payment links yet')).toBeVisible()

  await createLink(page, {
    amount: '1,000',
    minFirstPayment: '300',
    description: 'Wedding photography deposit',
    email: 'ravi@example.com',
  })
  await createLink(page, {
    amount: '500',
    description: 'Guitar lesson',
    phone: '9876543210',
  })

  const deposit = card(page, 'Wedding photography deposit')
  const lesson = card(page, 'Guitar lesson')
  await expect(deposit).toContainText('Partial payments allowed · min first payment ₹300.00')
  await expect(statusBadge(deposit)).toHaveText('Active')
  await expectBalances(deposit, { total: '₹1,000.00', paid: '₹0.00', due: '₹1,000.00' })

  // The form opens prefilled with the minimum first payment.
  await recordButton(deposit).click()
  await expect(deposit.getByLabel('Payment amount (₹)')).toHaveValue('300')
  await expect(deposit.getByLabel('Payment amount (₹)')).toBeFocused()

  // Below the minimum first payment: inline error, nothing recorded.
  await submitPayment(deposit, '250')
  await expect(deposit.getByText('First payment must be at least ₹300.00')).toBeVisible()
  await expect(deposit.getByLabel('Payment amount (₹)')).toHaveAttribute('aria-invalid', 'true')
  await expect(statusBadge(deposit)).toHaveText('Active')
  await expectBalances(deposit, { paid: '₹0.00', due: '₹1,000.00' })

  // A valid first instalment.
  await recordPayment(deposit, '400')
  await expect(statusBadge(deposit)).toHaveText('Partially Paid')
  await expectBalances(deposit, { total: '₹1,000.00', paid: '₹400.00', due: '₹600.00' })

  // More than the amount due is rejected.
  await submitPayment(deposit, '700')
  await expect(deposit.getByText('Payment cannot exceed the amount due of ₹600.00')).toBeVisible()
  await expectBalances(deposit, { paid: '₹400.00', due: '₹600.00' })

  // Settling the balance marks the link Paid and removes the action.
  await recordPayment(deposit, '600')
  await expect(statusBadge(deposit)).toHaveText('Paid')
  await expectBalances(deposit, { total: '₹1,000.00', paid: '₹1,000.00', due: '₹0.00' })
  await expect(recordButton(deposit)).toHaveCount(0)

  // Partial payments are off for the other link: it must be paid in full.
  await submitPayment(lesson, '200')
  await expect(lesson.getByText('Partial payments are not allowed. Pay the full ₹500.00')).toBeVisible()
  await expect(statusBadge(lesson)).toHaveText('Active')
  await lesson.getByRole('button', { name: 'Cancel' }).click()
  await expect(lesson.getByRole('form')).toHaveCount(0)
  await expect(recordButton(lesson)).toBeFocused()
  await expectBalances(lesson, { paid: '₹0.00', due: '₹500.00' })
})

/** Creates one link per status (Expired needs the clock to move past its expiry). */
async function createOneLinkPerStatus(page: Page) {
  await createLink(page, {
    amount: '2,000',
    description: 'Yoga retreat booking',
    email: 'asha@example.com',
    expiresAt: '2026-06-15T10:05',
  })
  await createLink(page, {
    amount: '1,000',
    minFirstPayment: '300',
    description: 'Wedding photography deposit',
    email: 'ravi@example.com',
  })
  await createLink(page, { amount: '500', description: 'Guitar lesson', phone: '9876543210' })
  await createLink(page, { amount: '1,500', description: 'Pottery workshop', phone: '9123456780' })

  await recordPayment(card(page, 'Wedding photography deposit'), '400')
  await recordPayment(card(page, 'Guitar lesson'), '500')
  await page.clock.fastForward('06:00')
  await expect(statusBadge(card(page, 'Yoga retreat booking'))).toHaveText('Expired')
}

test('filters by every status with matching cards and counts', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-06-15T10:00:00+05:30') })
  await page.goto('/')
  await expect(page.getByText('No payment links yet')).toBeVisible()
  await createOneLinkPerStatus(page)

  await expectCounts(page, { All: 4, Active: 1, 'Partially Paid': 1, Paid: 1, Expired: 1 })

  const expectFilter = async (label: StatusLabel, descriptions: string[]) => {
    await filter(page, label).click()
    await expect(filter(page, label)).toHaveAttribute('aria-pressed', 'true')
    await expect(linkList(page)).toHaveAccessibleName(`${label} payment links`)
    await expect(cards(page)).toHaveCount(descriptions.length)
    for (const d of descriptions) await expect(card(page, d)).toBeVisible()
  }

  await expectFilter('Active', ['Pottery workshop'])
  await expectFilter('Partially Paid', ['Wedding photography deposit'])
  await expect(statusBadge(card(page, 'Wedding photography deposit'))).toHaveText('Partially Paid')
  await expectFilter('Paid', ['Guitar lesson'])
  await expectFilter('Expired', ['Yoga retreat booking'])
  await expectFilter('All', [
    'Pottery workshop',
    'Guitar lesson',
    'Wedding photography deposit',
    'Yoga retreat booking',
  ])

  // Recording the rest of the balance moves the link from Partially Paid to Paid.
  await filter(page, 'Partially Paid').click()
  await recordPayment(card(page, 'Wedding photography deposit'), '600')
  await expect(page.getByText('No partially paid links')).toBeVisible()
  await expectCounts(page, { All: 4, Active: 1, 'Partially Paid': 0, Paid: 2, Expired: 1 })
})

test('links, payments and statuses survive a page reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('No payment links yet')).toBeVisible()

  await createLink(page, {
    amount: '1,000',
    minFirstPayment: '300',
    description: 'Wedding photography deposit',
    email: 'ravi@example.com',
  })
  await createLink(page, { amount: '500', description: 'Guitar lesson', phone: '9876543210' })
  await createLink(page, { amount: '1,500', description: 'Pottery workshop', phone: '9123456780' })
  await recordPayment(card(page, 'Wedding photography deposit'), '400')
  await recordPayment(card(page, 'Guitar lesson'), '500')

  const counts = { All: 3, Active: 1, 'Partially Paid': 1, Paid: 1, Expired: 0 }
  await expectCounts(page, counts)

  await page.reload()
  await expect(cards(page)).toHaveCount(3)
  await expectCounts(page, counts)

  const deposit = card(page, 'Wedding photography deposit')
  await expect(statusBadge(deposit)).toHaveText('Partially Paid')
  await expectBalances(deposit, { total: '₹1,000.00', paid: '₹400.00', due: '₹600.00' })
  await expect(deposit).toContainText('ravi@example.com')

  const lesson = card(page, 'Guitar lesson')
  await expect(statusBadge(lesson)).toHaveText('Paid')
  await expectBalances(lesson, { total: '₹500.00', paid: '₹500.00', due: '₹0.00' })
  await expect(recordButton(lesson)).toHaveCount(0)

  const pottery = card(page, 'Pottery workshop')
  await expect(statusBadge(pottery)).toHaveText('Active')
  await expectBalances(pottery, { total: '₹1,500.00', paid: '₹0.00', due: '₹1,500.00' })

  // Newest first, as before the reload.
  await expect(cards(page).getByRole('heading')).toHaveText([
    'Pottery workshop',
    'Guitar lesson',
    'Wedding photography deposit',
  ])

  // The restored link keeps its rules: the next payment can still settle it.
  await recordPayment(deposit, '600')
  await expect(statusBadge(deposit)).toHaveText('Paid')
})

test('a partially paid link expires, but a fully paid link never does', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-06-15T10:00:00+05:30') })
  await page.goto('/')
  await expect(page.getByText('No payment links yet')).toBeVisible()

  await createLink(page, {
    amount: '1,000',
    minFirstPayment: '300',
    description: 'Wedding photography deposit',
    email: 'ravi@example.com',
    expiresAt: '2026-06-15T10:05',
  })
  await createLink(page, {
    amount: '500',
    description: 'Guitar lesson',
    phone: '9876543210',
    expiresAt: '2026-06-15T10:05',
  })
  const deposit = card(page, 'Wedding photography deposit')
  const lesson = card(page, 'Guitar lesson')

  await recordPayment(deposit, '400')
  await recordPayment(lesson, '500')
  await expect(statusBadge(deposit)).toHaveText('Partially Paid')
  await expect(statusBadge(lesson)).toHaveText('Paid')

  await page.clock.fastForward('06:00')

  // Expired beats Partially Paid; the balance is kept but no more payments are accepted.
  await expect(statusBadge(deposit)).toHaveText('Expired')
  await expectBalances(deposit, { paid: '₹400.00', due: '₹600.00' })
  await expect(recordButton(deposit)).toHaveCount(0)

  // Paid beats Expired.
  await expect(statusBadge(lesson)).toHaveText('Paid')
  await expectCounts(page, { All: 2, Active: 0, 'Partially Paid': 0, Paid: 1, Expired: 1 })

  await filter(page, 'Expired').click()
  await expect(cards(page)).toHaveCount(1)
  await expect(deposit).toBeVisible()
})
