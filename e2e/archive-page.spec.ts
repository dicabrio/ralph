import { test, expect, type Page, type Locator } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Generate unique test run ID
const testRunId = "e2e-archive-page";

// Helper: wait for app to be fully hydrated and ready
async function waitForAppReady(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    () => {
      const heading = document.querySelector("h1");
      if (!heading || !heading.textContent?.includes("Dashboard")) {
        return false;
      }
      const buttons = document.querySelectorAll("button");
      return buttons.length > 0;
    },
    { timeout: 15000 },
  );
}

// Helper: navigate to dashboard and wait for ready
async function gotoDashboard(page: Page) {
  await page.goto("/");
  await waitForAppReady(page);
}

// Helper: open Add Project modal and add a project
async function addProjectViaPath(page: Page, projectPath: string) {
  // Click the first Add Project button (in header)
  const addButton = page.getByRole("button", { name: /add project/i }).first();
  await expect(addButton).toBeVisible({ timeout: 10000 });
  await addButton.click();

  // Wait for modal to be visible
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Enter valid project path
  const pathInput = dialog.locator("input#project-path");
  await pathInput.fill(projectPath);

  // Wait for validation
  await page.waitForTimeout(500);
  await expect(dialog.locator("text=Valid project found")).toBeVisible({
    timeout: 5000,
  });

  // Submit the form using the button inside the dialog
  const submitButton = dialog.locator('button[type="submit"]');
  await submitButton.click();

  // Modal should close
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
}

// Helper: navigate to project's Archive page
async function gotoArchivePage(
  page: Page,
  testProject: { path: string; name: string },
) {
  // First ensure project is added
  await ensureProjectAdded(page, testProject);

  // Click on the project card to get the project ID from the URL
  const projectCard = page.locator(
    `a[href^="/project/"]:has-text("${testProject.name}")`,
  );
  await expect(projectCard).toBeVisible({ timeout: 10000 });
  await projectCard.click();

  // Wait for project page
  await page.waitForURL(/\/project\/\d+/);
  await page.waitForLoadState("networkidle");

  // Extract project ID from URL
  const url = page.url();
  const projectIdMatch = url.match(/\/project\/(\d+)/);
  const projectId = projectIdMatch ? projectIdMatch[1] : null;

  if (!projectId) {
    throw new Error(`Could not extract project ID from URL: ${url}`);
  }

  // Navigate directly to the Archive page
  await page.goto(`/project/${projectId}/archive`);
  await page.waitForLoadState("networkidle");

  // Wait for the Archive page content
  await page.waitForFunction(
    () => {
      const content = document.body.textContent || "";
      return (
        content.includes("Archive") ||
        content.includes("No archived stories") ||
        content.includes("archived")
      );
    },
    { timeout: 15000 },
  );
}

// Helper: find an archived story card by exact ID match
function getArchivedStoryCard(page: Page, storyId: string): Locator {
  return page.locator(`[data-testid="archived-story-card-${storyId}"]`);
}

// Create a shared test project that persists for all tests in this file
let sharedTestProject: { path: string; name: string } | null = null;

