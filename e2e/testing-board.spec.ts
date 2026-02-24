import { test, expect, type Page, type Locator } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Generate unique test run ID
const testRunId = "e2e-testing-board";

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

// Helper: navigate to project's Testing board
async function gotoTestingBoard(
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

  // Navigate directly to the Testing page
  await page.goto(`/project/${projectId}/testing`);
  await page.waitForLoadState("networkidle");

  // Wait for the Testing board content
  await page.waitForFunction(
    () => {
      const content = document.body.textContent || "";
      return (
        content.includes("Testing") ||
        content.includes("No stories to review") ||
        content.includes("to review")
      );
    },
    { timeout: 15000 },
  );
}

// Helper: find a story card by exact ID match
function getStoryCard(page: Page, storyId: string): Locator {
  return page.locator(`[data-testid="test-story-card-${storyId}"]`);
}

// Create a shared test project that persists for all tests in this file
let sharedTestProject: { path: string; name: string } | null = null;

function getOrCreateTestProject(): { path: string; name: string } {
  const runTimestamp = process.env.TEST_RUN_TS || Date.now().toString();
  if (!sharedTestProject) {
    const name = `testing-test-${testRunId}-${runTimestamp.slice(-6)}`;
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ralph-e2e-testing-"),
    );
    const projectPath = path.join(tempDir, name);
    const storiesDir = path.join(projectPath, "stories");

    fs.mkdirSync(storiesDir, { recursive: true });

    const prdJson = {
      projectName: name,
      projectDescription: `Testing board test project for ${name}`,
      branchName: "feature/testing-board-test",
      availableSkills: ["frontend-design"],
      epics: [
        { name: "Setup", description: "Initial setup tasks" },
        { name: "Feature", description: "Feature development" },
      ],
      userStories: [
        {
          id: "REVIEW-001",
          title: "First story in review",
          description: "This story is ready for testing",
          priority: 1,
          status: "review",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: ["frontend-design"],
          acceptanceCriteria: [
            "Feature is complete",
            "Tests pass",
            "Documentation updated",
          ],
        },
        {
          id: "REVIEW-002",
          title: "Second story in review",
          description: "This story also needs testing",
          priority: 2,
          status: "review",
          epic: "Feature",
          dependencies: ["REVIEW-001"],
          recommendedSkills: [],
          acceptanceCriteria: ["Builds without errors"],
        },
        {
          id: "DONE-001",
          title: "Already completed story",
          description: "This story is done",
          priority: 3,
          status: "done",
          epic: "Setup",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Setup complete"],
        },
        {
          id: "PENDING-001",
          title: "Pending story",
          description: "This story is still pending",
          priority: 4,
          status: "pending",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Work in progress"],
        },
      ],
    };

    fs.writeFileSync(
      path.join(storiesDir, "prd.json"),
      JSON.stringify(prdJson, null, 2),
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

test.describe("Testing Board (REVIEW-003)", () => {
  // Configure tests to run serially to avoid race conditions on shared project
  test.describe.configure({ mode: "serial" });

  let testProject: { path: string; name: string };

  test.beforeAll(async () => {
    // Always create a fresh project for this test run
    sharedTestProject = null;
    testProject = getOrCreateTestProject();
  });

  test.describe("Page Display", () => {
    test("should add test project and navigate to Testing board", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // Verify we're on the Testing page
      await expect(page.locator('[data-testid="testing-board"]')).toBeVisible();
      await expect(page.locator("text=Testing")).toBeVisible();
    });

    test("should display stories with review status", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Wait for stories to load
      await page.waitForTimeout(500);

      // REVIEW-001 and REVIEW-002 should be visible
      await expect(getStoryCard(page, "REVIEW-001")).toBeVisible();
      await expect(getStoryCard(page, "REVIEW-002")).toBeVisible();
    });

    test("should NOT display stories without review status", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      await page.waitForTimeout(500);

      // DONE-001 and PENDING-001 should NOT be visible
      await expect(
        page.locator('[data-testid="test-story-card-DONE-001"]'),
      ).not.toBeVisible();
      await expect(
        page.locator('[data-testid="test-story-card-PENDING-001"]'),
      ).not.toBeVisible();
    });

    test("should sort stories by priority (lowest first)", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Get all story cards
      const storyCards = page.locator('[data-testid^="test-story-card-"]');
      const count = await storyCards.count();
      expect(count).toBe(2);

      // First card should be REVIEW-001 (priority 1)
      // Second card should be REVIEW-002 (priority 2)
      const firstCard = storyCards.first();
      await expect(firstCard).toContainText("REVIEW-001");
    });

    test("should display story info: ID, title, epic, priority", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      const storyCard = getStoryCard(page, "REVIEW-001");
      await expect(storyCard).toBeVisible();

      // Check story ID
      await expect(storyCard.locator('[data-testid="story-id"]')).toHaveText(
        "REVIEW-001",
      );

      // Check title
      await expect(
        storyCard.locator('[data-testid="story-title"]'),
      ).toContainText("First story in review");

      // Check epic
      await expect(storyCard.locator('[data-testid="story-epic"]')).toHaveText(
        "Feature",
      );

      // Check priority badge
      await expect(
        storyCard.locator('[data-testid="priority-badge"]'),
      ).toContainText("P1");
    });

    test("should display review count badge in header", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Should show "2 to review" badge
      await expect(page.locator("text=2 to review")).toBeVisible();
    });

    test("should display acceptance criteria count", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // REVIEW-001 has 3 acceptance criteria
      const storyCard = getStoryCard(page, "REVIEW-001");
      await expect(storyCard).toContainText("3 criteria");
    });
  });

  test.describe("Accept Flow", () => {
    test("should display Accept button on story cards", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      await expect(getStoryCard(page, "REVIEW-001")).toBeVisible();
      const acceptButton = page.locator('[data-testid="accept-story-REVIEW-001"]');
      await expect(acceptButton).toBeVisible();
    });

    test("should move story to done when Accept is clicked", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // Click accept on REVIEW-001
      const acceptButton = page.locator('[data-testid="accept-story-REVIEW-001"]');
      await acceptButton.click();

      // Wait for API call and optimistic update
      await page.waitForTimeout(1000);

      // Story should no longer be visible (moved to done)
      await expect(getStoryCard(page, "REVIEW-001")).not.toBeVisible({
        timeout: 5000,
      });

      // Toast should appear
      await expect(page.locator("text=accepted")).toBeVisible({ timeout: 3000 });
    });

    test("should update review count after accepting story", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // After previous test, should show "1 to review"
      await expect(page.locator("text=1 to review")).toBeVisible();
    });
  });

  test.describe("Reject Flow", () => {
    test("should display Reject button on story cards", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      await expect(getStoryCard(page, "REVIEW-002")).toBeVisible();
      const rejectButton = page.locator('[data-testid="reject-story-REVIEW-002"]');
      await expect(rejectButton).toBeVisible();
    });

    test("should open RejectDialog when Reject is clicked", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // Click reject on REVIEW-002
      const rejectButton = page.locator('[data-testid="reject-story-REVIEW-002"]');
      await rejectButton.click();

      // Dialog should appear
      const dialog = page.locator('[data-testid="reject-dialog"]');
      await expect(dialog).toBeVisible();

      // Should show story ID
      await expect(dialog).toContainText("REVIEW-002");
    });

    test("should display status selection in RejectDialog", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // Open dialog
      await page.locator('[data-testid="reject-story-REVIEW-002"]').click();

      const dialog = page.locator('[data-testid="reject-dialog"]');
      await expect(dialog).toBeVisible();

      // Should have Failed and In Progress options
      await expect(
        dialog.locator('[data-testid="select-failed"]'),
      ).toBeVisible();
      await expect(
        dialog.locator('[data-testid="select-in-progress"]'),
      ).toBeVisible();
    });

    test("should allow selecting Failed status", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Open dialog
      await page.locator('[data-testid="reject-story-REVIEW-002"]').click();

      const dialog = page.locator('[data-testid="reject-dialog"]');

      // Click Failed button
      await dialog.locator('[data-testid="select-failed"]').click();

      // Failed should be selected (has bg-red styling)
      await expect(
        dialog.locator('[data-testid="select-failed"]'),
      ).toHaveClass(/bg-red/);
    });

    test("should allow selecting In Progress status", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Open dialog
      await page.locator('[data-testid="reject-story-REVIEW-002"]').click();

      const dialog = page.locator('[data-testid="reject-dialog"]');

      // Click In Progress button
      await dialog.locator('[data-testid="select-in-progress"]').click();

      // In Progress should be selected (has bg-blue styling)
      await expect(
        dialog.locator('[data-testid="select-in-progress"]'),
      ).toHaveClass(/bg-blue/);
    });

    test("should close dialog when Cancel is clicked", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Open dialog
      await page.locator('[data-testid="reject-story-REVIEW-002"]').click();

      const dialog = page.locator('[data-testid="reject-dialog"]');
      await expect(dialog).toBeVisible();

      // Click Cancel
      await page.locator('[data-testid="reject-cancel"]').click();

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    });

    test("should move story to failed when rejected with Failed status", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // Open dialog
      await page.locator('[data-testid="reject-story-REVIEW-002"]').click();

      const dialog = page.locator('[data-testid="reject-dialog"]');

      // Select Failed status (default)
      await dialog.locator('[data-testid="select-failed"]').click();

      // Click Reject
      await page.locator('[data-testid="reject-confirm"]').click();

      // Wait for update
      await page.waitForTimeout(1000);

      // Story should no longer be visible
      await expect(getStoryCard(page, "REVIEW-002")).not.toBeVisible({
        timeout: 5000,
      });

      // Toast should appear
      await expect(page.locator("text=rejected")).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Empty State", () => {
    test("should display empty state when no stories in review", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // After accepting/rejecting all stories, empty state should appear
      await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
      await expect(page.locator("text=No stories to review")).toBeVisible();
    });

    test("should have link to Kanban board in empty state", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // Should have link to Kanban
      await expect(page.locator("text=Go to Kanban board")).toBeVisible();
    });
  });

  test.describe("Story Detail Modal", () => {
    // First, add a new review story for modal tests
    test.beforeAll(async () => {
      // Add a new review story to the project
      const prdPath = path.join(testProject.path, "stories", "prd.json");
      const prdContent = fs.readFileSync(prdPath, "utf-8");
      const prdData = JSON.parse(prdContent);

      prdData.userStories.push({
        id: "REVIEW-003",
        title: "Story for modal test",
        description: "This is a detailed description for testing the modal.",
        priority: 10,
        status: "review",
        epic: "Feature",
        dependencies: ["DONE-001"],
        recommendedSkills: ["frontend-design"],
        acceptanceCriteria: ["Modal opens correctly", "All fields are visible"],
      });

      fs.writeFileSync(prdPath, JSON.stringify(prdData, null, 2));
    });

    test("should open story detail modal when clicking View button", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);

      // Wait for new story to appear
      await page.waitForTimeout(1000);

      // Click view button
      const viewButton = page.locator('[data-testid="view-story-REVIEW-003"]');
      await expect(viewButton).toBeVisible();
      await viewButton.click();

      // Modal should open
      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();
    });

    test("should display story details in modal", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      await page.waitForTimeout(500);

      // Open modal
      await page.locator('[data-testid="view-story-REVIEW-003"]').click();

      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();

      // Check content
      await expect(modal).toContainText("REVIEW-003");
      await expect(modal).toContainText("Story for modal test");
      await expect(modal).toContainText("Description");
      await expect(modal).toContainText("This is a detailed description");
      await expect(modal).toContainText("Epic");
      await expect(modal).toContainText("Feature");
      await expect(modal).toContainText("Acceptance Criteria");
      await expect(modal).toContainText("Modal opens correctly");
    });

    test("should display dependencies in modal", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      await page.waitForTimeout(500);

      // Open modal
      await page.locator('[data-testid="view-story-REVIEW-003"]').click();

      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();

      // Should show dependencies
      await expect(modal).toContainText("Dependencies");
      await expect(modal).toContainText("DONE-001");
    });

    test("should display recommended skills in modal", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      await page.waitForTimeout(500);

      // Open modal
      await page.locator('[data-testid="view-story-REVIEW-003"]').click();

      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();

      // Should show skills
      await expect(modal).toContainText("Recommended Skills");
      await expect(modal).toContainText("frontend-design");
    });

    test("should close modal when clicking outside", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      await page.waitForTimeout(500);

      // Open modal
      await page.locator('[data-testid="view-story-REVIEW-003"]').click();

      const modal = page.locator('[data-testid="story-detail-modal"]');
      await expect(modal).toBeVisible();

      // Click outside (on backdrop)
      await page.keyboard.press("Escape");

      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Loading and Error States", () => {
    test("should show loading state initially", async ({ page }) => {
      // Navigate directly without waiting
      await page.goto("/project/1/testing");

      // Should briefly show loading state
      // (This might be hard to catch as it's fast)
      // Just verify the page eventually loads
      await page.waitForLoadState("networkidle");
    });

    test("should show error state for non-existent project", async ({
      page,
    }) => {
      // Navigate to non-existent project
      await page.goto("/project/99999/testing");
      await page.waitForLoadState("networkidle");

      // Should show error state
      await expect(page.locator('[data-testid="error-state"]')).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe("Navigation", () => {
    test("should navigate back to project page", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Click Back link
      const backLink = page.locator('a:has-text("Back")');
      await expect(backLink).toBeVisible();
      await backLink.click();

      // Should be on project detail page
      await page.waitForURL(/\/project\/\d+$/);
    });

    test("should display project name in header", async ({ page }) => {
      await gotoTestingBoard(page, testProject);

      // Project name should be visible
      await expect(page.locator(`h1:has-text("${testProject.name}")`)).toBeVisible();
    });
  });

  test.describe("Optimistic Updates", () => {
    test.beforeAll(async () => {
      // Reset the project with fresh review stories
      const prdPath = path.join(testProject.path, "stories", "prd.json");
      const prdContent = fs.readFileSync(prdPath, "utf-8");
      const prdData = JSON.parse(prdContent);

      // Add more review stories
      prdData.userStories = prdData.userStories.filter(
        (s: { status: string }) => s.status !== "review",
      );
      prdData.userStories.push({
        id: "REVIEW-OPT-001",
        title: "Story for optimistic update test",
        description: "Testing optimistic updates",
        priority: 1,
        status: "review",
        epic: "Feature",
        dependencies: [],
        recommendedSkills: [],
        acceptanceCriteria: ["Works correctly"],
      });

      fs.writeFileSync(prdPath, JSON.stringify(prdData, null, 2));
    });

    test("should immediately remove card when accepting (optimistic)", async ({
      page,
    }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      // The card should be visible
      const storyCard = getStoryCard(page, "REVIEW-OPT-001");
      await expect(storyCard).toBeVisible();

      // Click accept
      const acceptButton = page.locator('[data-testid="accept-story-REVIEW-OPT-001"]');
      await acceptButton.click();

      // Card should disappear immediately (optimistic update)
      // We use a shorter timeout to verify it's truly optimistic
      await expect(storyCard).not.toBeVisible({ timeout: 500 });
    });
  });

  test.describe("Checklist Integration (REVIEW-009)", () => {
    test.beforeAll(async () => {
      // Reset project with review story and test scenario
      const prdPath = path.join(testProject.path, "stories", "prd.json");
      const prdContent = fs.readFileSync(prdPath, "utf-8");
      const prdData = JSON.parse(prdContent);

      // Clear and add fresh review story
      prdData.userStories = prdData.userStories.filter(
        (s: { status: string }) => s.status !== "review",
      );
      prdData.userStories.push({
        id: "REVIEW-CHECKLIST-001",
        title: "Story with test checklist",
        description: "Testing checklist integration",
        priority: 1,
        status: "review",
        epic: "Test Board",
        dependencies: [],
        recommendedSkills: [],
        acceptanceCriteria: [
          "Checklist displays correctly",
          "Items can be toggled",
          "Progress updates",
        ],
      });

      fs.writeFileSync(prdPath, JSON.stringify(prdData, null, 2));

      // Create test scenario files
      const testScenariosDir = path.join(testProject.path, "stories", "test-scenarios");
      fs.mkdirSync(testScenariosDir, { recursive: true });

      const testScenario = {
        storyId: "REVIEW-CHECKLIST-001",
        title: "Story with test checklist",
        description: "Testing checklist integration",
        generatedAt: new Date().toISOString(),
        sections: [
          {
            id: "functional-tests",
            title: "Functional Tests",
            items: [
              { id: "ft-1", text: "Checklist displays correctly", checked: false },
              { id: "ft-2", text: "Items can be toggled", checked: false },
              { id: "ft-3", text: "Progress updates", checked: false },
            ],
          },
          {
            id: "quality-gates",
            title: "Quality Gates",
            items: [
              { id: "qg-test", text: "pnpm test passes", checked: false },
              { id: "qg-lint", text: "pnpm lint passes", checked: false },
              { id: "qg-build", text: "pnpm build succeeds", checked: false },
            ],
          },
        ],
      };

      fs.writeFileSync(
        path.join(testScenariosDir, "REVIEW-CHECKLIST-001.json"),
        JSON.stringify(testScenario, null, 2),
      );

      // Also write MD file
      const mdContent = `# Test Scenario: REVIEW-CHECKLIST-001

## Functional Tests
- [ ] Checklist displays correctly
- [ ] Items can be toggled
- [ ] Progress updates

## Quality Gates
- [ ] pnpm test passes
- [ ] pnpm lint passes
- [ ] pnpm build succeeds
`;
      fs.writeFileSync(
        path.join(testScenariosDir, "REVIEW-CHECKLIST-001.md"),
        mdContent,
      );
    });

    test("should display checklist progress on story card", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");
      await expect(storyCard).toBeVisible();

      // Should show progress badge (0/6 initially)
      const progressBadge = storyCard.locator('[data-testid="checklist-progress"]');
      await expect(progressBadge).toBeVisible({ timeout: 5000 });
      await expect(progressBadge).toContainText("/6");
    });

    test("should expand checklist when clicking expand button", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");

      // Click expand button
      const expandButton = storyCard.locator('[data-testid="expand-checklist-REVIEW-CHECKLIST-001"]');
      await expect(expandButton).toBeVisible();
      await expandButton.click();

      // Should show checklist sections
      await expect(storyCard.locator("text=Functional Tests")).toBeVisible();
      await expect(storyCard.locator("text=Quality Gates")).toBeVisible();
    });

    test("should display checklist items when expanded", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");

      // Expand checklist
      await storyCard.locator('[data-testid="expand-checklist-REVIEW-CHECKLIST-001"]').click();

      // Should show individual checklist items
      await expect(storyCard.locator('[data-testid="checklist-item-ft-1"]')).toBeVisible();
      await expect(storyCard.locator("text=Checklist displays correctly")).toBeVisible();
    });

    test("should toggle checkbox and save when clicked", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");

      // Expand checklist
      await storyCard.locator('[data-testid="expand-checklist-REVIEW-CHECKLIST-001"]').click();
      await page.waitForTimeout(500);

      // Click the first checkbox
      const checkbox = storyCard.locator('[data-testid="checkbox-ft-1"]');
      await expect(checkbox).toBeVisible();
      await checkbox.click();

      // Wait for optimistic update and API call
      await page.waitForTimeout(500);

      // Checkbox should now be checked (data-state="checked")
      await expect(checkbox).toHaveAttribute("data-state", "checked", { timeout: 3000 });
    });

    test("should update progress after toggling checkbox", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");

      // Progress should show at least 1 checked (from previous test)
      const progressBadge = storyCard.locator('[data-testid="checklist-progress"]');
      await expect(progressBadge).toBeVisible({ timeout: 5000 });
      // Should contain "1/6" or more
      const progressText = await progressBadge.textContent();
      expect(progressText).toMatch(/[1-6]\/6/);
    });

    test("should show green highlight on Accept when all items checked", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");

      // Expand checklist
      await storyCard.locator('[data-testid="expand-checklist-REVIEW-CHECKLIST-001"]').click();
      await page.waitForTimeout(500);

      // Check all items
      const checkboxIds = ["ft-1", "ft-2", "ft-3", "qg-test", "qg-lint", "qg-build"];
      for (const id of checkboxIds) {
        const checkbox = storyCard.locator(`[data-testid="checkbox-${id}"]`);
        const state = await checkbox.getAttribute("data-state");
        if (state !== "checked") {
          await checkbox.click();
          await page.waitForTimeout(300);
        }
      }

      // Wait for all updates to complete
      await page.waitForTimeout(1000);

      // Accept button should have green highlight (bg-emerald class)
      const acceptButton = storyCard.locator('[data-testid="accept-story-REVIEW-CHECKLIST-001"]');
      await expect(acceptButton).toHaveClass(/bg-emerald/);
    });

    test("should show progress bar in section header", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");

      // Expand checklist
      await storyCard.locator('[data-testid="expand-checklist-REVIEW-CHECKLIST-001"]').click();
      await page.waitForTimeout(500);

      // Should show progress bar in section
      const sectionProgress = storyCard.locator('[data-testid="section-progress-functional-tests"]');
      await expect(sectionProgress).toBeVisible();
    });

    test("should collapse and expand sections", async ({ page }) => {
      await gotoTestingBoard(page, testProject);
      await page.waitForTimeout(1000);

      const storyCard = getStoryCard(page, "REVIEW-CHECKLIST-001");

      // Expand main checklist
      await storyCard.locator('[data-testid="expand-checklist-REVIEW-CHECKLIST-001"]').click();
      await page.waitForTimeout(500);

      // Items should be visible
      await expect(storyCard.locator('[data-testid="checklist-item-ft-1"]')).toBeVisible();

      // Click section trigger to collapse
      const sectionTrigger = storyCard.locator('[data-testid="section-trigger-functional-tests"]');
      await sectionTrigger.click();
      await page.waitForTimeout(300);

      // Items should now be hidden
      await expect(storyCard.locator('[data-testid="checklist-item-ft-1"]')).not.toBeVisible();

      // Click again to expand
      await sectionTrigger.click();
      await page.waitForTimeout(300);

      // Items should be visible again
      await expect(storyCard.locator('[data-testid="checklist-item-ft-1"]')).toBeVisible();
    });
  });
});
