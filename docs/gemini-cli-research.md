# Gemini CLI Research voor Ralph Loop Integration

**Datum:** 2026-02-24
**Story:** RUNNER-009
**Status:** Research Compleet

## Samenvatting

Google's Gemini CLI is een open-source AI agent die de kracht van Gemini direct in de terminal brengt. Het is een volwaardig alternatief voor Claude CLI met vergelijkbare agentic coding capabilities.

**Conclusie:** Gemini CLI is **geschikt** voor integratie als Ralph loop provider. De tooling ondersteunt alle features die nodig zijn: headless mode, streaming output, file operations, shell commands, en auto-approval mode.

---

## 1. Installatie en Setup

### Installatie Methoden

```bash
# NPX (geen installatie nodig)
npx @google/gemini-cli

# NPM global
npm install -g @google/gemini-cli

# Homebrew (macOS/Linux)
brew install gemini-cli

# MacPorts
sudo port install gemini-cli
```

### Versie Verificatie

```bash
gemini --version
# Output: 0.26.0 (of nieuwer)
```

### Release Tracks

| Track | Update Frequentie | Use Case |
|-------|-------------------|----------|
| Stable | Weekly (dinsdag UTC 2000) | Production |
| Preview | Weekly (dinsdag UTC 2359) | Testen van nieuwe features |
| Nightly | Daily (UTC 0000) | Experimenteel |

---

## 2. Authenticatie

### Optie 1: OAuth met Google Account (Gratis Tier)

- **Rate limits:** 60 requests/min, 1000 requests/dag
- **Setup:** Login via `gemini` interactieve mode
- Geen API key nodig
- Ideaal voor development en testing

### Optie 2: Gemini API Key

```bash
export GEMINI_API_KEY="your-api-key"
```

- Verkrijgbaar via: https://aistudio.google.com/apikey
- **Rate limits:** 1000 requests/dag (free tier)
- Vereist voor CI/CD pipelines

### Optie 3: Vertex AI (Enterprise)

```bash
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_GENAI_USE_VERTEXAI=true
```

- Enterprise compliance features
- Hogere rate limits met billing
- Service account support via `GOOGLE_APPLICATION_CREDENTIALS`

### Aanbeveling voor Ralph

Voor Ralph loop integration gebruiken we **GEMINI_API_KEY** omdat:
1. Geen interactieve login vereist
2. Geschikt voor headless/Docker environments
3. Eenvoudige configuratie via environment variable

---

## 3. CLI Command Structuur

### Basis Invocatie

```bash
# Interactieve mode
gemini

# Non-interactieve prompt (headless)
gemini -p "Your prompt here"

# Met specifiek model
gemini -m gemini-2.5-flash -p "Your prompt"
```

### Belangrijke Flags

| Flag | Beschrijving |
|------|--------------|
| `-p, --prompt` | Non-interactieve prompt (headless mode) |
| `-m, --model` | Model selectie (gemini-2.5-flash, gemini-2.5-pro, etc.) |
| `-y, --yolo` | Auto-approve alle tool executions |
| `--approval-mode` | `default`, `auto_edit`, `yolo`, `plan` |
| `-o, --output-format` | `text`, `json`, `stream-json` |
| `--include-directories` | Extra directories in workspace |
| `-s, --sandbox` | Run in sandbox mode |
| `-d, --debug` | Debug mode (F12 voor console) |

### Output Formaten

```bash
# Standaard text output
gemini -p "prompt"

# JSON output (single response)
gemini -p "prompt" --output-format json

# Streaming JSON (voor real-time parsing)
gemini -p "prompt" --output-format stream-json
```

---

## 4. Streaming Output

### Stream-JSON Format

De `--output-format stream-json` retourneert newline-delimited JSON (JSONL):

```json
{"type":"init","timestamp":"...","session_id":"...","model":"auto-gemini-2.5"}
{"type":"message","timestamp":"...","role":"user","content":"..."}
{"type":"tool_use","timestamp":"...","tool_name":"read_file","tool_id":"...","parameters":{...}}
{"type":"tool_result","timestamp":"...","tool_id":"...","status":"success","output":"..."}
{"type":"message","timestamp":"...","role":"assistant","content":"...","delta":true}
{"type":"result","timestamp":"...","status":"success","stats":{...}}
```

### Event Types

| Type | Beschrijving |
|------|--------------|
| `init` | Sessie start met session_id en model |
| `message` | User of assistant bericht |
| `tool_use` | Tool call start |
| `tool_result` | Tool call resultaat |
| `result` | Eindresultaat met stats |