function getOrCreateTestProject(): { path: string; name: string } {
  const runTimestamp = process.env.TEST_RUN_TS || Date.now().toString();
  if (!sharedTestProject) {
    const name = `archive-test-${testRunId}-${runTimestamp.slice(-6)}`;
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ralph-e2e-archive-"),
    );
    const projectPath = path.join(tempDir, name);
    const storiesDir = path.join(projectPath, "stories");

    fs.mkdirSync(storiesDir, { recursive: true });

    const prdJson = {
      projectName: name,
      projectDescription: `Archive page test project for ${name}`,
      branchName: "feature/archive-test",
      availableSkills: ["frontend-design", "backend-api"],
      epics: [
        { name: "Setup", description: "Initial setup tasks" },
        { name: "Feature", description: "Feature development" },
        { name: "Testing", description: "Testing related" },
      ],
      userStories: [
        {
          id: "DONE-001",
          title: "Completed setup story",
          description: "This story is done but not archived",
          priority: 1,
          status: "done",
          epic: "Setup",
          dependencies: [],
          recommendedSkills: ["frontend-design"],
          acceptanceCriteria: ["Setup is complete"],
        },
        {
          id: "PENDING-001",
          title: "Pending story",
          description: "This story is still pending",
          priority: 2,
          status: "pending",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Feature works"],
        },
      ],
    };

    // Create archived.json with pre-populated archived stories
    const archivedJson = {
      projectName: name,
      archivedStories: [
        {
          id: "ARCH-001",
          title: "First archived story",
          description: "This is the first archived story with OAuth integration",
          priority: 10,
          status: "done",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: ["frontend-design"],
          acceptanceCriteria: ["Feature is complete", "Tests pass"],
          archivedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        },
        {
          id: "ARCH-002",
          title: "Second archived story",
          description: "This is the second archived story about dashboard",
          priority: 20,
          status: "done",
          epic: "Setup",
          dependencies: ["ARCH-001"],
          recommendedSkills: ["backend-api"],
          acceptanceCriteria: ["Setup complete", "Documentation updated"],
          archivedAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        },
        {
          id: "ARCH-003",
          title: "Third archived story",
          description: "Authentication feature implementation",
          priority: 30,
          status: "done",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Auth works"],
          archivedAt: new Date(Date.now() - 604800000).toISOString(), // 1 week ago
        },
        {
          id: "TEST-ARCH-001",
          title: "Testing archived story",
          description: "A story from the Testing epic",
          priority: 40,
          status: "done",
          epic: "Testing",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Tests written"],
          archivedAt: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
        },
      ],
    };

    fs.writeFileSync(
      path.join(storiesDir, "prd.json"),
      JSON.stringify(prdJson, null, 2),
    );
    fs.writeFileSync(
      path.join(storiesDir, "archived.json"),
      JSON.stringify(archivedJson, null, 2),
    );
    sharedTestProject = { path: projectPath, name };
  }
  return sharedTestProject;
}

// Helper to ensure project is added to the dashboard
async function ensureProjectAdded(
  page: Page,
  testProject: { path: string; name: string },
) {
  await gotoDashboard(page);

  const projectCard = page.locator(
    `a[href^="/project/"]:has-text("${testProject.name}")`,
  );
  const projectExists = await projectCard.isVisible().catch(() => false);
  if (!projectExists) {
    await addProjectViaPath(page, testProject.path);
    await page.waitForTimeout(500);
  }
}

