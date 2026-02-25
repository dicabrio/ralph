#!/bin/bash
set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$SCRIPT_DIR/.ralph_output.tmp"
ALLOWED_TOOLS="Skill,WebSearch,WebFetch,Read,Edit,Write,MultiEdit,Bash"
DISALLOWED_TOOLS="Bash(rm -rf:*),Bash(sudo:*),Bash(chmod 777:*),Bash(chown:*),Read(.env*),Read(~/.aws/**),Read(~/.ssh/**),Read(~/.gnupg/**),Write(.env*),Write(~/.aws/**),Write(~/.ssh/**)"

echo "Starting Ralph"
for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══ Iteration $i ═══"
  echo ""

  # Stream output directly to terminal AND capture to file
  cat "$SCRIPT_DIR/prompt.md" | claude -p --permission-mode dontAsk --allowedTools "$ALLOWED_TOOLS" --disallowedTools "$DISALLOWED_TOOLS" 2>&1 | tee "$OUTPUT_FILE"
  # cat "$SCRIPT_DIR/prompt.md" | codex exec - 2>&1 | tee "$OUTPUT_FILE"
  # gemini ask "$(cat "$SCRIPT_DIR/prompt.md")" > "$OUTPUT_FILE"

  # cat "$SCRIPT_DIR/prompt.md" | gemini ask --stream > "$OUTPUT_FILE" 2>&1

  # Toon de output ook direct in de terminal voor feedback
  cat "$OUTPUT_FILE"

  # Check for completion markers
  if grep -q "<promise>COMPLETE</promise>" "$OUTPUT_FILE" 2>/dev/null; then
    echo ""
    echo "Done! All stories complete."
    rm -f "$OUTPUT_FILE"
    exit 0
  fi

  if grep -q "<promise>DONE_ONE</promise>" "$OUTPUT_FILE" 2>/dev/null; then
    echo ""
    echo "── Story completed, continuing to next iteration... ──"
    # Continue to next iteration instead of exiting
  fi

  echo ""
  echo "── Iteration $i complete, continuing... ──"
  sleep 2
done

echo "Max iterations reached"
rm -f "$OUTPUT_FILE"
exit 1
