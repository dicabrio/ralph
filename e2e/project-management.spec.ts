import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Generate unique test run ID to avoid conflicts between test runs
const testRunId = Date.now().toString(36)

// Test fixture: create a temporary project directory with prd.json
async function createTestProject(baseName: string): Promise<{ path: string; name: string }> {
  // Use a unique name to avoid conflicts with previous test runs
  const name = `${baseName}-${testRunId}`
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-e2e-'))
  const projectPath = path.join(tempDir, name)
  const storiesDir = path.join(projectPath, 'stories')

  fs.mkdirSync(storiesDir, { recursive: true })

  const prdJson = {
    projectName: name,
    projectDescription: `Test project description for ${name}`,
    branchName: 'feature/test-branch',
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
        acceptanceCriteria: ['Test criterion 1', 'Test criterion 2'],
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

// Helper: open Add Project modal and return the dialog locator
async function openAddProjectModal(page: Page) {
  // Click the first Add Project button (in header)
  const addButton = page.getByRole('button', { name: /add project/i }).first()
  await expect(addButton).toBeVisible({ timeout: 10000 })
  await addButton.click()

  // Wait for modal to be visible
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('h2:has-text("Add Project")')).toBeVisible()
  return dialog
}

// Helper: add a project via manual path input
async function addProjectViaPath(page: Page, projectPath: string) {
  const dialog = await openAddProjectModal(page)

  // Enter valid project path
  const pathInput = dialog.locator('input#project-path')
  await pathInput.fill(projectPath)

  // Wait for validation
  await page.waitForTimeout(500)
  await expect(dialog.locator('text=Valid project found')).toBeVisible({ timeout: 5000 })

  // Submit the form using the button inside the dialog
  const submitButton = dialog.locator('button[type="submit"]')
  await submitButton.click()

  // Modal should close
  await expect(dialog).not.toBeVisible({ timeout: 5000 })
}

// Helper: open Discover Projects modal and return the dialog locator
async function openDiscoverModal(page: Page) {
  const discoverButton = page.getByRole('button', { name: /discover/i }).first()
  await expect(discoverButton).toBeVisible({ timeout: 10000 })
  await discoverButton.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('h2:has-text("Discover Projects")')).toBeVisible()
  return dialog
}