test.describe("Archive Page (REVIEW-004)", () => {
  // Configure tests to run serially to avoid race conditions on shared project
  test.describe.configure({ mode: "serial" });

  let testProject: { path: string; name: string };

  test.beforeAll(async () => {
    // Always create a fresh project for this test run
    sharedTestProject = null;
    testProject = getOrCreateTestProject();
  });

  test.describe("Page Display", () => {
    test("should add test project and navigate to Archive page", async ({
      page,
    }) => {
      await gotoArchivePage(page, testProject);

      // Verify we're on the Archive page
      await expect(page.locator('[data-testid="archive-board"]')).toBeVisible();
      await expect(page.locator("text=Archive")).toBeVisible();
    });

    test("should display archived stories count", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Should show "4 archived" badge
      await expect(page.locator("text=4 archived")).toBeVisible();
    });

    test("should display archived story cards", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      await page.waitForTimeout(500);

      // All 4 archived stories should be visible
      await expect(getArchivedStoryCard(page, "ARCH-001")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-002")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-003")).toBeVisible();
      await expect(getArchivedStoryCard(page, "TEST-ARCH-001")).toBeVisible();
    });

    test("should sort stories by archivedAt (newest first)", async ({
      page,
    }) => {
      await gotoArchivePage(page, testProject);

      // Get all archived story cards
      const storyCards = page.locator('[data-testid^="archived-story-card-"]');
      const count = await storyCards.count();
      expect(count).toBe(4);

      // First card should be ARCH-001 (archived 1 day ago - newest)
      const firstCard = storyCards.first();
      await expect(firstCard).toContainText("ARCH-001");
    });

    test("should display story info: ID, title, epic, priority", async ({
      page,
    }) => {
      await gotoArchivePage(page, testProject);

      const storyCard = getArchivedStoryCard(page, "ARCH-001");
      await expect(storyCard).toBeVisible();

      // Check story ID
      await expect(storyCard.locator('[data-testid="story-id"]')).toHaveText(
        "ARCH-001",
      );

      // Check title
      await expect(
        storyCard.locator('[data-testid="story-title"]'),
      ).toContainText("First archived story");

      // Check epic
      await expect(storyCard.locator('[data-testid="story-epic"]')).toHaveText(
        "Feature",
      );

      // Check priority badge
      await expect(
        storyCard.locator('[data-testid="priority-badge"]'),
      ).toContainText("P10");
    });

    test("should display relative timestamp", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const storyCard = getArchivedStoryCard(page, "ARCH-001");
      await expect(storyCard).toBeVisible();

      // Should show relative time (e.g., "1 dag geleden")
      await expect(storyCard.locator('[data-testid="archived-at"]')).toContainText("geleden");
    });
  });

  test.describe("Search Filtering", () => {
    test("should display search input", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const searchInput = page.locator('[data-testid="search-input"]');
      await expect(searchInput).toBeVisible();
    });

    test("should filter by story ID", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill("ARCH-001");

      // Wait for debounce
      await page.waitForTimeout(400);

      // Only ARCH-001 should be visible
      await expect(getArchivedStoryCard(page, "ARCH-001")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-002")).not.toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-003")).not.toBeVisible();
    });

    test("should filter by title (case insensitive)", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill("dashboard");

      // Wait for debounce
      await page.waitForTimeout(400);

      // Only ARCH-002 should be visible (title contains "dashboard")
      await expect(getArchivedStoryCard(page, "ARCH-002")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-001")).not.toBeVisible();
    });

    test("should filter by description", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill("oauth");

      // Wait for debounce
      await page.waitForTimeout(400);

      // Only ARCH-001 should be visible (description contains "OAuth")
      await expect(getArchivedStoryCard(page, "ARCH-001")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-002")).not.toBeVisible();
    });

    test("should show empty state when no search matches", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill("nonexistent");

      // Wait for debounce
      await page.waitForTimeout(400);

      // Empty filtered state should appear
      await expect(
        page.locator('[data-testid="empty-state-filtered"]'),
      ).toBeVisible();
      await expect(page.locator("text=No matching stories")).toBeVisible();
    });

    test("should clear search when clicking X button", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill("ARCH-001");

      // Wait for debounce
      await page.waitForTimeout(400);

      // Only one story visible
      await expect(getArchivedStoryCard(page, "ARCH-001")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-002")).not.toBeVisible();

      // Click clear button
      await page.locator('button[aria-label="Clear search"]').click();

      // All stories should be visible again
      await page.waitForTimeout(400);
      await expect(getArchivedStoryCard(page, "ARCH-001")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-002")).toBeVisible();
    });
  });

  test.describe("Epic Filtering", () => {
    test("should display epic filter dropdown", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      const epicFilter = page.locator('[data-testid="epic-filter"]');
      await expect(epicFilter).toBeVisible();
    });

    test("should filter by epic", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Open the epic filter dropdown
      const epicFilter = page.locator('[data-testid="epic-filter"]');
      await epicFilter.click();

      // Select "Setup" epic
      await page.locator('[data-slot="select-item"]:has-text("Setup")').click();

      // Wait for filter to apply
      await page.waitForTimeout(300);

      // Only ARCH-002 should be visible (epic is "Setup")
      await expect(getArchivedStoryCard(page, "ARCH-002")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-001")).not.toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-003")).not.toBeVisible();
    });

    test("should show all epics in dropdown", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Open the epic filter dropdown
      const epicFilter = page.locator('[data-testid="epic-filter"]');
      await epicFilter.click();

      // Should have "All epics" and the unique epics
      await expect(
        page.locator('[data-slot="select-item"]:has-text("All epics")'),
      ).toBeVisible();
      await expect(
        page.locator('[data-slot="select-item"]:has-text("Feature")'),
      ).toBeVisible();
      await expect(
        page.locator('[data-slot="select-item"]:has-text("Setup")'),
      ).toBeVisible();
      await expect(
        page.locator('[data-slot="select-item"]:has-text("Testing")'),
      ).toBeVisible();
    });
  });

  test.describe("Combined Filters", () => {
    test("should combine search and epic filters", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Set epic filter to "Feature"
      const epicFilter = page.locator('[data-testid="epic-filter"]');
      await epicFilter.click();
      await page.locator('[data-slot="select-item"]:has-text("Feature")').click();

      // Wait for filter to apply
      await page.waitForTimeout(300);

      // Should show 2 Feature stories (ARCH-001 and ARCH-003)
      await expect(getArchivedStoryCard(page, "ARCH-001")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-003")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-002")).not.toBeVisible();

      // Now add search filter
      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill("authentication");

      // Wait for debounce
      await page.waitForTimeout(400);

      // Only ARCH-003 should be visible (Feature epic + "authentication" in description)
      await expect(getArchivedStoryCard(page, "ARCH-003")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-001")).not.toBeVisible();
    });

    test("should show results count when filters active", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Set epic filter to "Feature"
      const epicFilter = page.locator('[data-testid="epic-filter"]');
      await epicFilter.click();
      await page.locator('[data-slot="select-item"]:has-text("Feature")').click();

      // Wait for filter to apply
      await page.waitForTimeout(300);

      // Should show "2 of 4 stories"
      await expect(page.locator("text=2 of 4 stories")).toBeVisible();
    });

    test("should clear all filters with Clear filters button", async ({
      page,
    }) => {
      await gotoArchivePage(page, testProject);

      // Set search filter
      const searchInput = page.locator('[data-testid="search-input"]');
      await searchInput.fill("ARCH");

      // Set epic filter
      const epicFilter = page.locator('[data-testid="epic-filter"]');
      await epicFilter.click();
      await page.locator('[data-slot="select-item"]:has-text("Feature")').click();

      // Wait for filters
      await page.waitForTimeout(400);

      // Click Clear filters button
      await page.locator('[data-testid="clear-filters"]').click();

      // Wait for reset
      await page.waitForTimeout(400);

      // All stories should be visible
      await expect(getArchivedStoryCard(page, "ARCH-001")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-002")).toBeVisible();
      await expect(getArchivedStoryCard(page, "ARCH-003")).toBeVisible();
      await expect(getArchivedStoryCard(page, "TEST-ARCH-001")).toBeVisible();
    });
  });

  test.describe("Story Detail Modal", () => {
    test("should open story detail modal when clicking on card", async ({
      page,
    }) => {
      await gotoArchivePage(page, testProject);

      // Click on story card
      await getArchivedStoryCard(page, "ARCH-001").click();

      // Modal should open
      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();
    });

    test("should display story details in modal", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Click on story card
      await getArchivedStoryCard(page, "ARCH-001").click();

      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();

      // Check content
      await expect(modal).toContainText("ARCH-001");
      await expect(modal).toContainText("First archived story");
      await expect(modal).toContainText("Description");
      await expect(modal).toContainText("OAuth integration");
      await expect(modal).toContainText("Epic");
      await expect(modal).toContainText("Feature");
      await expect(modal).toContainText("Acceptance Criteria");
      await expect(modal).toContainText("Feature is complete");
    });

    test("should display archived badge in modal", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Click on story card
      await getArchivedStoryCard(page, "ARCH-001").click();

      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toContainText("Archived");
    });

    test("should close modal when pressing Escape", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Click on story card
      await getArchivedStoryCard(page, "ARCH-001").click();

      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();

      // Press Escape
      await page.keyboard.press("Escape");

      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Empty State", () => {
    test("should display empty state for project without archived stories", async ({
      page,
    }) => {
      // Create a project without archived.json
      const emptyProjectName = `empty-archive-${Date.now().toString().slice(-6)}`;
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "ralph-e2e-empty-archive-"),
      );
      const projectPath = path.join(tempDir, emptyProjectName);
      const storiesDir = path.join(projectPath, "stories");

      fs.mkdirSync(storiesDir, { recursive: true });

      const prdJson = {
        projectName: emptyProjectName,
        projectDescription: "Empty archive test project",
        branchName: "main",
        availableSkills: [],
        epics: [],
        userStories: [
          {
            id: "STORY-001",
            title: "Test story",
            description: "A test story",
            priority: 1,
            status: "pending",
            epic: "Test",
            dependencies: [],
            recommendedSkills: [],
            acceptanceCriteria: [],
          },
        ],
      };

      fs.writeFileSync(
        path.join(storiesDir, "prd.json"),
        JSON.stringify(prdJson, null, 2),
      );

      // Navigate to this project's archive
      await gotoDashboard(page);
      await addProjectViaPath(page, projectPath);

      const projectCard = page.locator(
        `a[href^="/project/"]:has-text("${emptyProjectName}")`,
      );
      await projectCard.click();
      await page.waitForURL(/\/project\/\d+/);

      const url = page.url();
      const projectIdMatch = url.match(/\/project\/(\d+)/);
      const projectId = projectIdMatch ? projectIdMatch[1] : null;

      await page.goto(`/project/${projectId}/archive`);
      await page.waitForLoadState("networkidle");

      // Empty state should appear
      await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
      await expect(page.locator("text=No archived stories")).toBeVisible();
    });
  });

  test.describe("Navigation", () => {
    test("should navigate back to Testing page", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Click Back link
      const backLink = page.locator('a:has-text("Test Board")');
      await expect(backLink).toBeVisible();
      await backLink.click();

      // Should be on Testing page
      await page.waitForURL(/\/project\/\d+\/testing/);
    });

    test("should display project name in header", async ({ page }) => {
      await gotoArchivePage(page, testProject);

      // Project name should be visible
      await expect(
        page.locator(`h1:has-text("${testProject.name}")`),
      ).toBeVisible();
    });

    test("should have link from Testing page to Archive", async ({ page }) => {
      // Navigate to Testing page first
      await ensureProjectAdded(page, testProject);

      const projectCard = page.locator(
        `a[href^="/project/"]:has-text("${testProject.name}")`,
      );
      await projectCard.click();
      await page.waitForURL(/\/project\/\d+/);

      const url = page.url();
      const projectIdMatch = url.match(/\/project\/(\d+)/);
      const projectId = projectIdMatch ? projectIdMatch[1] : null;

      await page.goto(`/project/${projectId}/testing`);
      await page.waitForLoadState("networkidle");

      // Should have Archive link in header
      const archiveLink = page.locator('a:has-text("Archive")');
      await expect(archiveLink).toBeVisible();

      // Click it
      await archiveLink.click();

      // Should be on Archive page
      await page.waitForURL(/\/project\/\d+\/archive/);
    });
  });

  test.describe("Loading and Error States", () => {
    test("should show error state for non-existent project", async ({
      page,
    }) => {
      // Navigate to non-existent project
      await page.goto("/project/99999/archive");
      await page.waitForLoadState("networkidle");

      // Should show error state
      await expect(page.locator('[data-testid="error-state"]')).toBeVisible({
        timeout: 10000,
      });
    });
  });
});
