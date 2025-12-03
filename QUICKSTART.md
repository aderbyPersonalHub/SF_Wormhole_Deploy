# Quick Start Guide

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Compile TypeScript:**

   ```bash
   npm run compile
   ```

3. **Open in VS Code:**

   ```bash
   code .
   ```

4. **Run the extension:**
   - Press `F5` to launch Extension Development Host
   - A new VS Code window will open with your extension loaded

## Testing the Extension

### Step 1: Authenticate to Salesforce Org

1. In the Extension Development Host window, open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: `Wormhole: Authenticate Salesforce Org`
3. Follow the OAuth flow in your browser
4. Enter an org alias (optional)

### Step 2: Deploy a Component

**Option A: From Explorer**

- Right-click on a Salesforce component file (`.cls`, `.trigger`, etc.)
- Select "Deploy Component (with Auto-Dependencies)"

**Option B: From Command Palette**

1. Open Command Palette
2. Run: `Wormhole: Deploy Component (with Auto-Dependencies)`
3. Select component file(s) to deploy

### Step 3: Watch the Magic

- The extension will attempt to deploy your component
- If it fails due to missing dependencies, it will:
  1. Parse the error output
  2. Identify missing components
  3. Deploy dependencies automatically
  4. Retry the original deployment

## How It Works

1. **Deploy Component**: You select a component to deploy
2. **Error Detection**: If deployment fails, the extension analyzes the output
3. **Queue Original**: The failed deployment is queued for retry
4. **Find Dependencies**: Missing components are identified from error messages
5. **Deploy Dependencies**: Missing components are deployed first
6. **Retry Original**: After dependencies succeed, the original component is retried

## Architecture

- **`extension.ts`**: Entry point, command registration
- **`orchestrator.ts`**: Main deployment flow logic
- **`cliExecutor.ts`**: Executes Salesforce CLI commands
- **`errorParser.ts`**: Parses error output to find dependencies
- **`componentLocator.ts`**: Finds component files in workspace
- **`oauthHandler.ts`**: Handles Salesforce authentication
- **`stateManager.ts`**: Manages deployment queue and state

## Requirements

- VS Code 1.74.0+
- Node.js (for building)
- Salesforce CLI (`sf`) installed and in PATH

## Troubleshooting

**"sf: command not found"**

- Install Salesforce CLI: https://developer.salesforce.com/tools/salesforcecli
- Ensure it's in your PATH

**Type errors after npm install**

- Run `npm run compile` to check for TypeScript errors
- Ensure `@types/vscode` and `@types/node` are installed

**Extension not activating**

- Check Output > Wormhole channel for errors
- Verify `package.json` activation events are correct
