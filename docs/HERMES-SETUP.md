# Connecting Echo to Hermes Agent

A step-by-step guide to configure Echo as a Hermes-powered meeting assistant with Obsidian sync and Google Calendar integration.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Required for the Electron app |
| Hermes Agent | 0.16+ | The AI engine powering Echo |
| Obsidian | Any | Your personal knowledge vault |
| Python | 3.10+ | For local Whisper transcription (optional) |

---

## Step 1: Install Hermes Agent

If Hermes is not installed yet:

```bash
# macOS / Linux
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

# Windows (PowerShell)
irm https://hermes-agent.nousresearch.com/install.ps1 | iex
```

Run the setup wizard:

```bash
hermes setup
```

This configures your model provider (Nous Portal, Anthropic, OpenRouter, etc.), API keys, and messaging platforms. You can use any model Hermes supports — the context and memory are model-agnostic.

Verify it's working:

```bash
hermes status
```

You should see `Gateway: running` in the output.

---

## Step 2: Configure the Obsidian Skill

Hermes has a built-in skill for reading, writing, and searching Obsidian vaults. Echo uses this to store and retrieve meeting transcripts.

```bash
# Check the skill is available
hermes skills list | grep obsidian

# Set your vault path in Hermes config
hermes config set obsidian.vault_path ~/Documents/MyVault
```

Echo will create a `Meetings/` folder inside your vault with this structure:

```
MyVault/
├── Meetings/
│   ├── 2025-06-08-product-sync.md
│   ├── 2025-06-09-standup.md
│   └── ...
├── Meeting Summaries/
│   └── Weekly Digest.md
└── ...
```

Each transcript includes:
- Meeting title, date, and attendees
- Full timestamped transcript
- AI-generated summary and action items
- Links to related past meetings

---

## Step 3: Connect Google Calendar

Echo reads your calendar to know what meetings are coming, who will attend, and what the agenda is. This context is passed to Hermes before the meeting starts.

### Option A: Google Workspace CLI

```bash
pip install google-workspace-cli
gws auth login
```

### Option B: Manual OAuth

If you prefer to configure OAuth credentials directly:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the Calendar API
3. Create OAuth 2.0 credentials (Desktop application)
4. Download the JSON and save as `~/.echo/google-credentials.json`

```bash
# Test the connection
gws calendar list --limit 5
```

---

## Step 4: Install Echo

```bash
git clone https://github.com/EstebanCastel/cluely-hermes.git
cd cluely-hermes
./setup.sh
```

The setup script:
- Installs all Node.js dependencies
- Creates `.env` from `env.example`
- Optionally sets up local Whisper in `.venv-whisper/`
- Builds and launches the app

### Setup Options

```bash
./setup.sh --build          # Build distributable for your OS
./setup.sh --skip-whisper   # Skip local Whisper setup
./setup.sh --no-run         # Setup only, don't launch
./setup.sh --ci             # Use npm ci for reproducible installs
```

---

## Step 5: Configure the .env File

The setup script creates this from `env.example`. Edit it with your paths:

```bash
# ══════════════════════════════════════════
# ECHO CONFIGURATION
# ══════════════════════════════════════════

# ─── Hermes Connection (Required) ────────
HERMES_HOST=localhost
HERMES_PORT=8080

# ─── Obsidian Vault (Required) ───────────
OBSIDIAN_VAULT=~/Documents/MyVault
TRANSCRIPT_FORMAT=markdown        # markdown | timestamped

# ─── Google Calendar (Optional) ──────────
GCAL_ENABLED=true

# ─── Speech Provider (Optional) ──────────
# Options: whisper (local, offline) | azure (cloud, real-time)
# Leave empty to disable voice recognition (mic button hides)
SPEECH_PROVIDER=whisper

# Whisper settings (when SPEECH_PROVIDER=whisper)
WHISPER_MODEL=base                # tiny | base | small | medium | large
WHISPER_LANGUAGE=en

# Azure settings (when SPEECH_PROVIDER=azure)
# AZURE_SPEECH_KEY=your_key_here
# AZURE_SPEECH_REGION=eastus

# ─── Stealth Mode (Optional) ────────────
STEALTH_PROCESS_NAME=Terminal     # Terminal | ActivityMonitor | Settings
```

---

## Step 6: Verify Everything Works

### Check Hermes Gateway

```bash
hermes status | grep -A2 Gateway
# Should show: Gateway: running
```

### Check Obsidian Vault

```bash
ls ~/Documents/MyVault/
# Your vault should be accessible
```

### Check Calendar

```bash
gws calendar list --limit 3
# Should show your upcoming events
```

### Launch Echo

```bash
npm start
# Or use the setup script
./setup.sh
```

---

## How Echo Uses Hermes

When Echo captures audio or a screenshot during a meeting, this is what happens:

1. **Audio** is transcribed by Whisper or Azure Speech
2. **Transcript chunks** are sent to Hermes via the gateway
3. **Hermes queries** its memory, your Obsidian vault, and your calendar
4. **Response** is displayed in the stealth overlay
5. **Full transcript** is saved to Obsidian at meeting end

The key difference from other tools: Hermes doesn't just analyze the current meeting. It remembers:

- What was decided in last week's standup
- Who owns what deliverable from the sprint planning
- The deadline your calendar shows for the Q3 milestone
- Notes you wrote in Obsidian about the architecture decision

This cross-session context is what makes Echo fundamentally different from Cluely or any single-meeting AI.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Echo can't connect to Hermes | Run `hermes status` — gateway must show "running". Run `hermes gateway start` if stopped. |
| Transcript not saving to Obsidian | Verify `OBSIDIAN_VAULT` path in `.env` is correct and the folder exists. |
| Calendar not loading | Run `gws auth login` to re-authenticate. Check `GCAL_ENABLED=true` in `.env`. |
| No audio capture on macOS | Grant Screen Recording + Microphone permission in System Settings > Privacy. |
| Invisible overlay not working | Some Linux WMs need compositing enabled. Try `npm run dev` for debug mode. |
| Hermes responses are slow | Check your model provider. Nous Portal or local models via Ollama give faster responses for real-time use. |

---

## Recommended Hermes Configuration for Echo

For real-time meeting assistance, you want fast responses. These settings work well:

```bash
# Use a fast model for real-time responses
hermes config set model claude-sonnet-4-20250514

# Or use a local model for zero-latency
hermes config set model.provider ollama
hermes config set model.default llama3.1:8b

# Enable the Obsidian skill
hermes config set obsidian.vault_path ~/Documents/MyVault

# Keep gateway running
hermes gateway start
```

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Meeting     │     │   Echo       │     │   Hermes     │
│  Audio       │────▶│   (Electron) │────▶│   Agent      │
│  + Screen    │     │   Whisper/   │     │   Memory +   │
│              │     │   Azure STT  │     │   Skills     │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                     │
                     ┌──────▼───────┐     ┌──────▼───────┐
                     │  Obsidian    │     │  Google      │
                     │  Vault       │◀───▶│  Calendar    │
                     │  (Markdown)  │     │  (via gws)   │
                     └──────────────┘     └──────────────┘
```

Echo captures → Hermes reasons → Obsidian stores → Calendar informs.

The cycle is continuous: every meeting enriches the next one.
