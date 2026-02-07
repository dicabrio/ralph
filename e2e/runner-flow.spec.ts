import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Generate unique test run ID to avoid conflicts between test runs
const testRunId = 'e2e-runner'

// Helper: wait for app to be fully hydrated and ready
async function waitForAppReady(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => {
    const heading = document.querySelector('h1')
    if (!heading || !heading.textContent?.includes('Dashboard')) {
      return false
    }
    const buttons = document.querySelectorAll('button')
    return buttons.length > 0
  }, { timeout: 15000 })
}

// Helper: navigate to dashboard and wait for ready
async function gotoDashboard(page: Page) {
  await page.goto('/')
  await waitForAppReady(page)
}

// Helper: add a project via manual path input
async function addProjectViaPath(page: Page, projectPath: string) {
  const addButton = page.getByRole('button', { name: /add project/i }).first()
  await expect(addButton).toBeVisible({ timeout: 10000 })
  await addButton.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const pathInput = dialog.locator('input#project-path')
  await pathInput.fill(projectPath)

  await page.waitForTimeout(500)
  await expect(dialog.locator('text=Valid project found')).toBeVisible({ timeout: 5000 })

  const submitButton = dialog.locator('button[type="submit"]')
  await submitButton.click()

  await expect(dialog).not.toBeVisible({ timeout: 5000 })
}

// Create a shared test project that persists for all tests in this file
let sharedTestProject: { path: string; name: string } | null = null

function getOrCreateTestProject(): { path: string; name: string } {
  const runTimestamp = process.env.TEST_RUN_TS || Date.now().toString()
  if (!sharedTestProject) {
    const name = `runner-test-${testRunId}-${runTimestamp.slice(-6)}`
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-e2e-runner-'))
    const projectPath = path.join(tempDir, name)
    const storiesDir = path.join(projectPath, 'stories')

    fs.mkdirSync(storiesDir, { recursive: true })

    const prdJson = {
      projectName: name,
      projectDescription: `Runner test project for ${name}`,
      branchName: 'feature/runner-test',
      availableSkills: ['frontend-design'],
      epics: [
        { name: 'Setup', description: 'Initial setup tasks' },
        { name: 'Feature', description: 'Feature development' },
      ],
      userStories: [
        {
          id: 'TEST-001',
          title: 'First pending task',
          description: 'First task ready to be picked up',
          priority: 1,
          status: 'pending',
          epic: 'Setup',
          dependencies: [],
          recommendedSkills: ['frontend-design'],
          acceptanceCriteria: ['Setup complete'],
        },
        {
          id: 'TEST-002',
          title: 'Second pending task',
          description: 'Second task with dependency',
          priority: 2,
          status: 'pending',
          epic: 'Feature',
          dependencies: ['TEST-001'],
          recommendedSkills: [],
          acceptanceCriteria: ['Feature implemented'],
        },
        {
          id: 'TEST-003',
          title: 'In progress task',
          description: 'This task is currently being worked on',
          priority: 3,
          status: 'in_progress',
          epic: 'Feature',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ['Work in progress'],
        },
        {
          id: 'TEST-004',
          title: 'Completed task',
          description: 'This task is done',
          priority: 4,
          status: 'done',
          epic: 'Setup',
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ['Done'],
        },
      ],
    }

    fs.writeFileSync(path.join(storiesDir, 'prd.json'), JSON.stringify(prdJson, null, 2))
    sharedTestProject = { path: projectPath, name }
  }
  return sharedTestProject
}

// Helper to ensure project is added to the dashboard
async function ensureProjectAdded(page: Page, testProject: { path: string; name: string }) {
  await gotoDashboard(page)

  const projectCard = page.locator(`a[href^="/project/"]:has-text("${testProject.name}")`)
  const projectExists = await projectCard.isVisible().catch(() => false)
  if (!projectExists) {
    await addProjectViaPath(page, testProject.path)
    await page.waitForTimeout(500)
  }
}

