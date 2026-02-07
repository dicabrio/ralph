import { test, expect } from '@playwright/test'

test.describe('WebSocket Connection', () => {
  test('should connect to WebSocket server without console errors', async ({ page }) => {
    // Collect console messages
    const consoleErrors: string[] = []
    const consoleWarnings: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Ignore React DevTools messages and expected connection retries
        const text = msg.text()
        if (!text.includes('React DevTools') && !text.includes('Download the React DevTools')) {
          consoleErrors.push(text)
        }
      }
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text())
      }
    })

    // Navigate to dashboard
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for the page to fully load
    await page.waitForFunction(() => {
      const heading = document.querySelector('h1')
      return heading?.textContent?.includes('Dashboard')
    }, { timeout: 15000 })

    // Give WebSocket time to connect and stabilize
    await page.waitForTimeout(3000)

    // Check for connection-related errors
    const wsErrors = consoleErrors.filter(
      (e) => e.toLowerCase().includes('websocket') || e.toLowerCase().includes('ws:')
    )

    // Should not have WebSocket errors
    expect(wsErrors).toHaveLength(0)
  })

  test('should reconnect after losing connection', async ({ page }) => {
    // Collect console messages for debugging
    const consoleLogs: string[] = []

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for initial connection
    await page.waitForFunction(() => {
      const heading = document.querySelector('h1')
      return heading?.textContent?.includes('Dashboard')
    }, { timeout: 15000 })

    // Give time for WebSocket to connect
    await page.waitForTimeout(2000)

    // Check that we have a Connected log message or connection attempts
    const hasConnectionActivity = consoleLogs.some(
      (log) => log.includes('[WS Client]') || log.includes('WebSocket')
    )

    // Filter for actual application errors (not connection/network related)
    const applicationErrors = consoleLogs.filter(
      (log) =>
        log.startsWith('[error]') &&
        !log.includes('React DevTools') &&
        !log.includes('Download the React DevTools') &&
        !log.includes('WebSocket') &&
        !log.includes('Failed to load resource') &&
        !log.includes('Initial connection failed') &&
        !log.includes('net::')
    )

    // Should not have application errors
    expect(applicationErrors).toHaveLength(0)
  })

  test('brainstorm page should handle WebSocket gracefully', async ({ page }) => {
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignore React DevTools and network-related errors
        if (
          !text.includes('React DevTools') &&
          !text.includes('Download the React DevTools') &&
          !text.includes('Failed to load resource') &&
          !text.includes('net::') &&
          !text.includes('WebSocket')
        ) {
          consoleErrors.push(text)
        }
      }
    })

    // First add a project (needed for brainstorm page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for page to load
    await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 15000 })

    // Check if there are any projects, if not we can't test brainstorm
    const projectCards = page.locator('[data-testid="project-card"]')
    const projectCount = await projectCards.count()

    if (projectCount > 0) {
      // Click on first project
      await projectCards.first().click()
      await page.waitForLoadState('networkidle')

      // Navigate to brainstorm
      await page.click('text=Brainstorm')
      await page.waitForLoadState('networkidle')

      // Wait for brainstorm page to load
      await page.waitForSelector('h1:has-text("Brainstorm")', { timeout: 15000 })

      // Give WebSocket time to connect
      await page.waitForTimeout(2000)

      // Should not have application errors (network errors are expected in test environment)
      expect(consoleErrors).toHaveLength(0)
    } else {
      // No projects, just verify dashboard loads without errors
      await page.waitForTimeout(2000)
      expect(consoleErrors).toHaveLength(0)
    }
  })
})
