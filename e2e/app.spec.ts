import { expect, test } from '@playwright/test'

test('home page renders and counter increments', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /vite \+ react \+ typescript/i }),
  ).toBeVisible()

  const button = page.getByRole('button', { name: /count is/i })
  await expect(button).toHaveText('Count is 0')
  await button.click()
  await expect(button).toHaveText('Count is 1')
})