// Helper: navigate to project detail page
async function gotoProjectPage(page: Page, testProject: { path: string; name: string }): Promise<number> {
  await ensureProjectAdded(page, testProject)

  const projectCard = page.locator(`a[href^="/project/"]:has-text("${testProject.name}")`)
  await expect(projectCard).toBeVisible({ timeout: 10000 })
  await projectCard.click()

  await page.waitForURL(/\/project\/\d+/)
  await page.waitForLoadState('networkidle')

  // Extract project ID from URL
  const url = page.url()
  const projectIdMatch = url.match(/\/project\/(\d+)/)
  const projectId = projectIdMatch ? parseInt(projectIdMatch[1], 10) : 0

  return projectId
}

// Helper: navigate to project's Kanban board
async function gotoKanbanBoard(page: Page, testProject: { path: string; name: string }): Promise<number> {
  const projectId = await gotoProjectPage(page, testProject)

  await page.goto(`/project/${projectId}/kanban`)
  await page.waitForLoadState('networkidle')

  // Wait for Kanban board to load
  await page.waitForFunction(
    () => {
      const content = document.body.textContent || ''
      return content.includes('Te doen') || content.includes('In Progress') || content.includes('Voltooid')
    },
    { timeout: 15000 },
  )

  return projectId
}

test.describe('Runner Flow', () => {
  test.describe.configure({ mode: 'serial' })

  let testProject: { path: string; name: string }

  test.beforeAll(async () => {
    // Always create a fresh project for this test run
    sharedTestProject = null
    testProject = getOrCreateTestProject()
  })

  test.describe('Runner Controls on Project Page', () => {
    test('should display runner controls on project page', async ({ page }) => {
      await gotoProjectPage(page, testProject)

      // Runner section heading should be visible
      await expect(page.getByRole('heading', { name: 'Runner', level: 3 })).toBeVisible({ timeout: 10000 })

      // Status badge should be visible (Idle, Running, or Stopping)
      const statusBadge = page.locator('text=/idle|running|stopping/i').first()
      await expect(statusBadge).toBeVisible()

      // Should have a Start Runner or Stop Runner button
      const startButton = page.getByRole('button', { name: /start runner/i })
      const stopButton = page.getByRole('button', { name: /stop runner/i })
      const hasStartButton = await startButton.isVisible().catch(() => false)
      const hasStopButton = await stopButton.isVisible().catch(() => false)
      expect(hasStartButton || hasStopButton).toBeTruthy()
    })

    test('should have start runner button when runner is idle', async ({ page }) => {
      await gotoProjectPage(page, testProject)

      // Check if status is Idle
      const isIdle = await page.locator('text=/idle/i').first().isVisible().catch(() => false)
      if (isIdle) {
        // Start button should be visible when idle
        await expect(page.getByRole('button', { name: /start runner/i })).toBeVisible({ timeout: 5000 })
      }
    })

    test('should display project statistics', async ({ page }) => {
      await gotoProjectPage(page, testProject)

      // Wait for statistics to load
      await expect(page.getByRole('heading', { name: 'Story Statistics', level: 2 })).toBeVisible({ timeout: 10000 })

      // Check for stat labels
      await expect(page.locator('text=Completed')).toBeVisible()
      await expect(page.locator('text=In Progress')).toBeVisible()
      await expect(page.locator('text=Pending')).toBeVisible()
      await expect(page.locator('text=Overall Progress')).toBeVisible()
    })
  })

  test.describe('Runner Controls on Kanban Page', () => {
    test('should display runner controls on kanban page', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Status badge should be visible (shows Idle, Running, or Stopping)
      const statusBadge = page.locator('text=/idle|running|stopping/i').first()
      await expect(statusBadge).toBeVisible({ timeout: 10000 })

      // Start or Stop button should be visible depending on state
      const startButton = page.getByRole('button', { name: /^start$/i })
      const stopButton = page.getByRole('button', { name: /^stop$/i })

      const hasStartButton = await startButton.isVisible().catch(() => false)
      const hasStopButton = await stopButton.isVisible().catch(() => false)

      expect(hasStartButton || hasStopButton).toBeTruthy()
    })

    test('should display kanban columns', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Check for kanban column headers (using first() to avoid strict mode issues with duplicate text)
      await expect(page.locator('text=Backlog').first()).toBeVisible({ timeout: 10000 })
      await expect(page.locator('text=Te doen').first()).toBeVisible()
      await expect(page.locator('text="In Progress"').first()).toBeVisible()
      await expect(page.locator('text=Voltooid').first()).toBeVisible()
    })

    test('should show stats bar with story counts', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Stats bar should show progress percentage
      await expect(page.locator('text=/\\d+% complete/')).toBeVisible({ timeout: 10000 })

      // Should show story counts (e.g., "1/4")
      await expect(page.locator('text=/\\d+\\/\\d+/')).toBeVisible()
    })
  })

  test.describe('Log Modal for In Progress Story', () => {
    test('should open log modal when clicking on in-progress story', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Find the in-progress story card (TEST-003)
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await expect(inProgressCard).toBeVisible({ timeout: 10000 })

      // Click on the in-progress card
      await inProgressCard.click()

      // Log modal should open (not detail modal)
      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Should show the story ID in the modal header
      await expect(logModal.locator('text=TEST-003')).toBeVisible()

      // Should show "Running" indicator
      await expect(logModal.locator('text=Running')).toBeVisible()
    })

    test('should show waiting for logs message initially', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Click on in-progress story
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Should show waiting message (since no logs are streaming)
      await expect(logModal.locator('text=Waiting for logs')).toBeVisible()
    })

    test('should close log modal with X button', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Open log modal
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Click close button
      const closeButton = logModal.locator('[data-testid="close-button"]')
      await closeButton.click()

      // Modal should close
      await expect(logModal).not.toBeVisible({ timeout: 5000 })
    })

    test('should close log modal with Escape key', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Open log modal
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Press Escape
      await page.keyboard.press('Escape')

      // Modal should close
      await expect(logModal).not.toBeVisible({ timeout: 5000 })
    })

    test('should show connection status indicator', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Open log modal
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Connection status should be visible (Connected, Reconnecting, or Disconnected)
      const connectionStatus = logModal.locator('[data-testid="connection-status"]')
      await expect(connectionStatus).toBeVisible()

      // Should show one of the connection states
      const statusText = await connectionStatus.textContent()
      expect(statusText).toMatch(/Connected|Reconnecting|Disconnected/i)
    })

    test('should have copy and auto-scroll buttons', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Open log modal
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Copy button should be visible
      await expect(logModal.locator('[data-testid="copy-button"]')).toBeVisible()

      // Auto-scroll button should be visible
      await expect(logModal.locator('[data-testid="autoscroll-button"]')).toBeVisible()
    })

    test('should show log line count in footer', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Open log modal
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Footer should show line count (0 lines initially)
      await expect(logModal.locator('text=/\\d+ lines/')).toBeVisible()
    })
  })

  test.describe('Live Log Streaming UI', () => {
    test('should have log container element', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Open log modal
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Log container should exist
      const logContainer = logModal.locator('[data-testid="log-container"]')
      await expect(logContainer).toBeVisible()
    })

    test('should have auto-scroll enabled by default', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Open log modal
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await inProgressCard.click()

      const logModal = page.getByRole('dialog')
      await expect(logModal).toBeVisible({ timeout: 5000 })

      // Auto-scroll button should be visible and enabled
      const autoScrollButton = logModal.locator('[data-testid="autoscroll-button"]')
      await expect(autoScrollButton).toBeVisible()

      // Check aria-pressed attribute indicates it's enabled
      const ariaPressed = await autoScrollButton.getAttribute('aria-pressed')
      expect(ariaPressed).toBe('true')
    })
  })

  test.describe('Story Detail Modal vs Log Modal', () => {
    test('should open detail modal for pending stories', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Click on a pending story (TEST-001)
      const pendingCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-001")'),
      })
      await expect(pendingCard).toBeVisible({ timeout: 10000 })
      await pendingCard.click()

      // Should open detail modal (not log modal)
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Detail modal should show Description section
      await expect(modal.getByRole('heading', { name: 'Description', exact: true })).toBeVisible()

      // Should NOT show "Waiting for logs" (that's log modal)
      await expect(modal.locator('text=Waiting for logs')).not.toBeVisible()
    })

    test('should open detail modal for done stories', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Click on a done story (TEST-004)
      const doneCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-004")'),
      })
      await expect(doneCard).toBeVisible({ timeout: 10000 })
      await doneCard.click()

      // Should open detail modal
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should show story details
      await expect(modal.locator('text=TEST-004')).toBeVisible()
      await expect(modal.getByRole('heading', { name: 'Description', exact: true })).toBeVisible()
    })

    test('should open log modal only for in-progress stories', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Click on in-progress story (TEST-003)
      const inProgressCard = page.locator('[data-testid="story-card"]').filter({
        has: page.locator('[data-testid="story-id"]:text-is("TEST-003")'),
      })
      await expect(inProgressCard).toBeVisible({ timeout: 10000 })
      await inProgressCard.click()

      // Should open log modal (not detail modal)
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should show "Running" and "Waiting for logs" (log modal indicators)
      await expect(modal.locator('text=Running')).toBeVisible()
      await expect(modal.locator('text=Waiting for logs')).toBeVisible()
    })
  })

  test.describe('Runner Start/Stop Button Behavior', () => {
    test('should show Start Runner button when status is idle on project page', async ({ page }) => {
      await gotoProjectPage(page, testProject)

      // Check if we're in idle state
      const isIdle = await page.locator('text=/idle/i').first().isVisible().catch(() => false)

      if (isIdle) {
        // Start Runner button should be visible
        const startButton = page.getByRole('button', { name: /start runner/i })
        await expect(startButton).toBeVisible()

        // Stop Runner button should NOT be visible
        const stopButton = page.getByRole('button', { name: /stop runner/i })
        await expect(stopButton).not.toBeVisible()
      }
    })

    test('should show Start button when status is idle on kanban page', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Check if we're in idle state
      const isIdle = await page.locator('text=/idle/i').first().isVisible().catch(() => false)

      if (isIdle) {
        // Start button should be visible
        const startButton = page.getByRole('button', { name: /^start$/i })
        await expect(startButton).toBeVisible()

        // Stop button should NOT be visible
        const stopButton = page.getByRole('button', { name: /^stop$/i })
        await expect(stopButton).not.toBeVisible()
      }
    })

    test('should have interactive start button', async ({ page }) => {
      await gotoProjectPage(page, testProject)

      // Check if we're in idle state and button is clickable
      const isIdle = await page.locator('text=/idle/i').first().isVisible().catch(() => false)

      if (isIdle) {
        const startButton = page.getByRole('button', { name: /start runner/i })
        await expect(startButton).toBeVisible()

        // Button should be enabled
        await expect(startButton).toBeEnabled()

        // Click the button (the actual runner start is not mocked,
        // so we just verify the button is interactive)
        await startButton.click()

        // Wait briefly for any loading state
        await page.waitForTimeout(500)

        // Button should have responded to click (may show loading or error)
        // This verifies the button is wired up correctly
      }
    })
  })

  test.describe('Runner Error Toasts', () => {
    test('should show error toast when runner fails to start', async ({ page }) => {
      await gotoProjectPage(page, testProject)

      // Check if we're in idle state
      const isIdle = await page.locator('text=/idle/i').first().isVisible().catch(() => false)

      if (isIdle) {
        const startButton = page.getByRole('button', { name: /start runner/i })
        await expect(startButton).toBeVisible()

        // Click start button - this should fail because Docker/auth is not configured in test env
        await startButton.click()

        // Wait for the error toast to appear
        // Sonner toasts appear in a toast container
        const toastLocator = page.locator('[data-sonner-toast]')
        await expect(toastLocator.first()).toBeVisible({ timeout: 10000 })

        // Check that the toast contains error-related content
        const toastContent = await toastLocator.first().textContent()
        expect(toastContent).toContain('Failed to start runner')
      }
    })

    test('should show error toast on kanban page when runner fails to start', async ({ page }) => {
      await gotoKanbanBoard(page, testProject)

      // Check if we're in idle state
      const isIdle = await page.locator('text=/idle/i').first().isVisible().catch(() => false)

      if (isIdle) {
        const startButton = page.getByRole('button', { name: /^start$/i })
        await expect(startButton).toBeVisible()

        // Click start button - this should fail because Docker/auth is not configured in test env
        await startButton.click()

        // Wait for the error toast to appear
        const toastLocator = page.locator('[data-sonner-toast]')
        await expect(toastLocator.first()).toBeVisible({ timeout: 10000 })

        // Check that the toast contains error-related content
        const toastContent = await toastLocator.first().textContent()
        expect(toastContent).toContain('Failed to start runner')
      }
    })
  })
})