test.describe('Project Management Flow', () => {
  const testProjects: string[] = []

  test.afterAll(async () => {
    for (const projectPath of testProjects) {
      cleanupTestProject(projectPath)
    }
  })

  test.describe('Empty State', () => {
    test('should show empty state or project cards on dashboard', async ({ page }) => {
      await gotoDashboard(page)

      const hasEmptyState = await page.locator('text=No projects yet').isVisible().catch(() => false)
      const hasProjects = await page.locator('a[href^="/project/"]').count() > 0

      expect(hasEmptyState || hasProjects).toBeTruthy()

      if (hasEmptyState) {
        await expect(page.locator('text=No projects yet')).toBeVisible()
        await expect(page.locator('text=Add your first project')).toBeVisible()
        await expect(page.getByRole('button', { name: /add project/i }).first()).toBeVisible()
        await expect(page.getByRole('button', { name: /discover/i }).first()).toBeVisible()
      }
    })
  })

  test.describe('Add Project via Manual Input', () => {
    let testProject: { path: string; name: string }
    let tildeProject: { path: string; name: string; tildePath: string } | null = null

    test.beforeAll(async () => {
      testProject = await createTestProject('manual-test')
      testProjects.push(testProject.path)

      // Create a project in the user's home directory temp folder
      // This allows us to use a tilde path
      const createdTildeProject = await createTestProject('tilde-test')
      testProjects.push(createdTildeProject.path)
      // Calculate the tilde path by replacing home directory with ~
      const homeDir = os.homedir()
      if (createdTildeProject.path.startsWith(homeDir)) {
        tildeProject = {
          ...createdTildeProject,
          tildePath: createdTildeProject.path.replace(homeDir, '~'),
        }
      } else {
        tildeProject = {
          ...createdTildeProject,
          tildePath: createdTildeProject.path, // Fallback if not in home dir
        }
      }
    })

    test('should open Add Project modal when clicking Add Project button', async ({ page }) => {
      await gotoDashboard(page)
      const dialog = await openAddProjectModal(page)
      await expect(dialog).toBeVisible()
    })

    test('should validate project path in real-time', async ({ page }) => {
      await gotoDashboard(page)
      const dialog = await openAddProjectModal(page)

      const pathInput = dialog.locator('input#project-path')
      await pathInput.fill('/nonexistent/path/that/does/not/exist')

      await page.waitForTimeout(500)
      await expect(dialog.locator('text=Path does not exist')).toBeVisible({ timeout: 5000 })
    })

    test('should add project via manual path input', async ({ page }) => {
      await gotoDashboard(page)

      // Check if project already exists
      const projectCard = page.locator(`a[href^="/project/"]:has-text("${testProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)
      if (projectExists) {
        await expect(projectCard).toBeVisible()
        return
      }

      await addProjectViaPath(page, testProject.path)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
    })

    test('should show validation error when adding already existing project', async ({ page }) => {
      await gotoDashboard(page)

      // Ensure project exists by checking if card is visible
      const projectCard = page.locator(`a[href^="/project/"]:has-text("${testProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)
      if (!projectExists) {
        await addProjectViaPath(page, testProject.path)
        // Wait for the dashboard to fully refresh and database to sync
        await page.waitForTimeout(1000)
        await gotoDashboard(page)
      }

      // Try to add the same project again
      const dialog = await openAddProjectModal(page)
      const pathInput = dialog.locator('input#project-path')
      await pathInput.fill(testProject.path)

      // Wait for validation to complete (debounced validation + API call)
      await page.waitForTimeout(1500)

      // Should show "already been added" error
      await expect(dialog.locator('text=already been added')).toBeVisible({ timeout: 10000 })
    })

    test('should add project using tilde (~) path', async ({ page }) => {
      await gotoDashboard(page)

      // Skip if tildeProject wasn't created or doesn't have a valid tildePath
      if (!tildeProject || !tildeProject.tildePath.startsWith('~')) {
        test.skip()
        return
      }

      // Check if project already exists
      const projectCard = page.locator(`a[href^="/project/"]:has-text("${tildeProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)
      if (projectExists) {
        await expect(projectCard).toBeVisible()
        return
      }

      // Open the add project modal
      const dialog = await openAddProjectModal(page)

      // Enter the tilde path
      const pathInput = dialog.locator('input#project-path')
      await pathInput.fill(tildeProject.tildePath)

      // Wait for validation to complete
      await page.waitForTimeout(500)

      // Should show "Valid project found" - tilde path should be expanded correctly
      await expect(dialog.locator('text=Valid project found')).toBeVisible({ timeout: 5000 })

      // Submit the form
      const submitButton = dialog.locator('button[type="submit"]')
      await submitButton.click()

      // Modal should close
      await expect(dialog).not.toBeVisible({ timeout: 5000 })

      // Project card should appear (with the project name, not the tilde path)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
    })

    test('should show already added error when using tilde path for existing project', async ({ page }) => {
      await gotoDashboard(page)

      // Skip if tildeProject wasn't created or doesn't have a valid tildePath
      if (!tildeProject || !tildeProject.tildePath.startsWith('~')) {
        test.skip()
        return
      }

      // Ensure project exists
      const projectCard = page.locator(`a[href^="/project/"]:has-text("${tildeProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)
      if (!projectExists) {
        await addProjectViaPath(page, tildeProject.tildePath)
        await page.waitForTimeout(1000)
        await gotoDashboard(page)
      }

      // Try to add the same project again using tilde path
      const dialog = await openAddProjectModal(page)
      const pathInput = dialog.locator('input#project-path')
      await pathInput.fill(tildeProject.tildePath)

      // Wait for validation to complete
      await page.waitForTimeout(1500)

      // Should show "already been added" error (expanded path should match)
      await expect(dialog.locator('text=already been added')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Add Project via Discovery Modal', () => {
    test('should open Discover Projects modal', async ({ page }) => {
      await gotoDashboard(page)
      const dialog = await openDiscoverModal(page)
      await expect(dialog).toBeVisible()
    })

    test('should show discovered projects or empty state', async ({ page }) => {
      await gotoDashboard(page)
      const dialog = await openDiscoverModal(page)

      // Wait for discovery to complete
      await dialog.locator('text=Scanning for projects').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => { })

      const hasProjects = await dialog.locator('input[type="checkbox"]').count() > 0
      const hasEmptyState = await dialog.locator('text=No projects found').isVisible().catch(() => false)
      const hasAlreadyAdded = await dialog.locator('text=Already added').isVisible().catch(() => false)

      expect(hasProjects || hasEmptyState || hasAlreadyAdded).toBeTruthy()
    })

    test('should show select all / deselect all when projects available', async ({ page }) => {
      await gotoDashboard(page)
      const dialog = await openDiscoverModal(page)

      await dialog.locator('text=Scanning for projects').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => { })

      const selectAllButton = dialog.locator('button:has-text("Select all")')
      const deselectAllButton = dialog.locator('button:has-text("Deselect all")')

      const hasSelectAll = await selectAllButton.isVisible().catch(() => false)
      const hasDeselectAll = await deselectAllButton.isVisible().catch(() => false)

      if (hasSelectAll || hasDeselectAll) {
        if (hasSelectAll) {
          await selectAllButton.click()
          await expect(deselectAllButton).toBeVisible()
        }
        if (await deselectAllButton.isVisible()) {
          await deselectAllButton.click()
          await expect(selectAllButton).toBeVisible()
        }
      }
    })
  })

  test.describe('View Project Details', () => {
    let detailProject: { path: string; name: string }

    test.beforeAll(async () => {
      detailProject = await createTestProject('detail-test')
      testProjects.push(detailProject.path)
    })

    test('should navigate to project detail page and display project information', async ({ page }) => {
      await gotoDashboard(page)

      // Add project if needed
      let projectCard = page.locator(`a[href^="/project/"]:has-text("${detailProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)

      if (!projectExists) {
        await addProjectViaPath(page, detailProject.path)
      }

      // Click on the project card
      projectCard = page.locator(`a[href^="/project/"]:has-text("${detailProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      await projectCard.click()

      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Verify project details
      await expect(page.locator(`h1:has-text("${detailProject.name}")`)).toBeVisible({ timeout: 10000 })
      await expect(page.locator(`text=Test project description for ${detailProject.name}`)).toBeVisible()
      await expect(page.locator('text=Settings')).toBeVisible()
      await expect(page.locator('text=Project Path')).toBeVisible()
      await expect(page.locator('text=Branch Name')).toBeVisible()
      await expect(page.locator('text=Story Statistics')).toBeVisible()
    })

    test('should display project statistics correctly', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${detailProject.name}")`)
      const exists = await projectCard.isVisible().catch(() => false)

      if (!exists) {
        test.skip()
        return
      }

      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      await expect(page.locator('text=Completed')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('text=In Progress')).toBeVisible()
      await expect(page.locator('text=Failed')).toBeVisible()
      await expect(page.locator('text=Pending')).toBeVisible()
      await expect(page.locator('text=Overall Progress')).toBeVisible()
    })

    test('should show quick links to Kanban and Prompts pages', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${detailProject.name}")`)
      const exists = await projectCard.isVisible().catch(() => false)

      if (!exists) {
        test.skip()
        return
      }

      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      await expect(page.locator('text=Quick Links')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('text=Kanban Board')).toBeVisible()
      await expect(page.locator('text=Project Prompts')).toBeVisible()
    })

    test('should navigate back to dashboard via back link', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${detailProject.name}")`)
      const exists = await projectCard.isVisible().catch(() => false)

      if (!exists) {
        test.skip()
        return
      }

      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      await page.locator('a:has-text("Back to Dashboard")').click()

      await page.waitForURL('/')
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Update Project Settings', () => {
    let settingsProject: { path: string; name: string }

    test.beforeAll(async () => {
      settingsProject = await createTestProject('settings-test')
      testProjects.push(settingsProject.path)
    })

    test('should show editable branch name field in settings', async ({ page }) => {
      await gotoDashboard(page)

      // Add project if not exists
      let projectCard = page.locator(`a[href^="/project/"]:has-text("${settingsProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)

      if (!projectExists) {
        await addProjectViaPath(page, settingsProject.path)
      }

      // Navigate to project detail
      projectCard = page.locator(`a[href^="/project/"]:has-text("${settingsProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Wait for settings to load
      await expect(page.locator('h2:has-text("Settings")')).toBeVisible({ timeout: 10000 })

      // Verify Branch Name label is visible
      await expect(page.locator('span:has-text("Branch Name")')).toBeVisible()

      // Verify the branch name value is displayed
      await expect(page.locator('text=feature/test-branch')).toBeVisible()

      // Verify there's an edit button (pencil icon) visible
      const settingsCard = page.locator('div.bg-card:has(span:has-text("Branch Name"))')
      const editButton = settingsCard.locator('button').filter({ has: page.locator('svg') })
      await expect(editButton).toBeVisible({ timeout: 5000 })
    })

    test('should open inline edit when clicking edit button', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${settingsProject.name}")`)
      const exists = await projectCard.isVisible().catch(() => false)

      if (!exists) {
        test.skip()
        return
      }

      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      await expect(page.locator('h2:has-text("Settings")')).toBeVisible({ timeout: 10000 })

      // Find and click the edit button
      const settingsCard = page.locator('div.bg-card:has(span:has-text("Branch Name"))')
      const editButton = settingsCard.locator('button').filter({ has: page.locator('svg') })
      await expect(editButton).toBeVisible({ timeout: 5000 })
      await editButton.click()

      // Verify input field appears
      const branchInput = settingsCard.locator('input[type="text"]')
      await expect(branchInput).toBeVisible({ timeout: 5000 })

      // Verify the input has the current value
      await expect(branchInput).toHaveValue(/feature/)
    })

    test('should cancel edit with Escape key', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${settingsProject.name}")`)
      const exists = await projectCard.isVisible().catch(() => false)

      if (!exists) {
        test.skip()
        return
      }

      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      await expect(page.locator('h2:has-text("Settings")')).toBeVisible({ timeout: 10000 })

      // Find and click the edit button
      const settingsCard = page.locator('div.bg-card:has(span:has-text("Branch Name"))')
      const editButton = settingsCard.locator('button').filter({ has: page.locator('svg') })
      await expect(editButton).toBeVisible({ timeout: 5000 })
      await editButton.click()

      const branchInput = settingsCard.locator('input[type="text"]')
      await expect(branchInput).toBeVisible({ timeout: 5000 })

      // Type something and press Escape
      await branchInput.fill('should-not-save')
      await branchInput.press('Escape')

      // Input should disappear
      await expect(branchInput).not.toBeVisible({ timeout: 5000 })
      // The unsaved value should not be visible
      await expect(page.locator('text=should-not-save')).not.toBeVisible()
    })
  })

  test.describe('Delete Project', () => {
    let deleteProject: { path: string; name: string }
    let deleteProject2: { path: string; name: string }

    test.beforeAll(async () => {
      deleteProject = await createTestProject('delete-test')
      testProjects.push(deleteProject.path)
      deleteProject2 = await createTestProject('delete-test-2')
      testProjects.push(deleteProject2.path)
    })

    test('should display delete button in Danger Zone section', async ({ page }) => {
      await gotoDashboard(page)

      let projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)

      if (!projectExists) {
        await addProjectViaPath(page, deleteProject.path)
      }

      projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Verify Danger Zone section exists
      await expect(page.locator('h2:has-text("Danger Zone")')).toBeVisible({ timeout: 10000 })

      // Verify delete button exists
      const deleteButton = page.getByTestId('delete-project-button')
      await expect(deleteButton).toBeVisible()
      await expect(deleteButton).toContainText('Remove Project')
    })

    test('should show confirmation dialog when clicking delete button', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Click delete button
      const deleteButton = page.getByTestId('delete-project-button')
      await expect(deleteButton).toBeVisible({ timeout: 10000 })
      await deleteButton.click()

      // Verify confirmation dialog appears
      const dialog = page.getByTestId('delete-confirm-dialog')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Verify dialog content
      await expect(dialog.locator('h2:has-text("Remove Project from Ralph?")')).toBeVisible()
      await expect(dialog.locator(`text=${deleteProject.name}`)).toBeVisible()
      await expect(dialog.locator('text=Files will be preserved')).toBeVisible()

      // Verify buttons
      await expect(dialog.locator('button:has-text("Cancel")')).toBeVisible()
      await expect(page.getByTestId('confirm-delete-button')).toBeVisible()
    })

    test('should close confirmation dialog when clicking Cancel', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Click delete button
      const deleteButton = page.getByTestId('delete-project-button')
      await expect(deleteButton).toBeVisible({ timeout: 10000 })
      await deleteButton.click()

      // Wait for dialog
      const dialog = page.getByTestId('delete-confirm-dialog')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Click Cancel
      await dialog.locator('button:has-text("Cancel")').click()

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 5000 })

      // Should still be on the project page
      await expect(page.locator(`h1:has-text("${deleteProject.name}")`)).toBeVisible()
    })

    test('should delete project and redirect to Dashboard when confirmed', async ({ page }) => {
      await gotoDashboard(page)

      // Add project if not exists
      let projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject2.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)

      if (!projectExists) {
        await addProjectViaPath(page, deleteProject2.path)
      }

      projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject2.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Click delete button
      const deleteButton = page.getByTestId('delete-project-button')
      await expect(deleteButton).toBeVisible({ timeout: 10000 })
      await deleteButton.click()

      // Wait for dialog
      const dialog = page.getByTestId('delete-confirm-dialog')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Click confirm
      const confirmButton = page.getByTestId('confirm-delete-button')
      await confirmButton.click()

      // Should redirect to dashboard
      await page.waitForURL('/')
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 })

      // Project card should no longer be visible
      projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject2.name}")`)
      await expect(projectCard).not.toBeVisible({ timeout: 5000 })

      // Success toast should appear
      await expect(page.locator('text=Project removed from Ralph')).toBeVisible({ timeout: 5000 })
    })

    test('should preserve project files on disk after delete', async ({ page }) => {
      // Create a new project for this test
      const filePreserveProject = await createTestProject('file-preserve-test')
      testProjects.push(filePreserveProject.path)

      await gotoDashboard(page)

      // Add the project
      await addProjectViaPath(page, filePreserveProject.path)

      // Verify project exists
      const projectCard = page.locator(`a[href^="/project/"]:has-text("${filePreserveProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })

      // Navigate to project
      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Delete the project
      const deleteButton = page.getByTestId('delete-project-button')
      await expect(deleteButton).toBeVisible({ timeout: 10000 })
      await deleteButton.click()

      const dialog = page.getByTestId('delete-confirm-dialog')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      const confirmButton = page.getByTestId('confirm-delete-button')
      await confirmButton.click()

      // Should redirect to dashboard
      await page.waitForURL('/')

      // Verify files still exist on disk
      const prdPath = path.join(filePreserveProject.path, 'stories', 'prd.json')
      expect(fs.existsSync(filePreserveProject.path)).toBe(true)
      expect(fs.existsSync(prdPath)).toBe(true)
    })

    test('should close confirmation dialog when pressing Escape', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${deleteProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })
      await projectCard.click()
      await page.waitForURL(/\/project\/\d+/)
      await page.waitForLoadState('networkidle')

      // Click delete button
      const deleteButton = page.getByTestId('delete-project-button')
      await expect(deleteButton).toBeVisible({ timeout: 10000 })
      await deleteButton.click()

      // Wait for dialog
      const dialog = page.getByTestId('delete-confirm-dialog')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Press Escape
      await page.keyboard.press('Escape')

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 5000 })

      // Should still be on the project page
      await expect(page.locator(`h1:has-text("${deleteProject.name}")`)).toBeVisible()
    })
  })

  test.describe('Project Card Display', () => {
    let cardProject: { path: string; name: string }

    test.beforeAll(async () => {
      cardProject = await createTestProject('card-display')
      testProjects.push(cardProject.path)
    })

    test('should display project card with name, description, and stats', async ({ page }) => {
      await gotoDashboard(page)

      let projectCard = page.locator(`a[href^="/project/"]:has-text("${cardProject.name}")`)
      const projectExists = await projectCard.isVisible().catch(() => false)

      if (!projectExists) {
        await addProjectViaPath(page, cardProject.path)
      }

      projectCard = page.locator(`a[href^="/project/"]:has-text("${cardProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })

      // Check for project name
      await expect(projectCard.locator('h3')).toContainText(cardProject.name)
      // Check for description
      await expect(projectCard.locator('p').first()).toContainText('Test project description')
      // Check for runner status badge (Idle/Running/Stopping)
      await expect(projectCard.locator('text=/idle|running|stopping/i')).toBeVisible()
      // Check for progress bar (first rounded-full element is the progress bar container)
      await expect(projectCard.locator('[class*="rounded-full"]').first()).toBeVisible()
    })

    test('should show story counts on project card', async ({ page }) => {
      await gotoDashboard(page)

      const projectCard = page.locator(`a[href^="/project/"]:has-text("${cardProject.name}")`)
      const exists = await projectCard.isVisible().catch(() => false)

      if (!exists) {
        test.skip()
        return
      }

      await expect(projectCard.locator('text=/\\d+ stor(y|ies)/')).toBeVisible()
    })
  })

  test.describe('Error Handling', () => {
    test('should show error for non-existent project detail page', async ({ page }) => {
      await page.goto('/project/999999')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      await expect(page.locator('text=Project not found')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('a:has-text("Back to Dashboard")')).toBeVisible()
    })
  })

  test.describe('Claude Permissions Setup', () => {
    // Each test creates its own project for isolation
    test.describe.configure({ mode: 'serial' })

    test('should create .claude/settings.local.json when project is added', async ({ page }) => {
      // Create a fresh project just for this test
      const permissionsProject = await createTestProject('permissions-new')
      testProjects.push(permissionsProject.path)

      // Verify settings.local.json does NOT exist before adding project
      const settingsPath = path.join(permissionsProject.path, '.claude', 'settings.local.json')
      const existsBefore = fs.existsSync(settingsPath)
      expect(existsBefore).toBe(false)

      await gotoDashboard(page)

      // Add the project
      await addProjectViaPath(page, permissionsProject.path)

      // Verify project card appears
      const projectCard = page.locator(`a[href^="/project/"]:has-text("${permissionsProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })

      // Verify .claude folder and settings.local.json now exist
      const claudeFolderExists = fs.existsSync(path.join(permissionsProject.path, '.claude'))
      const settingsFileExists = fs.existsSync(settingsPath)
      expect(claudeFolderExists).toBe(true)
      expect(settingsFileExists).toBe(true)

      // Verify the settings content has correct structure
      const settingsContent = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      expect(settingsContent).toHaveProperty('permissions')
      expect(settingsContent.permissions).toHaveProperty('allow')
      expect(settingsContent.permissions).toHaveProperty('deny')
      expect(Array.isArray(settingsContent.permissions.allow)).toBe(true)
      expect(Array.isArray(settingsContent.permissions.deny)).toBe(true)
    })

    test('should not overwrite existing .claude/settings.local.json', async ({ page }) => {
      // Create a project with pre-existing settings
      const existingSettingsProject = await createTestProject('existing-settings')
      testProjects.push(existingSettingsProject.path)

      // Pre-create .claude folder with custom settings
      const claudeFolder = path.join(existingSettingsProject.path, '.claude')
      const settingsPath = path.join(claudeFolder, 'settings.local.json')
      fs.mkdirSync(claudeFolder, { recursive: true })
      const customSettings = {
        permissions: {
          allow: ['CustomPermission'],
          deny: ['CustomDeny'],
        },
      }
      fs.writeFileSync(settingsPath, JSON.stringify(customSettings, null, 2))

      await gotoDashboard(page)

      // Add the project
      await addProjectViaPath(page, existingSettingsProject.path)

      // Verify project card appears
      const projectCard = page.locator(`a[href^="/project/"]:has-text("${existingSettingsProject.name}")`)
      await expect(projectCard).toBeVisible({ timeout: 5000 })

      // Verify the custom settings were NOT overwritten
      const settingsContent = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      expect(settingsContent).toEqual(customSettings)
      expect(settingsContent.permissions.allow).toContain('CustomPermission')
      expect(settingsContent.permissions.deny).toContain('CustomDeny')
    })
  })
})
