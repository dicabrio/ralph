/**
 * Ollama Integration Test
 *
 * Run with: npx tsx src/lib/services/ollamaTest.ts [projectPath]
 *
 * Tests:
 * 1. Simple prompt (sanity check)
 * 2. Full flow with real project (story selection + prompt generation)
 */
import { spawn } from "node:child_process";
import { readRalphConfigSync } from "./ralphConfig";
import { DEFAULT_CLAUDE_PERMISSIONS } from "./claudePermissions";
import { selectNextStory, generateStoryPrompt } from "./storySelector";
import { getEffectivePrompt } from "./promptTemplate";

const SIMPLE_PROMPT = "Wat is 2 + 2? Antwoord alleen met het getal.";
const DEFAULT_PROJECT_PATH = "/Users/robertcabri/Projects/Admin";

async function runClaude(
  prompt: string,
  model: string,
  baseUrl: string,
  cwd?: string,
  timeout = 60000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = [
    "-p",
    "--model", model,
    "--permission-mode", "dontAsk",
    "--allowedTools", DEFAULT_CLAUDE_PERMISSIONS.permissions.allow.join(","),
    "--disallowedTools", DEFAULT_CLAUDE_PERMISSIONS.permissions.deny.join(","),
  ];

  const env = {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: "ollama",
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: baseUrl,
  };

  const cliProcess = spawn("claude", args, {
    env,
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  cliProcess.stdout?.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  cliProcess.stderr?.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  // Send prompt via stdin
  cliProcess.stdin?.write(prompt);
  cliProcess.stdin?.end();

  // Set timeout
  const timeoutId = setTimeout(() => {
    console.log(`\n[TIMEOUT] Process killed after ${timeout}ms`);
    cliProcess.kill("SIGKILL");
  }, timeout);

  const exitCode = await new Promise<number>((resolve) => {
    cliProcess.on("close", (code) => {
      clearTimeout(timeoutId);
      resolve(code ?? -1);
    });
    cliProcess.on("error", (err) => {
      clearTimeout(timeoutId);
      console.error("\nProcess error:", err);
      resolve(-1);
    });
  });

  return { exitCode, stdout, stderr };
}

async function testSimple(model: string, baseUrl: string) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Simple Prompt");
  console.log("=".repeat(60));

  console.log(`Prompt: "${SIMPLE_PROMPT}"`);
  console.log("Running...\n");

  const result = await runClaude(SIMPLE_PROMPT, model, baseUrl);

  console.log(`Output: "${result.stdout.trim()}"`);
  console.log(`Exit code: ${result.exitCode}`);

  if (result.exitCode === 0) {
    console.log("\n✅ TEST 1 PASSED");
    return true;
  } else {
    console.log("\n❌ TEST 1 FAILED");
    if (result.stderr) console.log(`Stderr: ${result.stderr}`);
    return false;
  }
}

async function testFullFlow(model: string, baseUrl: string, projectPath: string) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Full Flow with Story Selection");
  console.log("=".repeat(60));

  console.log(`Project: ${projectPath}`);

  // Select next story
  const selection = await selectNextStory(projectPath);
  if (!selection) {
    console.log("❌ No eligible stories found");
    return false;
  }

  console.log(`Selected story: ${selection.story.id} - ${selection.story.title}`);

  // Generate prompt
  const { content: basePrompt } = await getEffectivePrompt(projectPath);
  const fullPrompt = generateStoryPrompt(selection, basePrompt);

  console.log(`Prompt length: ${fullPrompt.length} chars`);
  console.log(`First 200 chars: ${fullPrompt.substring(0, 200)}...`);

  console.log("\nRunning Claude CLI (timeout: 30s)...\n");

  const result = await runClaude(fullPrompt, model, baseUrl, projectPath, 30000);

  console.log(`Exit code: ${result.exitCode}`);
  console.log(`Stdout length: ${result.stdout.length} chars`);
  console.log(`Stderr length: ${result.stderr.length} chars`);

  if (result.stdout) {
    console.log(`\nFirst 500 chars of output:\n${result.stdout.substring(0, 500)}`);
  }

  if (result.stderr) {
    console.log(`\nStderr:\n${result.stderr.substring(0, 500)}`);
  }

  if (result.exitCode === 0) {
    console.log("\n✅ TEST 2 PASSED");
    return true;
  } else {
    console.log("\n❌ TEST 2 FAILED (or timed out - which may be OK for a real task)");
    return false;
  }
}

async function main() {
  const projectPath = process.argv[2] || DEFAULT_PROJECT_PATH;

  console.log("=".repeat(60));
  console.log("Ollama Integration Test Suite");
  console.log("=".repeat(60));

  // Read config
  const config = readRalphConfigSync(projectPath);
  if (!config?.runner?.model) {
    console.error("No model configured in ralph.config.json");
    process.exit(1);
  }

  const model = config.runner.model;
  const baseUrl = config.runner.baseUrl || "http://localhost:11434";

  console.log(`\nConfiguration:`);
  console.log(`  Project: ${projectPath}`);
  console.log(`  Model: ${model}`);
  console.log(`  Base URL: ${baseUrl}`);

  // Run tests
  const test1Passed = await testSimple(model, baseUrl);

  if (!test1Passed) {
    console.log("\n\nTest 1 failed, skipping Test 2");
    process.exit(1);
  }

  await testFullFlow(model, baseUrl, projectPath);

  console.log("\n" + "=".repeat(60));
  console.log("All tests completed");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
