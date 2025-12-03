# SF Wormhole Deploy - Setup Instructions

Complete guide to set up and use the SF Wormhole Deploy extension in VS Code.

## Prerequisites

Before you begin, ensure you have the following installed:

1. **VS Code** (version 1.74.0 or higher)

   - Download from: https://code.visualstudio.com/

2. **Node.js** (version 14.x or higher)

   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

3. **npm** (comes with Node.js)

   - Verify installation: `npm --version`

4. **Salesforce CLI** (`sf`)

   - Download from: https://developer.salesforce.com/tools/salesforcecli
   - Verify installation: `sf --version`
   - Ensure it's in your system PATH

5. **Git** (optional, for cloning the repository)
   - Download from: https://git-scm.com/
   - Verify installation: `git --version`

## Installation Methods

### Method 1: Install from Source (Development)

This method allows you to modify and extend the extension.

#### Step 1: Clone or Download the Repository

**Option A: Clone via Git**

```bash
git clone https://github.com/aderbyPersonalHub/SF_Wormhole_Deploy.git
cd SF_Wormhole_Deploy
```

**Option B: Download ZIP**

1. Go to https://github.com/aderbyPersonalHub/SF_Wormhole_Deploy
2. Click "Code" → "Download ZIP"
3. Extract the ZIP file
4. Open the extracted folder in VS Code

#### Step 2: Install Dependencies

Open a terminal in VS Code (`Terminal` → `New Terminal`) and run:

```bash
npm install
```

This will install all required dependencies listed in `package.json`.

#### Step 3: Compile TypeScript

Compile the TypeScript source code to JavaScript:

```bash
npm run compile
```

You should see the compiled files in the `out/` directory.

#### Step 4: Open Extension Development Host

1. Press `F5` or go to `Run` → `Start Debugging`
2. A new VS Code window will open (Extension Development Host)
3. This window has your extension loaded and ready to use

#### Step 5: Verify Installation

In the Extension Development Host window:

1. Open the Output panel (`View` → `Output`)
2. Select "SF Wormhole Deploy" from the dropdown
3. You should see: "SF Wormhole Deploy extension activated successfully!"

### Method 2: Install from VSIX Package (Production)

If you have a `.vsix` package file:

1. Open VS Code
2. Go to Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Click the `...` menu (top right)
4. Select "Install from VSIX..."
5. Choose your `.vsix` file
6. Reload VS Code when prompted

## Initial Setup

### Step 1: Authenticate to Salesforce Org

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type: `SF Wormhole Deploy: Authenticate Salesforce Org`
3. Select the command
4. Choose org type:
   - **Production**: For production orgs (`login.salesforce.com`)
   - **Sandbox**: For sandbox orgs (`test.salesforce.com`)
5. Follow the OAuth flow in your browser
6. Enter an org alias (optional, e.g., "my-org")
7. Click "Allow" to authorize

**Verify Authentication:**

- The extension will show a success message
- You can verify by running: `sf org list` in terminal

### Step 2: Configure Your Salesforce Project

Ensure your VS Code workspace contains a Salesforce project:

```
your-project/
├── force-app/
│   └── main/
│       └── default/
│           ├── classes/
│           ├── triggers/
│           ├── objects/
│           └── ...
├── sfdx-project.json
└── .forceignore
```

## Usage

### Deploy a Component

#### Option 1: From File Explorer (Right-Click)

1. In VS Code Explorer, navigate to your Salesforce component file
2. Right-click on the file (e.g., `MyClass.cls`)
3. Select **"Deploy Component (with Auto-Dependencies)"**
4. Watch the Output panel for deployment progress

#### Option 2: From Command Palette

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type: `SF Wormhole Deploy: Deploy Component (with Auto-Dependencies)`
3. Select the command
4. Choose one or more component files to deploy
5. Click "Open"
6. Watch the Output panel for deployment progress

### Understanding the Output

The extension provides detailed logging in the Output panel:

- **🔍 DEPLOYMENT DEBUG INFO**: Shows components being deployed
- **📦 Generating package.xml**: Creates the deployment manifest
- **🚀 Starting deployment**: Executes the Salesforce CLI command
- **✅ SUCCESS** or **❌ FAILED**: Deployment result
- **🔍 Searching repository**: Finding missing dependencies
- **📦 Deploying X component(s) together**: Combined deployment

### How Dependency Resolution Works

1. **Initial Deployment**: Extension attempts to deploy your selected component
2. **Error Detection**: If deployment fails, it analyzes the error output
3. **Dependency Identification**: Extracts missing component names from errors
4. **Repository Search**: Finds missing components in your local workspace
5. **Combined Deployment**: Deploys original component + dependencies together
6. **Recursive Resolution**: If more dependencies are found, repeats the process

### Supported Component Types

