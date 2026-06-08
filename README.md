# Echo - AI-Powered Meeting Assistant

![Echo Banner](https://img.shields.io/badge/Echo-Meeting_Assistant-6366f1?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-macOS-black?style=for-the-badge)
![Powered by Hermes](https://img.shields.io/badge/Powered_by-Hermes-purple?style=for-the-badge)

**Echo** is an open-source meeting assistant for macOS that provides real-time transcription, screen awareness, and AI-powered insights through [Hermes](https://hermes-agent.nousresearch.com). A privacy-focused alternative to Cluely that keeps your data local and secure.

## ✨ Features

- 🎙️ **Live Diarized Transcription** - Real-time speaker separation using Deepgram API with channel-based diarization
- 🧠 **Hermes AI Integration** - Intelligent meeting insights powered by Hermes AI agent
- 👁️ **Screen Context** - Capture and analyze screen content for context-aware assistance
- 📝 **Obsidian Notes** - Automatic meeting notes saved to your Obsidian vault
- 📅 **Google Calendar** - Seamless calendar integration for scheduled meetings
- 🕵️ **Privacy First** - Undetectable during screen sharing with content protection mode
- ⌨️ **Customizable Shortcuts** - Configure keyboard shortcuts to your preference

## 📋 Requirements

- **macOS** (Apple Silicon recommended)
- **[Hermes](https://hermes-agent.nousresearch.com)** - AI agent installation
- **FFmpeg** - For audio processing (`brew install ffmpeg`)
- **[BlackHole](https://github.com/ExistentialAudio/BlackHole)** - Virtual audio device
- **[Deepgram API Key](https://console.deepgram.com)** - For transcription services

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install Hermes (if not already installed)
curl -fsSL https://raw.githubusercontent.com/nousresearch/hermes-agent/main/install.sh | bash

# Install FFmpeg
brew install ffmpeg

# Download and install BlackHole from:
# https://github.com/ExistentialAudio/BlackHole
```

### 2. Setup Audio Device

Create an Aggregate Device in Audio MIDI Setup:
- Name: `OpenCluely In`
- Channel 0: Your Microphone
- Channels 1-2: BlackHole 2ch

### 3. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/EstebanCastel/cluely-hermes.git
cd cluely-hermes

# Install Node dependencies
npm install

# Configure Deepgram API key
mkdir -p ~/.Echo
echo "DEEPGRAM_API_KEY=your_api_key_here" >> ~/.Echo/.env
```

### 4. Configure Hermes

```bash
# Configure your LLM provider
hermes config set openai.api_key YOUR_KEY
# OR
hermes config set anthropic.api_key YOUR_KEY

# Set default model
hermes config set model gpt-4o
```

### 5. Build and Run

```bash
# Development mode
npm start

# Build application
npm run create-cert        # First time only
npm run build-and-install  # Build and install to ~/Applications
```

## 🔧 Configuration

### Hermes Integration

Echo uses Hermes as its AI brain through a Python sidecar bridge located at:
```
sidecar/hermes_bridge.py
```

The bridge connects to your Hermes installation at `~/.hermes/hermes-agent/` and provides:
- Context-aware meeting insights
- Intelligent summarization
- Action item extraction
- Meeting history tracking

### Obsidian Integration

Configure your Obsidian vault path in Settings or via environment:

```bash
echo "OBSIDIAN_VAULT_PATH=~/Documents/ObsidianVault" >> ~/.Echo/.env
```

Meeting notes are automatically saved as:
```
ObsidianVault/Meetings/YYYY-MM-DD-Meeting-Title.md
```

### Google Calendar

1. Enable Google Calendar API in Google Cloud Console
2. Download OAuth credentials as `credentials.json`
3. Place in Echo config directory:
   ```bash
   mv ~/Downloads/credentials.json ~/.Echo/google-credentials.json
   ```
4. Authorize through Echo Settings → Integrations

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Capture Screen | `⌘⇧S` |
| Show/Hide Echo | `⌘⇧V` |
| Toggle Interaction | `⌘⇧I` / `⌥A` |
| Open Settings | `⌘,` |
| Move Window | `⌘` + arrows |
| Show History | `↓` |

All shortcuts are customizable in Settings → Shortcuts.

## 🏗️ Architecture

```
Echo Architecture
├── main.js                 # Electron main process
├── src/
│   ├── services/
│   │   ├── speech.service.js    # Audio capture & Deepgram
│   │   ├── brain.service.js     # Hermes AI bridge
│   │   ├── context.service.js   # Context management
│   │   └── capture.service.js   # Screen capture
│   └── ui/
│       ├── hub.js               # Main UI window
│       └── settings-window.js   # Settings interface
├── sidecar/
│   └── hermes_bridge.py         # Hermes Python integration
└── prompts/                     # AI prompt templates
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📖 Documentation

- [Full Documentation](https://estebancastel.github.io/cluely-hermes/)
- [API Reference](https://github.com/EstebanCastel/cluely-hermes/wiki/API)
- [Hermes Documentation](https://hermes-agent.nousresearch.com)
- [Troubleshooting Guide](https://github.com/EstebanCastel/cluely-hermes/wiki/Troubleshooting)

## 🐛 Support

- [Issue Tracker](https://github.com/EstebanCastel/cluely-hermes/issues)
- [Discussions](https://github.com/EstebanCastel/cluely-hermes/discussions)
- [Discord Community](https://discord.gg/echo-meeting)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Hermes AI Agent](https://hermes-agent.nousresearch.com) - The AI brain powering Echo
- [Deepgram](https://deepgram.com) - Real-time transcription
- [BlackHole](https://github.com/ExistentialAudio/BlackHole) - Virtual audio routing
- [Obsidian](https://obsidian.md) - Knowledge management

---

<p align="center">
Built with ❤️ by the open-source community<br>
Powered by <a href="https://hermes-agent.nousresearch.com">Hermes AI</a>
</p>