### Integratie met Ralph

De streaming output is ideaal voor Ralph's log buffering en WebSocket broadcasting:

```typescript
// Pseudo-code voor Ralph geminiLoopService
const proc = spawn('gemini', ['-p', prompt, '--output-format', 'stream-json', '--yolo']);

proc.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);

    switch (event.type) {
      case 'message':
        wsServer.broadcast({ type: 'log', content: event.content });
        break;
      case 'tool_use':
        wsServer.broadcast({ type: 'tool_call', tool: event.tool_name });
        break;
      case 'result':
        if (event.status === 'success') {
          // Story completed
        }
        break;
    }
  }
});
```

---

## 5. Tool Calling Capabilities

### Ingebouwde Tools

Gemini CLI heeft deze built-in tools (geen configuratie nodig):

| Tool | Beschrijving |
|------|--------------|
| `read_file` | Lees file content |
| `write_file` | Schrijf naar file |
| `list_directory` | List directory contents |
| `shell` | Execute shell commands |
| `web_fetch` | Fetch web content |
| `google_search` | Real-time web search grounding |

### Tool Auto-Approval

```bash
# Auto-approve specifieke tools
gemini --allowed-tools read_file,list_directory -p "prompt"

# Auto-approve ALLE tools (YOLO mode)
gemini --yolo -p "prompt"

# Approval modes
gemini --approval-mode yolo -p "prompt"
gemini --approval-mode auto_edit -p "prompt"  # Auto-approve edits
gemini --approval-mode plan -p "prompt"       # Read-only mode
```

### MCP (Model Context Protocol) Support

```bash
# Configure MCP servers in ~/.gemini/settings.json
gemini --allowed-mcp-server-names github,slack -p "prompt"
```

---

## 6. File Reading Capabilities

### Automatische Context

```bash
# Huidige directory is automatisch in context
gemini -p "Read package.json"

# Extra directories toevoegen
gemini --include-directories ../shared,./config -p "prompt"

# Alle files in context laden
gemini --all-files -p "prompt"
```

### GEMINI.md Project Context

Net als Claude's `CLAUDE.md`, ondersteunt Gemini CLI een `GEMINI.md` file:

```markdown
# Project Context

This is a TypeScript monorepo using TanStack Start.

## Build Commands
- `pnpm install` - Install dependencies
- `pnpm build` - Build project
- `pnpm test` - Run tests
```

---

## 7. Working Directory / Project Context

### Context Mechanisms

1. **Automatisch:** Gemini analyseert de current working directory
2. **GEMINI.md:** Project-specifieke instructies
3. **--include-directories:** Extra directories toevoegen
4. **Session resume:** `--resume latest` of `--resume 5`

### Session Management

```bash
# List beschikbare sessies
gemini --list-sessions

# Resume laatste sessie
gemini --resume latest

# Resume specifieke sessie
gemini --resume 5

# Delete sessie
gemini --delete-session 5
```

---

## 8. Rate Limits en Quota's

### Free Tier Limits

| Auth Method | Requests/Min | Requests/Day |
|-------------|--------------|--------------|
| OAuth (Google Account) | 60 | 1,000 |
| API Key (Free) | N/A | 1,000 |

### Rate Limit Handling

Gemini CLI heeft ingebouwde retry logic:

```
Attempt 1 failed: You have exhausted your capacity on this model.
Your quota will reset after 0s.. Retrying after 539.55ms...
```

### Monitoring Token Usage

De JSON/stream-json output bevat usage stats:

```json
{
  "stats": {
    "total_tokens": 21438,
    "input_tokens": 21089,
    "output_tokens": 99,
    "cached": 12652,
    "duration_ms": 6790,
    "tool_calls": 1
  }
}
```

---

## 9. Error Handling en Exit Codes

### Consistente Exit Codes

Gemini CLI gebruikt standaard exit codes voor scripting:

| Exit Code | Betekenis |
|-----------|-----------|
| 0 | Success |
| 1 | General error |
| Non-zero | Various error conditions |

### Error Detection in Stream Output

```json
{"type":"result","status":"error","error":{"type":"...","message":"...","code":"..."}}
```

### Rate Limit Errors

Bij rate limits retourneert de CLI automatisch na een delay:

```
Attempt 1 failed: You have exhausted your capacity...
Retrying after 539.55ms...
```

---

## 10. Vergelijking met Claude CLI

