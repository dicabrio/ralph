#!/bin/sh
# start-claude-runner.sh
# Helper script to start a Claude Code container for running stories
#
# Usage: ./start-claude-runner.sh <project_path> <project_id> [prompt_file]
#
# Authentication (choose ONE):
#   Option 1 - API Key:
#     ANTHROPIC_API_KEY     - API key for Claude
#
#   Option 2 - Claude Config (for Max/Pro subscription):
#     HOST_CLAUDE_CONFIG    - Path to .claude.json file (e.g., ~/.claude.json)
#
# Other environment variables:
#   HOST_PROJECTS_ROOT    - Host path to projects folder
#   HOST_SKILLS_PATH      - Host path to skills folder
#
# Arguments:
#   project_path  - Path to the project inside /projects (e.g., "my-project")
#   project_id    - Unique identifier for this runner instance
#   prompt_file   - Optional path to custom CLAUDE.md file

set -e

# Validate arguments
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <project_path> <project_id> [prompt_file]"
    echo ""
    echo "Authentication (choose ONE):"
    echo "  ANTHROPIC_API_KEY     - Anthropic API key"
    echo "  HOST_CLAUDE_CONFIG    - Path to .claude.json (for Max/Pro subscription)"
    echo ""
    echo "Other environment variables:"
    echo "  HOST_PROJECTS_ROOT    - Host path to projects folder"
    echo "  HOST_SKILLS_PATH      - Host path to skills folder"
    exit 1
fi

PROJECT_PATH="$1"
PROJECT_ID="$2"
PROMPT_FILE="${3:-}"

# Validate at least one authentication method is set
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$HOST_CLAUDE_CONFIG" ]; then
    echo "Error: Either ANTHROPIC_API_KEY or HOST_CLAUDE_CONFIG must be set"
    echo ""
    echo "For API access:      export ANTHROPIC_API_KEY=sk-ant-..."
    echo "For Max/Pro plan:    export HOST_CLAUDE_CONFIG=~/.claude.json"
    exit 1
fi

if [ -z "$HOST_PROJECTS_ROOT" ]; then
    echo "Error: HOST_PROJECTS_ROOT environment variable is not set"
    exit 1
fi

# Container name based on project ID
CONTAINER_NAME="claude-runner-${PROJECT_ID}"

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Container ${CONTAINER_NAME} already exists."

    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "Container is already running."
        exit 0
    else
        echo "Removing stopped container..."
        docker rm "${CONTAINER_NAME}"
    fi
fi

# Build the full host path for the project
HOST_PROJECT_PATH="${HOST_PROJECTS_ROOT}/${PROJECT_PATH}"

# Validate project path exists (from within the container's view)
CONTAINER_PROJECT_PATH="/projects/${PROJECT_PATH}"
if [ ! -d "${CONTAINER_PROJECT_PATH}" ]; then
    echo "Error: Project path does not exist: ${CONTAINER_PROJECT_PATH}"
    exit 1
fi

echo "Starting Claude runner for project: ${PROJECT_PATH}"
echo "Container name: ${CONTAINER_NAME}"
echo "Host project path: ${HOST_PROJECT_PATH}"

# Build docker run command
DOCKER_CMD="docker run"
DOCKER_CMD="${DOCKER_CMD} --name ${CONTAINER_NAME}"

# Add authentication (prefer config file over API key)
if [ -n "$HOST_CLAUDE_CONFIG" ]; then
    echo "Using Claude config file: ${HOST_CLAUDE_CONFIG}"
    # Expand ~ to home directory if present
    EXPANDED_CONFIG=$(eval echo "$HOST_CLAUDE_CONFIG")
    if [ -f "$EXPANDED_CONFIG" ]; then
        DOCKER_CMD="${DOCKER_CMD} -v ${EXPANDED_CONFIG}:/root/.claude.json:ro"
    else
        echo "Warning: Claude config file not found: ${EXPANDED_CONFIG}"
        echo "Falling back to API key if available..."
        if [ -n "$ANTHROPIC_API_KEY" ]; then
            DOCKER_CMD="${DOCKER_CMD} -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
        else
            echo "Error: No valid authentication method available"
            exit 1
        fi
    fi
elif [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "Using API key authentication"
    DOCKER_CMD="${DOCKER_CMD} -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
fi

# Mount project folder
DOCKER_CMD="${DOCKER_CMD} -v ${HOST_PROJECT_PATH}:/workspace"

# Mount skills folder if available
if [ -n "$HOST_SKILLS_PATH" ]; then
    DOCKER_CMD="${DOCKER_CMD} -v ${HOST_SKILLS_PATH}:/skills:ro"
fi

# Set working directory
DOCKER_CMD="${DOCKER_CMD} -w /workspace"

# Interactive mode for Claude
DOCKER_CMD="${DOCKER_CMD} -it"

# Add the image
DOCKER_CMD="${DOCKER_CMD} anthropics/claude-code:latest"

# Execute the command
echo "Executing: ${DOCKER_CMD}"
eval "${DOCKER_CMD}"

exit_code=$?
echo "Claude runner exited with code: ${exit_code}"
exit $exit_code
