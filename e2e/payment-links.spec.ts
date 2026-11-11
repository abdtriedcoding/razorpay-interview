import { type Page, expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Kolkata' })

const filters = (page: Page) => page.getByRole('group', { name: 'Filter by status' })
const linkList = (page: Page) => page.getByRole('list', { name: /payment links/i })

async function createLink(
  page: Page,
  link: { amount: string; description: string; email?: string; phone?: string; expiresAt?: string },
) {
  await page.getByLabel('Amount').fill(link.amount)
  await page.getByLabel('Description').fill(link.description)
  if (link.email) await page.getByLabel('Email').fill(link.email)
  if (link.phone) await page.getByLabel('Phone').fill(link.phone)
  if (link.expiresAt) await page.getByLabel('Expiry date').fill(link.expiresAt)
  await page.getByRole('button', { name: 'Create payment link' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Payment link created' })).toBeVisible()
}

test('create links, then filter them by status', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('No payment links yet')).toBeVisible()

  // An invalid submit surfaces errors and creates nothing.
  await page.getByRole('button', { name: 'Create payment link' }).click()
  await expect(page.getByText('Amount is required')).toBeVisible()
  await expect(page.getByLabel('Amount')).toBeFocused()

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

  const workshop = page.getByRole('article', { name: 'Photography workshop' })
  const tiffin = page.getByRole('article', { name: 'Monthly tiffin plan' })
  await expect(workshop).toContainText('₹2,500.00')
  await expect(workshop).toContainText('meera@example.com')
  await expect(tiffin).toContainText('₹799.50')
  await expect(linkList(page).getByRole('article')).toHaveCount(2)

  // The customer pays the tiffin link.
  await tiffin.getByRole('button', { name: /mark as paid/i }).click()
  await expect(tiffin).toContainText('Paid')

  await filters(page).getByRole('button', { name: /^Active/ }).click()
  await expect(linkList(page).getByRole('article')).toHaveCount(1)
  await expect(workshop).toBeVisible()
  await expect(tiffin).toBeHidden()

  await filters(page).getByRole('button', { name: /^Paid/ }).click()
  await expect(linkList(page).getByRole('article')).toHaveCount(1)
  await expect(tiffin).toBeVisible()

  await filters(page).getByRole('button', { name: /^Expired/ }).click()
  await expect(page.getByText('No expired links')).toBeVisible()

  await filters(page).getByRole('button', { name: /^All/ }).click()
  await expect(linkList(page).getByRole('article')).toHaveCount(2)
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
  const voucher = page.getByRole('article', { name: 'Flash sale voucher' })
  await expect(voucher).toContainText('Active')

  await page.clock.fastForward('06:00')

  await expect(voucher).toContainText('Expired')
  await expect(voucher.getByRole('button', { name: /mark as paid/i })).toHaveCount(0)
  await filters(page).getByRole('button', { name: /^Expired/ }).click()
  await expect(linkList(page).getByRole('article')).toHaveCount(1)
})