- ✅ Apex Classes (`.cls`)
- ✅ Apex Triggers (`.trigger`)
- ✅ Custom Objects
- ✅ Custom Fields (`ObjectName.FieldName__c`)
- ✅ Lightning Web Components (LWC)
- ✅ Aura Components

## File Locations

The extension creates and saves files in your workspace:

### Manifest Files

- **Location**: `.wormhole/manifests/`
- **Format**: `package-attempt-N-TIMESTAMP.xml`
- **Purpose**: Contains the deployment manifest sent to Salesforce

### Response Files

- **Location**: `.wormhole/responses/`
- **Format**: `response-attempt-N-success/failed-TIMESTAMP.txt`
- **Purpose**: Contains the full Salesforce CLI response for each deployment

These files are kept for reference and debugging.

## Troubleshooting

### Extension Not Activating

**Symptoms:**

- Commands don't appear in Command Palette
- No output in "SF Wormhole Deploy" channel

**Solutions:**

1. Check Output panel → "SF Wormhole Deploy" for errors
2. Verify `package.json` is valid JSON
3. Run `npm run compile` to check for TypeScript errors
4. Reload VS Code window (`Cmd+R` / `Ctrl+R`)

### "sf: command not found"

**Symptoms:**

- Error when trying to deploy
- "Command not found" in output

**Solutions:**

1. Install Salesforce CLI: https://developer.salesforce.com/tools/salesforcecli
2. Verify installation: `sf --version`
3. Ensure Salesforce CLI is in your PATH
4. Restart VS Code after installation

### Authentication Fails

**Symptoms:**

- OAuth flow doesn't complete
- "Authentication failed" error

**Solutions:**

1. Check your internet connection
2. Verify you're using the correct org type (Production vs Sandbox)
3. Try authenticating via terminal: `sf org login web`
4. Check Salesforce status: https://status.salesforce.com

### Components Not Found

**Symptoms:**

- "Could not find file for ComponentName" error

**Solutions:**

1. Verify component exists in `force-app/main/default/`
2. Check file naming matches Salesforce conventions
3. Ensure `.forceignore` isn't excluding the component
4. Verify component type is supported

### Deployment Fails with Same Error Repeatedly

**Symptoms:**

- Extension keeps trying to deploy the same components
- "Loop detected" message appears

**Solutions:**

1. Check the error output in `.wormhole/responses/`
2. The error may not be a dependency issue (syntax error, validation error, etc.)
3. Review the manifest file in `.wormhole/manifests/` to see what was deployed
4. Manually fix the underlying issue in your code

### TypeScript Compilation Errors

**Symptoms:**

- `npm run compile` fails
- Red squiggles in VS Code

**Solutions:**

1. Run `npm install` to ensure dependencies are installed
2. Check `tsconfig.json` is valid
3. Verify Node.js version: `node --version` (should be 14+)
4. Delete `node_modules` and `package-lock.json`, then run `npm install` again

## Advanced Configuration

### Custom API Version

The extension automatically detects your API version from:

1. `sfdx-project.json` → `sourceApiVersion`
2. Existing `manifest/package.xml` → `<version>` tag
3. Defaults to `60.0` if not found

To override, modify `sfdx-project.json`:

```json
{
  "sourceApiVersion": "65.0"
}
```

### Excluding Files from Deployment

The extension automatically excludes `conversationMessageDefinitions` directory.

To exclude additional files, add them to `.forceignore`:

```
force-app/main/default/conversationMessageDefinitions
your-other-excluded-path
```

## Development Workflow

### Making Changes

1. Edit TypeScript files in `src/`
2. Run `npm run compile` to compile
3. Press `F5` to reload Extension Development Host
4. Test your changes

### Watching for Changes

For automatic compilation during development:

```bash
npm run watch
```

This will automatically recompile when you save TypeScript files.

### Packaging for Distribution

To create a `.vsix` package:

```bash
npm install -g vsce
vsce package
```

This creates a `.vsix` file you can share or publish.

## Getting Help

### Check Logs

1. Open Output panel (`View` → `Output`)
2. Select "SF Wormhole Deploy" channel
3. Review error messages and debug information

### Review Saved Files

- Check `.wormhole/manifests/` for deployment manifests
- Check `.wormhole/responses/` for Salesforce CLI responses
- These files contain detailed information about each deployment attempt

### Common Issues

- **"No default org set"**: Authenticate to a Salesforce org first
- **"Invalid type" errors**: Component may not exist in your workspace
- **"Conflict" errors**: Use `--ignore-conflicts` flag (already included)
- **Metadata API errors**: Check Salesforce status, may be temporary

## Next Steps

1. ✅ Extension installed and activated
2. ✅ Authenticated to Salesforce org
3. ✅ Ready to deploy components!

Try deploying a simple Apex class to test the extension. The extension will automatically handle any missing dependencies.

## Support

For issues or questions:

- Check the Output panel for detailed error messages
- Review saved manifest and response files
- Check Salesforce CLI documentation: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/

Happy deploying! 🚀
