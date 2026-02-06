#!/bin/sh
# claude-runner-status.sh
# Helper script to check the status of Claude Code containers
#
# Usage: ./claude-runner-status.sh [project_id]
#
# Arguments:
#   project_id  - Optional: check specific runner, otherwise lists all

set -e

PROJECT_ID="${1:-}"

if [ -n "$PROJECT_ID" ]; then
    # Check specific container
    CONTAINER_NAME="claude-runner-${PROJECT_ID}"

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "running"
    elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        # Get exit code
        EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "${CONTAINER_NAME}" 2>/dev/null || echo "unknown")
        echo "stopped:${EXIT_CODE}"
    else
        echo "not_found"
    fi
else
    # List all Claude runner containers
    echo "Claude Runner Containers:"
    echo "========================="

    # Running containers
    RUNNING=$(docker ps --filter "name=claude-runner-" --format "{{.Names}}\t{{.Status}}" 2>/dev/null || true)
    if [ -n "$RUNNING" ]; then
        echo ""
        echo "Running:"
        echo "$RUNNING"
    fi

    # Stopped containers
    STOPPED=$(docker ps -a --filter "name=claude-runner-" --filter "status=exited" --format "{{.Names}}\t{{.Status}}" 2>/dev/null || true)
    if [ -n "$STOPPED" ]; then
        echo ""
        echo "Stopped:"
        echo "$STOPPED"
    fi

    if [ -z "$RUNNING" ] && [ -z "$STOPPED" ]; then
        echo "No Claude runner containers found."
    fi
fi
