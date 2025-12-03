# SF Wormhole Deploy - Smart Salesforce Deployment Extension

Automatically resolves and deploys missing dependencies for Salesforce components.

## Features

- **Automatic Dependency Resolution**: When deploying a component fails due to missing dependencies, SF Wormhole Deploy automatically identifies and deploys them first.

- **OAuth Authentication**: Secure authentication to your Salesforce orgs via OAuth.

- **Smart Retry Logic**: Automatically retries failed deployments after resolving dependencies.

- **Queue Management**: Handles complex dependency chains and deployment queues.

## How It Works

1. **Deploy Component**: Select a Salesforce component (Apex class, trigger, etc.) and deploy it.

2. **Error Detection**: If the deployment fails, SF Wormhole Deploy analyzes the error output.

3. **Dependency Identification**: Extracts missing component names from error messages.

4. **Automatic Deployment**: Deploys missing dependencies first.

5. **Retry Original**: After dependencies are deployed, automatically retries the original component.

## Usage

### Authenticate to Salesforce Org

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: `SF Wormhole Deploy: Authenticate Salesforce Org`
3. Follow the OAuth flow in your browser

### Deploy Component

**Option 1: From Explorer**

- Right-click on a Salesforce component file (`.cls`, `.trigger`, etc.)
- Select "Deploy Component (with Auto-Dependencies)"

**Option 2: From Command Palette**

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run: `SF Wormhole Deploy: Deploy Component (with Auto-Dependencies)`
3. Select the component file(s) to deploy

## Requirements

- VS Code 1.74.0 or higher
- Node.js (for building the extension)
- Salesforce CLI (`sf`) installed and configured

## Installation

1. Clone this repository
2. Run `npm install`
3. Press `F5` to open Extension Development Host
4. Test the extension in the new window

## Building

```bash
npm install
npm run compile
```

## Packaging

```bash
npm install -g vsce
vsce package
```

## Supported Component Types

- Apex Classes (`.cls`)
- Apex Triggers (`.trigger`)
- Custom Objects
- Lightning Web Components (LWC)
- Aura Components

## Error Patterns Detected

The extension recognizes various Salesforce deployment error patterns:

- `Class 'ClassName' does not exist`
- `Dependent class is invalid and needs recompilation`
- `No such column 'Field__c' on entity 'CustomObject__c'`
- `Invalid type: ClassName`
- And more...

## License

MIT
