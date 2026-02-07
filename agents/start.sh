#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
agent="${1:-}"
shift || true
task="${*:-}"

if [[ -z "$agent" || -z "$task" ]]; then
  echo "Usage: $0 <agent-name> \"<task>\""
  exit 1
fi

agent_dir="${script_dir}/${agent}"
instructions="${agent_dir}/INSTRUCTIONS.md"

if [[ ! -d "$agent_dir" ]]; then
  echo "Unknown agent: ${agent}"
  exit 1
fi

logs_dir="${script_dir}/_logs"
mkdir -p "$logs_dir"
timestamp="$(date +"%Y%m%d-%H%M%S")"
log_file="${logs_dir}/${agent}-${timestamp}.log"
handoffs_file="${script_dir}/shared/handoffs.json"

{
  echo "agent: ${agent}"
  echo "task: ${task}"
  echo "timestamp: ${timestamp}"
  echo "instructions: ${instructions}"
  echo "cwd: $(pwd)"
} > "$log_file"

task_id="$(
  HANDOFFS_PATH="$handoffs_file" \
  AGENT_NAME="$agent" \
  TASK_DESC="$task" \
  TASK_TS="$timestamp" \
  LOG_FILE="$log_file" \
  python3 - <<'PY'
import json
import os
import re

handoffs_path = os.environ["HANDOFFS_PATH"]
agent = os.environ["AGENT_NAME"]
task = os.environ["TASK_DESC"]
timestamp = os.environ["TASK_TS"]
log_file = os.environ["LOG_FILE"]

def derive_task_id(task_text: str, stamp: str) -> str:
    match = re.search(r'\b[A-Z]{2,}-[A-Z0-9]+-[A-Z0-9-]+\b', task_text)
    if match:
        return match.group(0)
    match = re.search(r'\b[A-Za-z0-9]+-[A-Za-z0-9-]+\b', task_text)
    if match:
        return match.group(0)
    return f"task-{stamp}"

def derive_feature_id(task_id: str) -> str:
    if task_id.startswith("US-") and task_id.count("-") >= 2:
        return "-".join(task_id.split("-")[:-1])
    return ""

task_id = derive_task_id(task, timestamp)
feature_id = derive_feature_id(task_id)

base = {
    "handoffs": [],
    "active_tasks": {},
    "completed_tasks": [],
    "blocked_tasks": []
}

data = base
if os.path.exists(handoffs_path):
    try:
        with open(handoffs_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        data = base

data.setdefault("handoffs", [])
data.setdefault("active_tasks", {})
data.setdefault("completed_tasks", [])
data.setdefault("blocked_tasks", [])

entry = {
    "feature_id": feature_id,
    "task_id": task_id,
    "owner": agent,
    "status": "in_progress",
    "touches": [],
    "depends_on": [],
    "notes": task,
    "blockers": [],
    "log": log_file,
    "timestamp": timestamp
}

data["handoffs"].append(entry)
data["active_tasks"][task_id] = entry

tmp_path = f"{handoffs_path}.tmp"
with open(tmp_path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
os.replace(tmp_path, handoffs_path)

print(task_id)
PY
)"

echo "Agent: ${agent}"
echo "Task: ${task}"
if [[ -f "$instructions" ]]; then
  echo "Instructions: ${instructions}"
else
  echo "Instructions: missing (${instructions})"
fi
echo "Log: ${log_file}"
echo "Handoff: ${handoffs_file} (${task_id})"
echo
echo "Next:"
if [[ -f "$instructions" ]]; then
  echo "- Review ${instructions}"
else
  echo "- Create ${instructions} to document the agent role"
fi
echo "- Update ${handoffs_file} if you need to add dependencies or touched files"
