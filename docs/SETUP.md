# Setup & Installation 🛠️

Follow these steps to set up MariePsychic for local development.

## 📋 Prerequisites
- **Node.js**: v18 or higher.
- **VS Code**: v1.84.0 or higher.
- **API Keys**: Anthropic API Key or OpenRouter API Key.

## 🚀 Getting Started

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/bozoegg/MariePsychic.git
   cd MariePsychic
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build the Webview**:
   The extension uses a React-based webview. You must build it first:
   ```bash
   npm run build-webview
   ```

4. **Compile the Extension**:
   ```bash
   npm run compile
   ```

5. **Launch**:
   - Press `F5` in VS Code to open a new "Extension Development Host" window.
   - Marie will appear in the Activity Bar on the left.

## ⚙️ Configuration

Marie is configured via VS Code Settings (`Cmd+,` or `Ctrl+,`):

- `marie.apiKey`: Your Anthropic API Key.
- `marie.openrouterApiKey`: Your OpenRouter API Key.
- `marie.aiProvider`: Choose between `anthropic` or `openrouter`.
- `marie.model`: Specify the model ID (e.g., `claude-3-5-sonnet-20241022`).
- `marie.requireApproval`: (Default: `true`) Ask for permission before writing files or running commands.

## 🛠️ Development Scripts

- `npm run watch`: Compiles the extension and watches for changes.
- `npm run watch-webview`: Runs the webview in development mode with HMR.
- `npm run package`: Builds the final `.vsix` file for installation.

---
*Verified and Documented with Love. ✨*