| Feature | Claude CLI | Gemini CLI |
|---------|------------|------------|
| Installation | `npm i -g @anthropic-ai/claude-code` | `npm i -g @google/gemini-cli` |
| Auth | ANTHROPIC_API_KEY | GEMINI_API_KEY / OAuth |
| Context Window | 200K tokens | 1M tokens |
| Project Config | CLAUDE.md | GEMINI.md |
| Headless Mode | `claude -p "prompt"` | `gemini -p "prompt"` |
| Auto-Approve | `--dangerously-skip-permissions` | `--yolo` |
| Streaming | `--output-format stream-json` | `--output-format stream-json` |
| Tool Calling | Built-in | Built-in |
| Sandboxing | Basic | Seatbelt / Container |
| Rate Limits | Usage-based | 1000/day (free) |
| Open Source | No | Yes (Apache 2.0) |
| Cost | Paid only | Free tier + Paid |

### Overeenkomsten

- Beide ondersteunen headless mode met `-p` flag
- Beide hebben streaming JSON output
- Beide hebben built-in file operations en shell tools
- Beide hebben project context files (CLAUDE.md / GEMINI.md)

### Verschillen

- Gemini heeft ruimere context window (1M vs 200K tokens)
- Gemini heeft gratis tier (1000 requests/dag)
- Gemini is open-source
- Claude CLI heeft geen sandboxing opties
- Gemini's --yolo is minder strict dan Claude's permissions

---

## 11. Proof of Concept

### Test 1: Versie Check

```bash
$ gemini --version
0.26.0
```

### Test 2: Simple Prompt

```bash
$ gemini -p "What is 2 + 2?" --output-format json
{
  "session_id": "...",
  "response": "4",
  "stats": {...}
}
```

### Test 3: File Reading

```bash
$ gemini -p "Read package.json and tell me the project name" --yolo --output-format json
# Successfully used read_file tool
# Response: "name=ralph"
```

### Test 4: Directory Listing

```bash
$ gemini -p "List files in src/lib/services" --yolo --output-format stream-json
{"type":"tool_use","tool_name":"list_directory",...}
{"type":"tool_result","status":"success","output":"Listed 25 item(s)."}
{"type":"message","content":"There are 26 files in the directory."}
```

---

## 12. Integratie Aanpak voor Ralph

### Nieuwe Service: geminiLoopService.ts

```typescript
// src/lib/services/geminiLoopService.ts

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface GeminiEvent {
  type: 'init' | 'message' | 'tool_use' | 'tool_result' | 'result';
  timestamp: string;
  // ... andere fields afhankelijk van type
}

export class GeminiLoopService extends EventEmitter {
  private process: ChildProcess | null = null;

  async startLoop(projectPath: string, prompt: string): Promise<void> {
    this.process = spawn('gemini', [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--yolo',
      '--include-directories', projectPath
    ], {
      cwd: projectPath,
      env: {
        ...process.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      }
    });

    this.process.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event: GeminiEvent = JSON.parse(line);
          this.emit('event', event);

          if (event.type === 'result') {
            this.emit('complete', event);
          }
        } catch (e) {
          // Non-JSON output (deprecation warnings, etc.)
        }
      }
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
    });
  }

  stop(): void {
    this.process?.kill();
  }
}
```

### Environment Variables

```env
# .env
GEMINI_API_KEY=your-api-key-here
```

### Docker Compose Update

```yaml
services:
  ralph-app:
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
```

---

## 13. Aanbevelingen

### Must-Have voor RUNNER-010

1. **Environment variable:** `GEMINI_API_KEY`
2. **Graceful error handling:** Check of CLI geïnstalleerd is
3. **Streaming parsing:** Parse stream-json output
4. **Rate limit handling:** Retry logic of warning bij quota exhaustion
5. **Story status updates:** Map `result.status` naar `done/failed`

### Nice-to-Have

1. **Model selection:** Laat gebruiker kiezen tussen flash/pro
2. **Context caching:** Gebruik `stats.cached` voor optimalisatie
3. **Session resume:** Bewaar session_id voor long-running tasks

### Limitations

1. **Geen native "story mode":** Ralph moet zelf de story prompt construeren
2. **Rate limits:** 1000/dag kan beperkend zijn voor teams
3. **Quota reset:** Niet real-time zichtbaar (anders dan Claude)

---

## Bronnen

- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Gemini CLI Documentation](https://google-gemini.github.io/gemini-cli/)
- [Headless Mode Guide](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html)
- [Sandboxing Documentation](https://google-gemini.github.io/gemini-cli/docs/cli/sandbox.html)
- [Google AI Studio API Keys](https://aistudio.google.com/apikey)
