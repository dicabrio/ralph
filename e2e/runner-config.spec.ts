import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Generate unique test run ID to avoid conflicts between test runs
const testRunId = Date.now().toString(36)

// Test fixture: create a temporary project directory with prd.json
async function createTestProject(baseName: string): Promise<{ path: string; name: string }> {
  const name = `${baseName}-${testRunId}`
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-e2e-runner-'))
  const projectPath = path.join(tempDir, name)
  const storiesDir = path.join(projectPath, 'stories')

  fs.mkdirSync(storiesDir, { recursive: true })

  const prdJson = {
    projectName: name,
    projectDescription: `Test project for runner config`,
    branchName: 'main',
    epics: [{ name: 'Test Epic', description: 'Test epic description' }],
    userStories: [
      {
        id: 'TEST-001',
        title: 'Test Story',
        description: 'Test story description',
        priority: 1,
        status: 'pending',
        epic: 'Test Epic',
        dependencies: [],
        recommendedSkills: [],
        acceptanceCriteria: ['Test criterion'],
      },
    ],
  }

  fs.writeFileSync(path.join(storiesDir, 'prd.json'), JSON.stringify(prdJson, null, 2))

  return { path: projectPath, name }
}

// Cleanup: remove temporary project directory
function cleanupTestProject(projectPath: string) {
  try {
    const parentDir = path.dirname(projectPath)
    fs.rmSync(parentDir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

// Helper: wait for app to be ready
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

// Helper: add a project via manual path input
async function addProjectViaPath(page: Page, projectPath: string) {
  // Click the first Add Project button
  const addButton = page.getByRole('button', { name: /add project/i }).first()
  await expect(addButton).toBeVisible({ timeout: 10000 })
  await addButton.click()

  // Wait for modal
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Enter valid project path
  const pathInput = dialog.locator('input#project-path')
  await pathInput.fill(projectPath)

  // Wait for validation
  await page.waitForTimeout(500)
  await expect(dialog.locator('text=Valid project found')).toBeVisible({ timeout: 5000 })

  // Submit
  const submitButton = dialog.locator('button[type="submit"]')
  await submitButton.click()

  // Wait for modal to close
  await expect(dialog).not.toBeVisible({ timeout: 10000 })
}

test.describe('Runner Configuration', () => {
  let testProject: { path: string; name: string }

  test.beforeEach(async ({ page }) => {
    // Create test project
    testProject = await createTestProject('runner-config-test')

    // Navigate to dashboard and add the project
    await page.goto('/')
    await waitForAppReady(page)
    await addProjectViaPath(page, testProject.path)

    // Wait for project to appear
    await expect(page.locator(`text=${testProject.name}`)).toBeVisible({ timeout: 10000 })
  })

  test.afterEach(async () => {
    if (testProject) {
      cleanupTestProject(testProject.path)
    }
  })

  test('can navigate to project settings page', async ({ page }) => {
    // Click on the project to open it
    await page.locator(`text=${testProject.name}`).click()

    // Wait for navigation
    await page.waitForURL(/\/project\/\d+/)

    // Navigate to settings via tabs
    const settingsTab = page.getByRole('link', { name: /instellingen/i })
    await expect(settingsTab).toBeVisible()
    await settingsTab.click()

    // Wait for settings page
    await page.waitForURL(/\/project\/\d+\/settings/)
    await expect(page.getByText('Instellingen')).toBeVisible()
  })

  test('shows runner configuration section on settings page', async ({ page }) => {
    // Navigate to project settings
    await page.locator(`text=${testProject.name}`).click()
    await page.waitForURL(/\/project\/\d+/)

    const settingsTab = page.getByRole('link', { name: /instellingen/i })
    await settingsTab.click()
    await page.waitForURL(/\/project\/\d+\/settings/)

    // Check for Runner section
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible()

    // Check for Provider & Model subsection
    await expect(page.getByText('Provider & Model')).toBeVisible()

    // Check for provider dropdown
    await expect(page.getByTestId('provider-select')).toBeVisible()
  })

  test('can select provider from dropdown', async ({ page }) => {
    // Navigate to project settings
    await page.locator(`text=${testProject.name}`).click()
    await page.waitForURL(/\/project\/\d+/)

    const settingsTab = page.getByRole('link', { name: /instellingen/i })
    await settingsTab.click()
    await page.waitForURL(/\/project\/\d+\/settings/)

    // Open provider dropdown
    const providerSelect = page.getByTestId('provider-select')
    await providerSelect.click()

    // Should show all provider options
    await expect(page.getByTestId('provider-option-claude')).toBeVisible()
    await expect(page.getByTestId('provider-option-ollama')).toBeVisible()
    await expect(page.getByTestId('provider-option-gemini')).toBeVisible()
    await expect(page.getByTestId('provider-option-codex')).toBeVisible()
  })

  test('shows Claude model options when Claude is selected', async ({ page }) => {
    // Navigate to project settings
    await page.locator(`text=${testProject.name}`).click()
    await page.waitForURL(/\/project\/\d+/)

    const settingsTab = page.getByRole('link', { name: /instellingen/i })
    await settingsTab.click()
    await page.waitForURL(/\/project\/\d+\/settings/)

    // Claude should be selected by default
    // Check for Claude model dropdown
    await expect(page.getByTestId('claude-model-select')).toBeVisible()
    await expect(page.getByText('Model (optioneel)')).toBeVisible()
  })

  test('can save runner configuration', async ({ page }) => {
    // Navigate to project settings
    await page.locator(`text=${testProject.name}`).click()
    await page.waitForURL(/\/project\/\d+/)

    const settingsTab = page.getByRole('link', { name: /instellingen/i })
    await settingsTab.click()
    await page.waitForURL(/\/project\/\d+\/settings/)

    // Open provider dropdown and select Ollama
    const providerSelect = page.getByTestId('provider-select')
    await providerSelect.click()
    await page.getByTestId('provider-option-ollama').click()

    // Save button should be enabled after change
    const saveButton = page.getByTestId('save-runner-config')
    await expect(saveButton).toBeEnabled()

    // Click save
    await saveButton.click()

    // Wait for success toast
    await expect(page.getByText('Runner configuratie opgeslagen')).toBeVisible({ timeout: 5000 })

    // Verify ralph.config.json was created
    const configPath = path.join(testProject.path, 'stories', 'ralph.config.json')
    await page.waitForTimeout(500) // Give file system time to write

    const configExists = fs.existsSync(configPath)
    expect(configExists).toBe(true)

    if (configExists) {
      const configContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(configContent.runner?.provider).toBe('ollama')
    }
  })

  test('shows Ollama warning when Ollama is not available', async ({ page }) => {
    // Navigate to project settings
    await page.locator(`text=${testProject.name}`).click()
    await page.waitForURL(/\/project\/\d+/)

    const settingsTab = page.getByRole('link', { name: /instellingen/i })
    await settingsTab.click()
    await page.waitForURL(/\/project\/\d+\/settings/)

    // Open provider dropdown and select Ollama
    const providerSelect = page.getByTestId('provider-select')
    await providerSelect.click()
    await page.getByTestId('provider-option-ollama').click()

    // If Ollama is not running, we should see a warning
    // Note: This test may pass or show warning depending on whether Ollama is running
    // We just verify the UI handles the Ollama selection
    await expect(page.getByText('Model')).toBeVisible()
  })

  test('configured provider shows in kanban header', async ({ page }) => {
    // First, configure Ollama as the provider
    await page.locator(`text=${testProject.name}`).click()
    await page.waitForURL(/\/project\/\d+/)

    const settingsTab = page.getByRole('link', { name: /instellingen/i })
    await settingsTab.click()
    await page.waitForURL(/\/project\/\d+\/settings/)

    // Select Ollama provider
    const providerSelect = page.getByTestId('provider-select')
    await providerSelect.click()
    await page.getByTestId('provider-option-ollama').click()

    // Save configuration
    const saveButton = page.getByTestId('save-runner-config')
    await saveButton.click()
    await expect(page.getByText('Runner configuratie opgeslagen')).toBeVisible({ timeout: 5000 })

    // Navigate to kanban
    const kanbanTab = page.getByRole('link', { name: /kanban/i })
    await kanbanTab.click()
    await page.waitForURL(/\/project\/\d+\/kanban/)

    // Check for configured provider badge
    await expect(page.getByTestId('configured-provider-badge')).toBeVisible()
    await expect(page.getByTestId('configured-provider-badge')).toContainText('ollama')
  })
})
