import * as vscode from "vscode";
import { DeploymentOrchestrator } from "./deployment/orchestrator";
import { StateManager } from "./utils/stateManager";
import { CLIExecutor } from "./utils/cliExecutor";
import { ErrorParser } from "./utils/errorParser";
import { ComponentLocator } from "./utils/componentLocator";
import { OAuthHandler } from "./utils/oauthHandler";
import { ComponentInfo } from "./types";

let orchestrator: DeploymentOrchestrator | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Extension activated
  const outputChannel = vscode.window.createOutputChannel("SF Wormhole Deploy");
  outputChannel.appendLine("SF Wormhole Deploy extension activating...");

  // Initialize components
  const stateManager = new StateManager();
  const cliExecutor = new CLIExecutor(outputChannel);
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const componentLocator = new ComponentLocator(workspaceRoot);
  const oauthHandler = new OAuthHandler(cliExecutor);
  const errorParser = new ErrorParser(outputChannel);

  orchestrator = new DeploymentOrchestrator(
    stateManager,
    cliExecutor,
    errorParser,
    componentLocator,
    oauthHandler,
    outputChannel
  );

  // Register commands
  const deployCommand = vscode.commands.registerCommand(
    "wormhole.deployComponent",
    async (uri?: vscode.Uri) => {
      if (!orchestrator) {
        vscode.window.showErrorMessage("Extension not properly initialized");
        return;
      }

      let components: ComponentInfo[] = [];

      if (uri) {
        // Deploy from context menu (file/folder selected)
        const component = await componentLocator.pathToComponent(uri.fsPath);
        if (component) {
          components = [component];
        } else {
          vscode.window.showErrorMessage(
            "Could not determine component type from selected file"
          );
          return;
        }
      } else {
        // Deploy from command palette - ask user to select file
        const fileUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: true,
          openLabel: "Select Component(s) to Deploy",
        });

        if (!fileUri || fileUri.length === 0) {
          return;
        }

        for (const uri of fileUri) {
          const component = await componentLocator.pathToComponent(uri.fsPath);
          if (component) {
            components.push(component);
          }
        }

        if (components.length === 0) {
          vscode.window.showErrorMessage(
            "No valid Salesforce components found in selected files"
          );
          return;
        }
      }

      await orchestrator.deployComponents(components);
    }
  );

  const authenticateCommand = vscode.commands.registerCommand(
    "wormhole.authenticateOrg",
    async () => {
      if (!oauthHandler) {
        vscode.window.showErrorMessage("Extension not properly initialized");
        return;
      }

      const alias = await vscode.window.showInputBox({
        prompt: "Enter org alias (optional)",
        placeHolder: "my-org",
        ignoreFocusOut: true,
      });

      await oauthHandler.authenticate(alias || undefined);
    }
  );

  context.subscriptions.push(deployCommand, authenticateCommand);

  // Verify commands are registered
  vscode.commands.getCommands(true).then((commands) => {
    const wormholeCommands = commands.filter((cmd) =>
      cmd.startsWith("wormhole.")
    );
    outputChannel.appendLine(
      `SF Wormhole Deploy extension activated successfully!`
    );
    outputChannel.appendLine(
      `Found ${
        wormholeCommands.length
      } SF Wormhole Deploy commands: ${wormholeCommands.join(", ")}`
    );

    if (wormholeCommands.length === 0) {
      outputChannel.appendLine(
        "WARNING: No SF Wormhole Deploy commands found in VS Code command registry!"
      );
    }
  });

  vscode.window.showInformationMessage(
    "SF Wormhole Deploy extension is now active!"
  );
}

export function deactivate() {
  // Cleanup if needed
}
