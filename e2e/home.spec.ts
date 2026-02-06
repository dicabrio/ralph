import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/')

    // Check the main heading is present
    const mainHeading = page.getByRole('heading', { name: 'TANSTACK START' })
    await expect(mainHeading).toBeVisible()
  })

  test('should display feature cards', async ({ page }) => {
    await page.goto('/')

    // Check that feature cards are present
    const featureCards = page.locator('text=Powerful Server Functions')
    await expect(featureCards).toBeVisible()

    // Check another feature
    const typeSafetyCard = page.locator('text=Strongly Typed Everything')
    await expect(typeSafetyCard).toBeVisible()
  })

  test('should have documentation link', async ({ page }) => {
    await page.goto('/')

    // Check the documentation link exists
    const docLink = page.locator('a:has-text("Documentation")')
    await expect(docLink).toBeVisible()
    await expect(docLink).toHaveAttribute('href', 'https://tanstack.com/start')
  })
})
