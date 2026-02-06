#!/bin/sh
# stop-claude-runner.sh
# Helper script to stop a running Claude Code container
#
# Usage: ./stop-claude-runner.sh <project_id> [--force]
#
# Arguments:
#   project_id  - Unique identifier for the runner instance
#   --force     - Force kill instead of graceful stop

set -e

# Validate arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <project_id> [--force]"
    exit 1
fi

PROJECT_ID="$1"
FORCE="${2:-}"

# Container name based on project ID
CONTAINER_NAME="claude-runner-${PROJECT_ID}"

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Container ${CONTAINER_NAME} does not exist."
    exit 0
fi

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping container ${CONTAINER_NAME}..."

    if [ "$FORCE" = "--force" ]; then
        docker kill "${CONTAINER_NAME}"
    else
        # Graceful stop with 30 second timeout
        docker stop -t 30 "${CONTAINER_NAME}"
    fi

    echo "Container stopped."
else
    echo "Container ${CONTAINER_NAME} is not running."
fi

# Remove the container
echo "Removing container ${CONTAINER_NAME}..."
docker rm "${CONTAINER_NAME}" 2>/dev/null || true

echo "Done."
