import { test, expect } from '@playwright/test'

test.describe('Dashboard page', () => {
  test('should load the dashboard page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for React hydration to complete
    await page.waitForFunction(() => {
      const heading = document.querySelector('h1')
      return heading?.textContent?.includes('Dashboard')
    }, { timeout: 15000 })

    // Check the main heading is present
    const mainHeading = page.locator('h1:has-text("Dashboard")')
    await expect(mainHeading).toBeVisible()
  })

  test('should display navigation sidebar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for sidebar to render
    await page.waitForSelector('nav', { timeout: 15000 })

    // Check navigation items in the sidebar
    const sidebar = page.locator('aside')
    await expect(sidebar.locator('text=Dashboard')).toBeVisible()
    await expect(sidebar.locator('text=Brainstorm')).toBeVisible()
    await expect(sidebar.locator('text=Prompts')).toBeVisible()
  })

  test('should have Add Project and Discover buttons', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for buttons to be interactive
    await page.waitForFunction(() => {
      const buttons = document.querySelectorAll('button')
      return buttons.length > 0
    }, { timeout: 15000 })

    // Check the buttons exist (either in header or empty state) - use .first() since there can be multiple
    const addProjectButton = page.getByRole('button', { name: /add project/i }).first()
    const discoverButton = page.getByRole('button', { name: /discover/i }).first()

    await expect(addProjectButton).toBeVisible()
    await expect(discoverButton).toBeVisible()
  })
})
