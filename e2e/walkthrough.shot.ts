import { type Page, expect, test } from '@playwright/test'

/**
 * End-to-end walkthrough in a real browser. Every step asserts behaviour before
 * capturing a screenshot into docs/screenshots/. Time is frozen with page.clock so
 * the timestamps in the screenshots are deterministic.
 */

const OUT = 'docs/screenshots'
const START = new Date('2026-06-15T10:00:00+05:30')

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-IN' })

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, animations: 'disabled' })

const filters = (page: Page) => page.getByRole('group', { name: 'Filter by status' })
const filter = (page: Page, name: string) =>
  filters(page).getByRole('button', { name: new RegExp(`^${name}`) })
const cards = (page: Page) => page.getByRole('list', { name: /payment links/i }).getByRole('article')
const card = (page: Page, description: string) => page.getByRole('article', { name: description })

async function fillForm(
  page: Page,
  v: { amount?: string; description?: string; email?: string; phone?: string; expiresAt?: string },
) {
  if (v.amount !== undefined) await page.getByLabel('Amount').fill(v.amount)
  if (v.description !== undefined) await page.getByLabel('Description').fill(v.description)
  if (v.email !== undefined) await page.getByLabel('Email').fill(v.email)
  if (v.phone !== undefined) await page.getByLabel('Phone').fill(v.phone)
  if (v.expiresAt !== undefined) await page.getByLabel('Expiry date').fill(v.expiresAt)
}

async function submit(page: Page) {
  await page.getByRole('button', { name: 'Create payment link' }).click()
}

async function createLink(page: Page, v: Parameters<typeof fillForm>[1]) {
  await fillForm(page, v)
  await submit(page)
  await expect(page.getByRole('status').filter({ hasText: 'Payment link created' })).toBeVisible()
}

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

  test('create, mark paid, expire and filter', async ({ page }) => {
    await page.clock.install({ time: START })
    await page.goto('/')

    await test.step('empty state', async () => {
      await expect(page.getByText('No payment links yet')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Load sample links' })).toBeVisible()
      await shot(page, '02-empty-state')
    })

    await test.step('required-field errors on empty submit', async () => {
      await submit(page)
      await expect(page.getByLabel('Amount')).toBeFocused()
      await expect(page.getByText('Amount is required')).toBeVisible()
      await expect(page.getByText('Description is required')).toBeVisible()
      await expect(page.getByText('Provide a customer email or phone number')).toBeVisible()
      await expect(page.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true')
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

    await test.step('valid form creates an Active link', async () => {
      await fillForm(page, {
        amount: '2,500',
        description: 'Photography workshop – weekend batch',
        email: 'meera@example.com',
        phone: '+91 98765 43210',
        expiresAt: '',
      })
      await shot(page, '05-valid-form')
      await submit(page)
      await expect(page.getByText('Payment link created')).toBeVisible()
      const workshop = card(page, 'Photography workshop – weekend batch')
      await expect(workshop).toContainText('₹2,500.00')
      await expect(workshop).toContainText('meera@example.com')
      await expect(workshop).toContainText('+919876543210')
      await expect(workshop).toContainText('Active')
      await expect(workshop).toContainText('15 Jun 2026')
      await expect(workshop).toContainText('Never')
      await expect(page.getByLabel('Amount')).toHaveValue('')
      await shot(page, '06-link-created')
    })

    await test.step('create more links, one expiring in 5 minutes', async () => {
      await createLink(page, {
        amount: '799.50',
        description: 'Monthly tiffin plan',
        phone: '9123456780',
      })
      await createLink(page, {
        amount: '149',
        description: 'Flash sale voucher',
        email: 'shopper@example.com',
        expiresAt: '2026-06-15T10:05',
      })
      await expect(cards(page)).toHaveCount(3)
      await expect(filter(page, 'Active')).toContainText('3')
    })

    await test.step('filter with no matches shows an empty state', async () => {
      await filter(page, 'Paid').click()
      await expect(page.getByText('No paid links')).toBeVisible()
      await shot(page, '07-filter-empty')
      await page.getByRole('button', { name: 'Show all links' }).click()
      await expect(filter(page, 'All')).toHaveAttribute('aria-pressed', 'true')
    })

    await test.step('mark a link as paid', async () => {
      const tiffin = card(page, 'Monthly tiffin plan')
      await tiffin.getByRole('button', { name: /Mark as paid/ }).click()
      await expect(tiffin).toContainText('Paid')
      await expect(tiffin.getByRole('button', { name: /Mark as paid/ })).toHaveCount(0)
    })

    await test.step('link auto-expires when its expiry passes', async () => {
      const voucher = card(page, 'Flash sale voucher')
      await expect(voucher).toContainText('Active')
      await page.clock.fastForward('06:00')
      await expect(voucher).toContainText('Expired')
      await expect(voucher.getByRole('button', { name: /Mark as paid/ })).toHaveCount(0)
      await expect(filter(page, 'Active')).toContainText('1')
      await expect(filter(page, 'Paid')).toContainText('1')
      await expect(filter(page, 'Expired')).toContainText('1')
      await shot(page, '08-all-statuses')
    })

    await test.step('filter: Active', async () => {
      await filter(page, 'Active').click()
      await expect(filter(page, 'Active')).toHaveAttribute('aria-pressed', 'true')
      await expect(cards(page)).toHaveCount(1)
      await expect(card(page, 'Photography workshop – weekend batch')).toBeVisible()
      await shot(page, '09-filter-active')
    })

    await test.step('filter: Paid', async () => {
      await filter(page, 'Paid').click()
      await expect(cards(page)).toHaveCount(1)
      await expect(card(page, 'Monthly tiffin plan')).toBeVisible()
      await shot(page, '10-filter-paid')
    })

    await test.step('filter: Expired', async () => {
      await filter(page, 'Expired').click()
      await expect(cards(page)).toHaveCount(1)
      await expect(card(page, 'Flash sale voucher')).toBeVisible()
      await shot(page, '11-filter-expired')
    })

    await test.step('keyboard: skip link and filter operable by keyboard', async () => {
      // Clicking the page title sets the focus-navigation start point; the skip link
      // is the only focusable element before it.
      await page.getByRole('heading', { name: 'Payment Links', level: 1 }).click()
      await page.keyboard.press('Shift+Tab')
      const skip = page.getByRole('link', { name: 'Skip to payment links' })
      await expect(skip).toBeFocused()
      await expect(skip).toBeVisible()
      await shot(page, '12-keyboard-skip-link')

      await filter(page, 'All').focus()
      await page.keyboard.press('Tab') // move focus by keyboard to "Active"
      await expect(filter(page, 'Active')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(filter(page, 'Active')).toHaveAttribute('aria-pressed', 'true')
      await expect(cards(page)).toHaveCount(1)
      await shot(page, '13-keyboard-filter')
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
    await shot(page, '14-mobile-form-errors')

    await page.getByRole('button', { name: 'Load sample links' }).click()
    await expect(cards(page)).toHaveCount(4)
    await expect(filter(page, 'Active')).toContainText('2')
    await expect(filter(page, 'Paid')).toContainText('1')
    await expect(filter(page, 'Expired')).toContainText('1')

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, 'page should not scroll horizontally on a phone').toBe(false)

    await page
      .getByRole('heading', { name: 'Payment links', level: 2 })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: `${OUT}/15-mobile-dashboard.png`, animations: 'disabled' })
    await shot(page, '16-mobile-full-page')
  })
})
