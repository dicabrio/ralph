import { spawn, exec, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";

const test = async () => {
  const PROMPT = readFileSync(
    "/Users/robertcabri/Projects/Trader/stories/prompt.md",
    "utf-8",
  );

  console.log("Starting Claude CLI with prompt:");
  console.log("========================================");
  console.log(`Prompt length: ${PROMPT.length} chars`);
  console.log("========================================");

  // Spawn claude with -p flag (read from stdin) - mirrors: cat prompt.md | claude -p
  const claudeProcess = spawn(
    "claude",
    ["-p", "--dangerously-skip-permissions"],
    {
      cwd: "/Users/robertcabri/Projects/Trader",
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  // Pipe prompt via stdin (like bash: cat prompt.md | claude -p)
  claudeProcess.stdin?.write(PROMPT);
  claudeProcess.stdin?.end();

  claudeProcess.stdout?.on("data", (data: Buffer) => {
    console.log("[Claude]", data.toString());
  });

  claudeProcess.stderr?.on("data", (data: Buffer) => {
    console.error("[Claude ERR]", data.toString());
  });

  claudeProcess.on("close", (code) => {
    console.log(`[Claude] Process exited with code: ${code}`);
  });
};

const main = async () => {
  await test().catch((err) => {
    console.error("Error in test:", err);
  });
  console.log("Hello, world!");
};

main();
