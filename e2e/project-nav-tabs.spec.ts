import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Generate unique test run ID
const testRunId = "e2e-project-nav-tabs";

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

// Create a shared test project that persists for all tests in this file
let sharedTestProject: { path: string; name: string } | null = null;

function getOrCreateTestProject(): { path: string; name: string } {
  const runTimestamp = process.env.TEST_RUN_TS || Date.now().toString();
  if (!sharedTestProject) {
    const name = `nav-tabs-test-${testRunId}-${runTimestamp.slice(-6)}`;
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ralph-e2e-nav-tabs-"),
    );
    const projectPath = path.join(tempDir, name);
    const storiesDir = path.join(projectPath, "stories");

    fs.mkdirSync(storiesDir, { recursive: true });

    const prdJson = {
      projectName: name,
      projectDescription: `Project nav tabs test for ${name}`,
      branchName: "feature/nav-tabs-test",
      availableSkills: ["frontend-design"],
      epics: [
        { name: "Setup", description: "Initial setup tasks" },
        { name: "Feature", description: "Feature development" },
      ],
      userStories: [
        {
          id: "NAV-001",
          title: "First review story",
          description: "This story is ready for testing",
          priority: 1,
          status: "review",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: ["frontend-design"],
          acceptanceCriteria: ["Feature is complete"],
        },
        {
          id: "NAV-002",
          title: "Second review story",
          description: "Another story in review",
          priority: 2,
          status: "review",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Tests pass"],
        },
        {
          id: "NAV-003",
          title: "Pending story",
          description: "This story is pending",
          priority: 3,
          status: "pending",
          epic: "Setup",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Setup complete"],
        },
        {
          id: "NAV-004",
          title: "Done story",
          description: "This story is done",
          priority: 4,
          status: "done",
          epic: "Feature",
          dependencies: [],
          recommendedSkills: [],
          acceptanceCriteria: ["Work complete"],
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

// Navigate to project overview page
async function gotoProjectOverview(
  page: Page,
  testProject: { path: string; name: string },
) {
  await ensureProjectAdded(page, testProject);

  const projectCard = page.locator(
    `a[href^="/project/"]:has-text("${testProject.name}")`,
  );
  await expect(projectCard).toBeVisible({ timeout: 10000 });
  await projectCard.click();

  await page.waitForURL(/\/project\/\d+/);
  await page.waitForLoadState("networkidle");
}

test.describe("Project Navigation Tabs (REVIEW-007)", () => {
  // Configure tests to run serially to avoid race conditions
  test.describe.configure({ mode: "serial" });

  let testProject: { path: string; name: string };

  test.beforeAll(async () => {
    sharedTestProject = null;
    testProject = getOrCreateTestProject();
  });

  test.describe("Tab Display", () => {
    test("should display all four navigation tabs", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Verify all tabs are visible
      await expect(page.locator('[data-testid="nav-tab-overview"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-kanban"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-testing"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-archive"]')).toBeVisible();
    });

    test("should show tab labels on desktop", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Set viewport to desktop size
      await page.setViewportSize({ width: 1024, height: 768 });

      // Labels should be visible on desktop
      await expect(page.getByText("Overview")).toBeVisible();
      await expect(page.getByText("Kanban")).toBeVisible();
      await expect(page.getByText("Testing")).toBeVisible();
      await expect(page.getByText("Archive")).toBeVisible();
    });

    test("should hide labels on mobile (show icons only)", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Set viewport to mobile size
      await page.setViewportSize({ width: 375, height: 667 });

      // Tabs should still be visible
      await expect(page.locator('[data-testid="nav-tab-overview"]')).toBeVisible();

      // Labels should be hidden (they have md:inline class)
      const overviewLabel = page.locator('[data-testid="nav-tab-overview"] span.hidden');
      await expect(overviewLabel).toBeVisible();
    });

    test("should display review count badge on Testing tab", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Should show badge with "2" (we have 2 review stories)
      const badge = page.locator('[data-testid="review-count-badge"]');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText("2");
    });
  });

  test.describe("Tab Navigation", () => {
    test("should highlight Overview tab when on project index", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      const overviewTab = page.locator('[data-testid="nav-tab-overview"]');
      await expect(overviewTab).toHaveAttribute("aria-current", "page");
    });

    test("should navigate to Kanban page when clicking Kanban tab", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      await page.locator('[data-testid="nav-tab-kanban"]').click();
      await page.waitForURL(/\/project\/\d+\/kanban/);

      // Kanban tab should now be highlighted
      const kanbanTab = page.locator('[data-testid="nav-tab-kanban"]');
      await expect(kanbanTab).toHaveAttribute("aria-current", "page");
    });

    test("should navigate to Testing page when clicking Testing tab", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      await page.locator('[data-testid="nav-tab-testing"]').click();
      await page.waitForURL(/\/project\/\d+\/testing/);

      // Testing tab should now be highlighted
      const testingTab = page.locator('[data-testid="nav-tab-testing"]');
      await expect(testingTab).toHaveAttribute("aria-current", "page");
    });

    test("should navigate to Archive page when clicking Archive tab", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      await page.locator('[data-testid="nav-tab-archive"]').click();
      await page.waitForURL(/\/project\/\d+\/archive/);

      // Archive tab should now be highlighted
      const archiveTab = page.locator('[data-testid="nav-tab-archive"]');
      await expect(archiveTab).toHaveAttribute("aria-current", "page");
    });

    test("should navigate back to Overview when clicking Overview tab from another page", async ({
      page,
    }) => {
      await gotoProjectOverview(page, testProject);

      // First go to Kanban
      await page.locator('[data-testid="nav-tab-kanban"]').click();
      await page.waitForURL(/\/project\/\d+\/kanban/);

      // Then click Overview
      await page.locator('[data-testid="nav-tab-overview"]').click();
      await page.waitForURL(/\/project\/\d+$/);

      const overviewTab = page.locator('[data-testid="nav-tab-overview"]');
      await expect(overviewTab).toHaveAttribute("aria-current", "page");
    });
  });

  test.describe("Project Header", () => {
    test("should display project name in header", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Project name should be visible in the header
      await expect(page.locator(`text=${testProject.name}`).first()).toBeVisible();
    });

    test("should display back link to Dashboard", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Back link should be visible
      const backLink = page.locator('a[aria-label="Back to Dashboard"]');
      await expect(backLink).toBeVisible();
    });

    test("should navigate to Dashboard when clicking back link", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      const backLink = page.locator('a[aria-label="Back to Dashboard"]');
      await backLink.click();

      await page.waitForURL("/");
      await expect(page.locator("h1:has-text('Dashboard')")).toBeVisible();
    });
  });

  test.describe("Quick Links on Overview", () => {
    test("should display Quick Links section on Overview page", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Quick Links section should be visible
      await expect(page.getByText("Quick Links")).toBeVisible();
    });

    test("should have Testing quick link", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      const testingLink = page.locator('[data-testid="quick-link-testing"]');
      await expect(testingLink).toBeVisible();
      await expect(testingLink).toContainText("Testing Board");
    });

    test("should have Archive quick link", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      const archiveLink = page.locator('[data-testid="quick-link-archive"]');
      await expect(archiveLink).toBeVisible();
      await expect(archiveLink).toContainText("Archive");
    });

    test("should display review count badge in Testing quick link", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // The badge in the quick link should show "2"
      const badge = page.locator('[data-testid="quick-link-review-badge"]');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText("2");
    });

    test("should navigate to Testing when clicking Testing quick link", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      await page.locator('[data-testid="quick-link-testing"]').click();
      await page.waitForURL(/\/project\/\d+\/testing/);
    });

    test("should navigate to Archive when clicking Archive quick link", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      await page.locator('[data-testid="quick-link-archive"]').click();
      await page.waitForURL(/\/project\/\d+\/archive/);
    });
  });

  test.describe("Tab Consistency Across Pages", () => {
    test("should show same tabs on all project pages", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Check tabs on Overview
      await expect(page.locator('[data-testid="nav-tab-overview"]')).toBeVisible();

      // Navigate to Kanban and check tabs
      await page.locator('[data-testid="nav-tab-kanban"]').click();
      await page.waitForURL(/\/project\/\d+\/kanban/);
      await expect(page.locator('[data-testid="nav-tab-overview"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-kanban"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-testing"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-archive"]')).toBeVisible();

      // Navigate to Testing and check tabs
      await page.locator('[data-testid="nav-tab-testing"]').click();
      await page.waitForURL(/\/project\/\d+\/testing/);
      await expect(page.locator('[data-testid="nav-tab-overview"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-kanban"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-testing"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-archive"]')).toBeVisible();

      // Navigate to Archive and check tabs
      await page.locator('[data-testid="nav-tab-archive"]').click();
      await page.waitForURL(/\/project\/\d+\/archive/);
      await expect(page.locator('[data-testid="nav-tab-overview"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-kanban"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-testing"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tab-archive"]')).toBeVisible();
    });
  });

  test.describe("Keyboard Navigation", () => {
    test("should be able to navigate tabs using keyboard", async ({ page }) => {
      await gotoProjectOverview(page, testProject);

      // Focus the first tab
      await page.locator('[data-testid="nav-tab-overview"]').focus();

      // Press Tab to move to next tab
      await page.keyboard.press("Tab");

      // Kanban tab should be focused
      await expect(page.locator('[data-testid="nav-tab-kanban"]')).toBeFocused();

      // Press Enter to activate the tab
      await page.keyboard.press("Enter");

      // Should navigate to Kanban
      await page.waitForURL(/\/project\/\d+\/kanban/);
    });
  });
});
