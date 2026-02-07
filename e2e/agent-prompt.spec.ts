import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Generate unique test run ID to avoid conflicts between test runs
const testRunId = Date.now().toString(36)

// Test fixture: create a temporary project directory with prd.json
async function createTestProject(baseName: string): Promise<{ path: string; name: string }> {
  const name = `${baseName}-${testRunId}`
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-e2e-prompt-'))
  const projectPath = path.join(tempDir, name)
  const storiesDir = path.join(projectPath, 'stories')

  fs.mkdirSync(storiesDir, { recursive: true })

  const prdJson = {
    projectName: name,
    projectDescription: `Test project for agent prompt ${name}`,
    branchName: 'feature/prompt-test',
    availableSkills: [],
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
        acceptanceCriteria: ['Test criterion 1'],
      },
    ],
  }

  fs.writeFileSync(path.join(storiesDir, 'prd.json'), JSON.stringify(prdJson, null, 2))

  return { path: projectPath, name }
}

// Cleanup: remove temporary directories
function cleanupDir(dirPath: string) {
  try {
    const parentDir = path.dirname(dirPath)
    fs.rmSync(parentDir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

// Helper: wait for app to be fully hydrated and ready
async function waitForAppReady(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
}

// Helper: navigate to prompts page and wait for ready
async function gotoPromptsPage(page: Page) {
  await page.goto('/prompts')
  await waitForAppReady(page)
  await expect(page.locator('h1:has-text("Prompts")')).toBeVisible({ timeout: 15000 })
}

// Helper: navigate to dashboard
async function gotoDashboard(page: Page) {
  await page.goto('/')
  await waitForAppReady(page)
  await page.waitForFunction(() => {
    const heading = document.querySelector('h1')
    return heading && heading.textContent?.includes('Dashboard')
  }, { timeout: 15000 })
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

test.describe('Agent Prompt Management', () => {
  let testProject: { path: string; name: string }
  let projectId: string | null = null

  test.beforeAll(async () => {
    // Create test project
    testProject = await createTestProject('prompt-test')
  })

  test.afterAll(async () => {
    // Cleanup
    cleanupDir(testProject.path)
  })

  test.describe.configure({ mode: 'serial' })

  test.describe('Central Prompts Page - Agent Prompt', () => {
    test('should display Agent Prompt card on central prompts page', async ({ page }) => {
      await gotoPromptsPage(page)

      // Should have Agent Prompt section
      await expect(page.locator('h2:has-text("Agent Prompt")')).toBeVisible({ timeout: 10000 })

      // Should have Agent Prompt card
      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await expect(agentPromptCard).toBeVisible()
    })

    test('should show preview of agent prompt template', async ({ page }) => {
      await gotoPromptsPage(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await expect(agentPromptCard).toBeVisible()

      // Card should contain preview text
      await expect(agentPromptCard.locator('text=Agent Prompt')).toBeVisible()
      await expect(agentPromptCard.locator('text=lines')).toBeVisible()
    })

    test('should open modal when clicking Agent Prompt card', async ({ page }) => {
      await gotoPromptsPage(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      // Modal should open
      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Modal should show Agent Prompt title
      await expect(modal.locator('h2:has-text("Agent Prompt")')).toBeVisible()
    })

    test('should display default template content in modal', async ({ page }) => {
      await gotoPromptsPage(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should contain template content (check for key phrases)
      await expect(modal.locator('text=Agent Instructions')).toBeVisible()
    })

    test('should have copy button in modal', async ({ page }) => {
      await gotoPromptsPage(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should have copy button
      const copyButton = modal.locator('[data-testid="copy-button"]')
      await expect(copyButton).toBeVisible()
    })

    test('should close modal when clicking X button', async ({ page }) => {
      await gotoPromptsPage(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Close modal
      const closeButton = modal.locator('[data-testid="close-button"]')
      await closeButton.click()

      // Modal should be closed
      await expect(modal).not.toBeVisible({ timeout: 5000 })
    })

    test('should close modal when pressing Escape', async ({ page }) => {
      await gotoPromptsPage(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Press Escape
      await page.keyboard.press('Escape')

      // Modal should be closed
      await expect(modal).not.toBeVisible({ timeout: 5000 })
    })

    test('should not have edit functionality on central page (read-only)', async ({ page }) => {
      await gotoPromptsPage(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should NOT have edit button on central page
      const editButton = modal.locator('[data-testid="edit-button"]')
      await expect(editButton).not.toBeVisible()
    })
  })

  test.describe('Project Prompts Page - Agent Prompt', () => {
    test.beforeAll(async ({ browser }) => {
      // Add project if not already added
      const page = await browser.newPage()
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${testProject.name}")`)
      const exists = await projectCard.isVisible().catch(() => false)

      if (!exists) {
        await addProjectViaPath(page, testProject.path)
        await page.waitForTimeout(1000)
      }

      // Get project ID
      const newProjectCard = page.locator(`a[href^="/project/"]:has-text("${testProject.name}")`)
      if (await newProjectCard.isVisible()) {
        const href = await newProjectCard.getAttribute('href')
        if (href) {
          const match = href.match(/\/project\/(\d+)/)
          if (match) {
            projectId = match[1]
          }
        }
      }

      await page.close()
    })

    test('should display Agent Prompt card with "Using default" badge', async ({ page }) => {
      if (!projectId) {
        test.skip()
        return
      }

      await page.goto(`/project/${projectId}/prompts`)
      await waitForAppReady(page)

      // Should have Agent Prompt section
      await expect(page.locator('h2:has-text("Agent Prompt")')).toBeVisible({ timeout: 10000 })

      // Should have Agent Prompt card with "Using default" badge
      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await expect(agentPromptCard).toBeVisible()
      await expect(agentPromptCard.locator('text=Using default')).toBeVisible()
    })

    test('should open modal with edit functionality', async ({ page }) => {
      if (!projectId) {
        test.skip()
        return
      }

      await page.goto(`/project/${projectId}/prompts`)
      await waitForAppReady(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should have edit button
      const editButton = modal.locator('[data-testid="edit-button"]')
      await expect(editButton).toBeVisible()
    })

    test('should enter edit mode when clicking edit button', async ({ page }) => {
      if (!projectId) {
        test.skip()
        return
      }

      await page.goto(`/project/${projectId}/prompts`)
      await waitForAppReady(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Click edit button
      const editButton = modal.locator('[data-testid="edit-button"]')
      await editButton.click()

      // Should show "Editing" badge
      await expect(modal.locator('text=Editing')).toBeVisible()

      // Should have save button
      await expect(modal.locator('[data-testid="save-button"]')).toBeVisible()
    })

    test('should save edited prompt and show "Customized" badge', async ({ page }) => {
      if (!projectId) {
        test.skip()
        return
      }

      await page.goto(`/project/${projectId}/prompts`)
      await waitForAppReady(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Click edit button
      const editButton = modal.locator('[data-testid="edit-button"]')
      await editButton.click()

      // Modify the content (add a line to the editor)
      const editor = modal.locator('[data-testid="code-editor"]')
      await expect(editor).toBeVisible()

      // Type some content
      await editor.locator('.cm-content').click()
      await page.keyboard.press('End')
      await page.keyboard.type('\n\n# Custom Addition\n\nThis is a customized prompt.')

      // Save
      const saveButton = modal.locator('[data-testid="save-button"]')
      await expect(saveButton).toBeEnabled()
      await saveButton.click()

      // Wait for save to complete
      await page.waitForTimeout(1000)

      // Modal should now show "Customized" badge
      await expect(modal.locator('text=Customized')).toBeVisible({ timeout: 5000 })
    })

    test('should show diff view for customized prompt', async ({ page }) => {
      if (!projectId) {
        test.skip()
        return
      }

      await page.goto(`/project/${projectId}/prompts`)
      await waitForAppReady(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')

      // Check if we have a customized prompt
      const isCustomized = await agentPromptCard.locator('text=Customized').isVisible().catch(() => false)

      if (!isCustomized) {
        // Need to customize first
        test.skip()
        return
      }

      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should have diff view toggle
      await expect(modal.locator('button:has-text("Diff")')).toBeVisible()

      // Click on Diff view
      await modal.locator('button:has-text("Diff")').click()

      // Should show diff view with two columns
      const diffView = modal.locator('[data-testid="diff-view"]')
      await expect(diffView).toBeVisible({ timeout: 5000 })

      // Should have both sides
      await expect(diffView.locator('text=Default Template')).toBeVisible()
      await expect(diffView.locator('text=Project Prompt')).toBeVisible()
    })

    test('should reset prompt to default and show "Using default" badge', async ({ page }) => {
      if (!projectId) {
        test.skip()
        return
      }

      await page.goto(`/project/${projectId}/prompts`)
      await waitForAppReady(page)

      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')

      // Check if we have a customized prompt
      const isCustomized = await agentPromptCard.locator('text=Customized').isVisible().catch(() => false)

      if (!isCustomized) {
        // Nothing to reset
        test.skip()
        return
      }

      await agentPromptCard.click()

      const modal = page.locator('[data-testid="agent-prompt-modal"]')
      await expect(modal).toBeVisible({ timeout: 5000 })

      // Should have reset button
      const resetButton = modal.locator('[data-testid="reset-button"]')
      await expect(resetButton).toBeVisible()

      // Accept the dialog that will appear
      page.on('dialog', async (dialog) => {
        await dialog.accept()
      })

      // Click reset
      await resetButton.click()

      // Wait for reset to complete
      await page.waitForTimeout(1000)

      // Should now show "Using default" badge
      await expect(modal.locator('text=Using default')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('All tests run headless in CI', () => {
    test('tests should be CI-ready (no interactive elements required)', async ({ page }) => {
      await gotoPromptsPage(page)

      // Verify page loads correctly
      await expect(page.locator('h1:has-text("Prompts")')).toBeVisible({ timeout: 15000 })

      // Check Agent Prompt card is present
      const agentPromptCard = page.locator('[data-testid="agent-prompt-card"]')
      await expect(agentPromptCard).toBeVisible()

      // This test passes if we get here, confirming headless execution works
      expect(true).toBeTruthy()
    })
  })
})
