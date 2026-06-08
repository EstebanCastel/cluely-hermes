# Echo + Hermes Integration Guide

## Complete Installation & Configuration Guide

This guide covers the complete setup of Echo with Hermes AI integration for intelligent meeting assistance.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Hermes Installation](#hermes-installation)
3. [Echo Setup](#echo-setup)
4. [Integration Configuration](#integration-configuration)
5. [Advanced Features](#advanced-features)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **macOS** 12.0 or higher (Apple Silicon recommended)
- **Node.js** 18.0 or higher
- **Python** 3.9 or higher
- **4GB RAM** minimum (8GB recommended)
- **Internet connection** for API services

### Required Accounts

1. **Deepgram Account** - [Sign up](https://console.deepgram.com)
2. **LLM Provider** - One of:
   - OpenAI API Key
   - Anthropic Claude API Key
   - Local LLM setup (Ollama)
3. **Google Account** (optional) - For calendar integration

---

## Hermes Installation

### Method 1: Quick Install (Recommended)

```bash
# Install Hermes using the official installer
curl -fsSL https://raw.githubusercontent.com/nousresearch/hermes-agent/main/install.sh | bash

# Verify installation
hermes --version

# Initialize configuration
hermes init
```

### Method 2: Manual Installation

```bash
# Clone Hermes repository
git clone https://github.com/nousresearch/hermes-agent.git ~/.hermes/hermes-agent
cd ~/.hermes/hermes-agent

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create configuration
cp config.example.yaml config.yaml
```

### Configure Hermes Provider

#### OpenAI Configuration

```bash
# Set OpenAI API key
hermes config set openai.api_key sk-YOUR_API_KEY_HERE

# Set default model
hermes config set model gpt-4o

# Optional: Configure vision model
hermes config set openai.vision_model gpt-4-vision-preview
```

#### Anthropic Configuration

```bash
# Set Claude API key
hermes config set anthropic.api_key sk-ant-YOUR_API_KEY_HERE

# Set default model
hermes config set model claude-3-opus-20240229

# Enable vision capabilities
hermes config set anthropic.enable_vision true
```

#### Local LLM Configuration (Ollama)

```bash
# Install Ollama
brew install ollama

# Pull a model
ollama pull llama2

# Configure Hermes for local model
hermes config set provider ollama
hermes config set ollama.model llama2
hermes config set ollama.endpoint http://localhost:11434
```

---

## Echo Setup

### 1. Install System Dependencies

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install FFmpeg
brew install ffmpeg

# Install Node.js (if not installed)
brew install node
```

### 2. Setup Audio Routing

#### Install BlackHole

1. Download BlackHole from [GitHub](https://github.com/ExistentialAudio/BlackHole/releases)
2. Install the 2ch version
3. Restart your Mac if prompted

#### Create Aggregate Device

1. Open **Audio MIDI Setup** (Applications → Utilities)
2. Click the **+** button → **Create Aggregate Device**
3. Name it: `OpenCluely In`
4. Configure channels:
   - Check your microphone (Channel 0)
   - Check BlackHole 2ch (Channels 1-2)
5. Set Sample Rate to 48000 Hz

### 3. Clone and Install Echo

```bash
# Clone repository
git clone https://github.com/EstebanCastel/cluely-hermes.git
cd cluely-hermes

# Install dependencies
npm install

# Create configuration directory
mkdir -p ~/.Echo

# Add Deepgram API key
cat > ~/.Echo/.env << EOF
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OBSIDIAN_VAULT_PATH=~/Documents/ObsidianVault
HERMES_PATH=~/.hermes/hermes-agent
EOF
```

### 4. Build Echo Application

```bash
# Create signing certificate (first time only)
npm run create-cert

# Build the application
npm run build:mac

# Install to Applications
cp -r dist/mac/Echo.app ~/Applications/

# Grant permissions (first launch)
# System Preferences → Security & Privacy → Privacy
# Enable: Microphone, Screen Recording
```

---

## Integration Configuration

### Meeting Context Skill

Create a Hermes skill for enhanced meeting analysis:

```bash
# Create meeting assistant skill
cat > ~/.hermes/skills/meeting-assistant.md << 'EOF'
---
name: meeting-assistant
version: 1.0.0
description: Enhanced meeting analysis and context management
tags: [meetings, transcription, analysis]
---

# Meeting Assistant Skill

## Capabilities

When processing meeting transcripts, I will:

1. **Speaker Analysis**
   - Track individual contributions
   - Identify discussion leaders
   - Note participation balance

2. **Content Extraction**
   - Key topics and themes
   - Decisions made
   - Action items with owners
   - Questions raised
   - Risks and concerns

3. **Meeting Flow**
   - Opening context
   - Main discussion points
   - Conclusions reached
   - Next steps defined

4. **Intelligent Summaries**
   - Executive summary (2-3 sentences)
   - Detailed notes by topic
   - Participant-specific takeaways

5. **Cross-Meeting Context**
   - Reference previous meetings
   - Track ongoing projects
   - Monitor action item completion
   - Identify recurring themes

## Output Format

Meeting notes should follow this structure:

```markdown
# Meeting: [Title]
Date: [YYYY-MM-DD HH:MM]
Participants: [List]
Duration: [Time]

## Executive Summary
[2-3 sentence overview]

## Key Topics Discussed
1. [Topic 1]
   - [Key point]
   - [Decision/Outcome]

## Action Items
- [ ] [Action] - Owner: [Name] - Due: [Date]

## Decisions Made
- [Decision 1]
- [Decision 2]

## Follow-up Required
- [Item 1]

## Full Transcript
[Diarized transcript]
```

## Integration Points

- **Obsidian**: Auto-save to vault
- **Calendar**: Link to calendar events
- **Hermes Memory**: Persist key context
EOF

# Enable the skill
hermes skill enable meeting-assistant
```

### Obsidian Integration

```bash
# Create Obsidian templates directory
mkdir -p ~/Documents/ObsidianVault/Templates

# Create meeting template
cat > ~/Documents/ObsidianVault/Templates/meeting.md << 'EOF'
---
tags: [meeting, echo]
created: {{date}}
participants: {{participants}}
---

# {{title}}

## Summary
{{summary}}

## Action Items
{{action_items}}

## Notes
{{notes}}

## Transcript
{{transcript}}
EOF
```

### Google Calendar Setup

#### 1. Enable API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project: "Echo Meeting Assistant"
3. Enable APIs:
   - Google Calendar API
   - Google People API

#### 2. Create Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Desktop app**
4. Name: "Echo"
5. Download JSON file

#### 3. Configure Echo

```bash
# Move credentials to Echo config
mv ~/Downloads/credentials.json ~/.Echo/google-credentials.json

# Add to environment
echo "GOOGLE_CALENDAR_ENABLED=true" >> ~/.Echo/.env
```

---

## Advanced Features

### Custom Prompts

Create custom meeting prompts:

```bash
# Create prompts directory
mkdir -p ~/Desktop/cluely-hermes/prompts/custom

# Create industry-specific prompt
cat > ~/Desktop/cluely-hermes/prompts/custom/engineering.md << 'EOF'
# Engineering Meeting Prompt

Focus on:
- Technical decisions and tradeoffs
- Architecture discussions
- Code review outcomes
- Bug priorities
- Sprint planning items
- Technical debt discussions
- Performance metrics
- Deployment plans

Extract:
- Technical specifications
- API changes
- Database schema updates
- Security considerations
- Testing requirements
EOF
```

### Workflow Automation

```bash
# Create automation script
cat > ~/.Echo/scripts/post-meeting.sh << 'EOF'
#!/bin/bash

# Auto-commit meeting notes to git
cd ~/Documents/ObsidianVault
git add Meetings/*.md
git commit -m "Add meeting notes: $(date +%Y-%m-%d)"
git push

# Send summary to Slack
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d "{\"text\": \"Meeting completed. Notes saved to Obsidian.\"}"

# Update project board
hermes task create "Review meeting action items from $(date +%Y-%m-%d)"
EOF

chmod +x ~/.Echo/scripts/post-meeting.sh
```

### Privacy Configuration

```bash
# Configure privacy settings
cat >> ~/.Echo/.env << 'EOF'

# Privacy Settings
LOCAL_ONLY=false
ENCRYPT_NOTES=true
AUTO_DELETE_RECORDINGS=true
DELETE_AFTER_DAYS=30

# Excluded Applications (won't record)
EXCLUDE_APPS=1Password,Bitwarden,Banking

# Sensitive word filtering
FILTER_PATTERNS=ssn:,password:,secret:,key:
EOF
```

---

## Troubleshooting

### Common Issues

#### Audio Not Working

```bash
# Check audio device
system_profiler SPAudioDataType | grep "OpenCluely"

# Reset audio routing
sudo killall coreaudiod

# Verify FFmpeg
ffmpeg -f avfoundation -list_devices true -i ""
```

#### Hermes Connection Failed

```bash
# Check Hermes installation
ls -la ~/.hermes/hermes-agent/venv/bin/python3

# Test Hermes directly
~/.hermes/hermes-agent/venv/bin/python3 -c "from hermes import AIAgent; print('OK')"

# Check Python version
~/.hermes/hermes-agent/venv/bin/python3 --version
```

#### Deepgram API Issues

```bash
# Test Deepgram connection
curl https://api.deepgram.com/v1/listen \
  -H "Authorization: Token YOUR_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @test.wav
```

### Debug Mode

```bash
# Run Echo in debug mode
DEBUG=* npm start

# Check logs
tail -f ~/.Echo/logs/echo.log

# Monitor Hermes bridge
tail -f ~/.Echo/logs/hermes_bridge.log
```

### Performance Optimization

```bash
# Optimize Hermes for meetings
hermes config set max_context_length 8000
hermes config set temperature 0.7
hermes config set streaming true

# Optimize Deepgram
cat >> ~/.Echo/.env << 'EOF'
DEEPGRAM_MODEL=nova-2
DEEPGRAM_LANGUAGE=en-US
DEEPGRAM_PUNCTUATE=true
DEEPGRAM_DIARIZE=true
DEEPGRAM_UTTERANCES=true
EOF
```

---

## Support & Resources

- **Echo Documentation**: [GitHub Wiki](https://github.com/EstebanCastel/cluely-hermes/wiki)
- **Hermes Documentation**: [Official Docs](https://hermes-agent.nousresearch.com)
- **Community Discord**: [Join Server](https://discord.gg/echo-meeting)
- **Issue Tracker**: [GitHub Issues](https://github.com/EstebanCastel/cluely-hermes/issues)

---

## Next Steps

1. ✅ Complete installation
2. ✅ Configure integrations
3. 🎯 Test with a sample meeting
4. 🎯 Customize prompts for your use case
5. 🎯 Set up automation workflows
6. 🎯 Join the community for tips and updates

---

*Last updated: 2024*