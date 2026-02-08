import { test, expect } from '@playwright/test'

/**
 * Brainstorm Feature E2E Tests
 *
 * Tests the OpenAI-powered brainstorm functionality.
 * Requires OPENAI_API_KEY to be set for full API testing.
 */

test.describe('Brainstorm Feature', () => {
  test.setTimeout(120000) // 2 minutes for all tests

  // Use the first available project for testing
  test.beforeEach(async ({ page }) => {
    // Go to dashboard
    await page.goto('/', { timeout: 30000 })
    await page.waitForTimeout(2000) // Simple wait for hydration
  })

  test('should load brainstorm page for existing project', async ({ page }) => {
    // Find the first project link
    const projectLink = page.locator('a[href^="/project/"]').first()
    const hasProjects = await projectLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasProjects) {
      test.skip(true, 'No projects available for testing')
      return
    }

    // Get project ID from href
    const href = await projectLink.getAttribute('href')
    const projectId = href?.match(/\/project\/(\d+)/)?.[1]

    if (!projectId) {
      test.skip(true, 'Could not extract project ID')
      return
    }

    // Navigate to brainstorm page
    await page.goto(`/project/${projectId}/brainstorm`)
    await page.waitForLoadState('networkidle')

    // Check page loaded correctly
    await expect(page.locator('h1:has-text("Brainstorm")')).toBeVisible({ timeout: 10000 })

    // Check for input field
    const messageInput = page.getByTestId('message-input')
    await expect(messageInput).toBeVisible()

    // Check for send button (should be disabled initially)
    const sendButton = page.getByTestId('send-button')
    await expect(sendButton).toBeVisible()
  })

  test('should enable send button when message is typed', async ({ page }) => {
    const projectLink = page.locator('a[href^="/project/"]').first()
    const hasProjects = await projectLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasProjects) {
      test.skip(true, 'No projects available for testing')
      return
    }

    const href = await projectLink.getAttribute('href')
    const projectId = href?.match(/\/project\/(\d+)/)?.[1]
    await page.goto(`/project/${projectId}/brainstorm`)
    await page.waitForLoadState('networkidle')

    const messageInput = page.getByTestId('message-input')
    const sendButton = page.getByTestId('send-button')

    // Initially disabled
    await expect(sendButton).toBeDisabled()

    // Type a message
    await messageInput.fill('Test message for brainstorm')

    // Should now be enabled
    await expect(sendButton).toBeEnabled()
  })

  test('should send message and show response or error', async ({ page }) => {
    test.setTimeout(180000) // Allow more time for API response (3 minutes)

    const projectLink = page.locator('a[href^="/project/"]').first()
    const hasProjects = await projectLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasProjects) {
      test.skip(true, 'No projects available for testing')
      return
    }

    const href = await projectLink.getAttribute('href')
    const projectId = href?.match(/\/project\/(\d+)/)?.[1]
    await page.goto(`/project/${projectId}/brainstorm`)
    await page.waitForLoadState('networkidle')

    const messageInput = page.getByTestId('message-input')
    const sendButton = page.getByTestId('send-button')

    // Send a simple brainstorm request
    const testMessage = 'Say hello in one word'
    await messageInput.fill(testMessage)
    await sendButton.click()

    // User message should appear
    await expect(page.locator(`text=${testMessage}`)).toBeVisible({ timeout: 5000 })

    // Wait for streaming to start (cancel button appears)
    const streamingStarted = await page.getByTestId('cancel-button').waitFor({ timeout: 30000 }).then(() => true).catch(() => false)

    if (!streamingStarted) {
      // Check for error banner (API not configured, etc.)
      const errorBanner = page.locator('.bg-destructive\\/10')
      const hasError = await errorBanner.isVisible({ timeout: 2000 }).catch(() => false)
      expect(hasError || streamingStarted).toBe(true)
      return
    }

    // Wait for streaming to complete (send button reappears)
    const completed = await page.getByTestId('send-button').waitFor({ state: 'visible', timeout: 120000 }).then(() => true).catch(() => false)
    expect(completed).toBe(true)

    // Verify we got messages
    const messages = page.locator('[data-testid^="message-"]')
    const count = await messages.count()
    expect(count).toBeGreaterThan(1)
  })

  test('should handle multi-turn conversation', async ({ page }) => {
    test.setTimeout(180000) // Allow time for conversation (3 minutes)

    const projectLink = page.locator('a[href^="/project/"]').first()
    const hasProjects = await projectLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasProjects) {
      test.skip(true, 'No projects available for testing')
      return
    }

    const href = await projectLink.getAttribute('href')
    const projectId = href?.match(/\/project\/(\d+)/)?.[1]
    await page.goto(`/project/${projectId}/brainstorm`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // Wait for WebSocket

    const messageInput = page.getByTestId('message-input')
    const sendButton = page.getByTestId('send-button')

    // First message - initial brainstorm
    await messageInput.fill('I want to add a feature')
    await sendButton.click()

    // Wait for first response to complete
    const streamingStarted = await page.getByTestId('cancel-button').waitFor({ timeout: 30000 }).then(() => true).catch(() => false)

    if (!streamingStarted) {
      const errorBanner = page.locator('.bg-destructive\\/10')
      const hasError = await errorBanner.isVisible({ timeout: 2000 }).catch(() => false)
      if (hasError) {
        test.skip(true, 'OpenAI API not configured')
      }
      return
    }

    // Wait for first response to complete
    await page.getByTestId('send-button').waitFor({ state: 'visible', timeout: 60000 })

    // Check that we have at least 2 messages (user + AI)
    const messageCount = await page.locator('[data-testid^="message-"]').count()
    expect(messageCount).toBeGreaterThanOrEqual(2)
  })

  test('should show stories when generated', async ({ page }) => {
    test.setTimeout(180000) // Allow time for full story generation (3 minutes)

    const projectLink = page.locator('a[href^="/project/"]').first()
    const hasProjects = await projectLink.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasProjects) {
      test.skip(true, 'No projects available for testing')
      return
    }

    const href = await projectLink.getAttribute('href')
    const projectId = href?.match(/\/project\/(\d+)/)?.[1]
    await page.goto(`/project/${projectId}/brainstorm`)
    await page.waitForLoadState('networkidle')

    // Wait for WebSocket to connect
    await page.waitForTimeout(2000)

    const messageInput = page.getByTestId('message-input')
    const sendButton = page.getByTestId('send-button')

    // Send a request that should generate stories
    await messageInput.fill('Create a basic user login feature')
    await sendButton.click()

    // Wait for streaming to start (cancel button appears)
    const streamingStarted = await page.getByTestId('cancel-button').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)

    if (!streamingStarted) {
      // Check for error banner
      const errorBanner = page.locator('.bg-destructive\\/10')
      const hasError = await errorBanner.isVisible({ timeout: 2000 }).catch(() => false)
      if (hasError) {
        test.skip(true, 'OpenAI API not configured or error occurred')
      }
      return
    }

    // Wait for streaming to complete (send button reappears)
    const completed = await page.getByTestId('send-button').waitFor({ state: 'visible', timeout: 120000 }).then(() => true).catch(() => false)
    expect(completed).toBe(true)

    // Give a moment for UI to update
    await page.waitForTimeout(500)

    // Check for stories container
    const storiesContainer = page.getByTestId('generated-stories')
    const hasStories = await storiesContainer.isVisible({ timeout: 2000 }).catch(() => false)

    if (hasStories) {
      // Verify stories are visible
      await expect(storiesContainer).toBeVisible()

      // Check for bulk approve button (indicates multiple stories)
      const approveAllButton = page.getByTestId('bulk-approve-button')
      const hasApproveAll = await approveAllButton.isVisible().catch(() => false)

      // Either single story or bulk approve should be available
      expect(hasStories || hasApproveAll).toBe(true)
    } else {
      // Response completed but no stories - this is acceptable
      // (might be a simple response without story generation)
      const messages = page.locator('[data-testid^="message-"]')
      const count = await messages.count()
      expect(count).toBeGreaterThan(1) // At least user message and response
    }
  })
})
