FROM node:20-slim

# Basis tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI installeren
RUN npm install -g @anthropic-ai/claude-code

RUN useradd -m -s /bin/bash claude
USER claude

# Werkdirectory
WORKDIR /workspace

# Entrypoint
ENTRYPOINT ["claude"]

# docker run --rm -it -v "$HOME/.claude.json:/root/.claude.json:ro" claude-sandbox cat /root/.claude.json
# docker run --rm -it -v "$HOME/.claude.json:/root/.claude.json:ro" -v "$(pwd):/workspace" claude-sandbox -p "$(cat "./stories/prompt.md")" --trust-workspace --permission-mode bypassPermissions
# docker run --rm -it -v "$HOME/.claude.json:/root/.claude.json:ro" -v "$(pwd):/workspace" claude-sandbox -p "$(cat "./stories/prompt.md")" --permission-mode bypassPermissions
# docker run --rm -it -v "$HOME/.claude.json:/root/.claude.json:ro" -v "$(pwd):/workspace" claude-sandbox cat /root/.claude.json --trust-workspace
# docker run --rm -it -v "$PROJECT_DIR:/workspace" -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" claude-sandbox -p "$(cat "$PROMPT_FILE")" --trust-workspace --allowedTools "Skill,Read,Write,Edit,MultiEdit,Bash(*)"  2>&1 | tee "$OUTPUT_FILE"
# docker run --rm -it -v "$PROJECT_DIR:/workspace" -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" claude-sandbox -p "$(cat "$PROMPT_FILE")" --trust-workspace --allowedTools "Skill,Read,Write,Edit,MultiEdit,Bash(*)"  2>&1 | tee "$OUTPUT_FILE"
