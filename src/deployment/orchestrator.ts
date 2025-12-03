import * as vscode from "vscode";
import { ComponentInfo, DeploymentResult } from "../types";
import { StateManager } from "../utils/stateManager";
import { CLIExecutor } from "../utils/cliExecutor";
import { ErrorParser } from "../utils/errorParser";
import { ComponentLocator } from "../utils/componentLocator";
import { OAuthHandler } from "../utils/oauthHandler";

export class DeploymentOrchestrator {
  private stateManager: StateManager;
  private cliExecutor: CLIExecutor;
  private errorParser: ErrorParser;
  private componentLocator: ComponentLocator;
  private oauthHandler: OAuthHandler;
  private outputChannel: vscode.OutputChannel;
  private attemptedDeployments: Set<string> = new Set(); // Track attempted component combinations
  private attemptedDeploymentDetails: Map<string, ComponentInfo[]> = new Map(); // Store component details for each attempt
  private deploymentAttemptCounter: number = 0; // Track attempt numbers for file naming

  constructor(
    stateManager: StateManager,
    cliExecutor: CLIExecutor,
    errorParser: ErrorParser,
    componentLocator: ComponentLocator,
    oauthHandler: OAuthHandler,
    outputChannel: vscode.OutputChannel
  ) {
    this.stateManager = stateManager;
    this.cliExecutor = cliExecutor;
    this.errorParser = errorParser;
    this.componentLocator = componentLocator;
    this.oauthHandler = oauthHandler;
    this.outputChannel = outputChannel;
  }

  /**
   * Main deployment flow
   */
  public async deployComponents(
    components: ComponentInfo[],
    recursionDepth: number = 0
  ): Promise<void> {
    // Prevent infinite recursion (max 5 levels)
    if (recursionDepth > 5) {
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine(
        "❌ Maximum recursion depth reached. Stopping to prevent infinite loop."
      );
      vscode.window.showErrorMessage(
        "Deployment failed: Maximum recursion depth reached. Check output for details."
      );
      return;
    }

    // Create a signature for this component combination
    const componentSignature = this.getComponentSignature(components);

    // Check if we've already tried deploying this exact combination
    if (this.attemptedDeployments.has(componentSignature)) {
      const previousAttempt =
        this.attemptedDeploymentDetails.get(componentSignature);
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine(
        "⚠️  LOOP DETECTED: Already attempted deploying these exact components together."
      );
      this.outputChannel.appendLine("");
      if (previousAttempt) {
        this.outputChannel.appendLine(
          "   Last attempt included these components:"
        );
        previousAttempt.forEach((comp, index) => {
          this.outputChannel.appendLine(
            `     ${index + 1}. ${comp.type}: ${comp.name}`
          );
        });
      }
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine(
        "   Current attempt includes these components:"
      );
      components.forEach((comp, index) => {
        this.outputChannel.appendLine(
          `     ${index + 1}. ${comp.type}: ${comp.name}`
        );
      });
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine(
        "   No new dependencies found. Stopping to prevent infinite loop."
      );
      vscode.window.showErrorMessage(
        "Deployment failed: No new dependencies found. The same error persists."
      );
      return;
    }

    // Mark this combination as attempted and store component details
    this.attemptedDeployments.add(componentSignature);
    this.attemptedDeploymentDetails.set(componentSignature, [...components]);

    this.outputChannel.show();
    if (recursionDepth === 0) {
      this.outputChannel.appendLine("=== Starting SF Wormhole Deploy ===");
    } else {
      this.outputChannel.appendLine(
        `=== Recursive Deployment Attempt ${recursionDepth} ===`
      );
    }
    this.outputChannel.appendLine("");

    // Step 1: Ensure authentication
    const isAuthenticated = await this.oauthHandler.isAuthenticated();
    if (!isAuthenticated) {
      const authenticate = await vscode.window.showWarningMessage(
        "Not authenticated to Salesforce. Would you like to authenticate now?",
        "Yes",
        "Cancel"
      );

      if (authenticate === "Yes") {
        const authSuccess = await this.oauthHandler.authenticate();
        if (!authSuccess) {
          vscode.window.showErrorMessage(
            "Authentication required to deploy components."
          );
          return;
        }
      } else {
        return;
      }
    }

    const orgAlias = await this.oauthHandler.getDefaultOrgAlias();

    // Increment attempt counter for file naming
    this.deploymentAttemptCounter++;
    const currentAttempt = this.deploymentAttemptCounter;

    // Step 2: Initial deployment attempt
    // If recursing, show detailed component list
    if (recursionDepth > 0) {
      this.outputChannel.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      this.outputChannel.appendLine(
        "📤 SENDING TO SALESFORCE (Recursive Attempt)"
      );
      this.outputChannel.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      this.outputChannel.appendLine(
        `Components to deploy: ${components.length}`
      );
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine("Component List:");
      components.forEach((comp, index) => {
        this.outputChannel.appendLine(
          `  ${index + 1}. ${comp.type}: ${comp.name}`
        );
        if (comp.filePath) {
          this.outputChannel.appendLine(`     File: ${comp.filePath}`);
        }
      });
      this.outputChannel.appendLine("");
    } else {
      this.outputChannel.appendLine(
        `Deploying ${components.length} component(s)...`
      );
    }
    const initialResult = await this.deployComponentList(
      components,
      orgAlias,
      currentAttempt
    );

    // Step 3: If error, queue the deployment
    if (!initialResult.success) {
      this.outputChannel.appendLine(
        "Initial deployment failed. Queuing for retry..."
      );
      this.stateManager.queueDeployment(components);
    } else {
      this.outputChannel.appendLine("✓ Initial deployment successful!");
      vscode.window.showInformationMessage(
        "Deployment completed successfully!"
      );
      return;
    }

    // Step 4: Parse errors and find missing dependencies
    let missingDependencies = this.errorParser.parseMissingDependencies(
      initialResult.output
    );

    // Filter out single-digit dependencies (likely line number parsing errors)
    missingDependencies = missingDependencies.filter(
      (dep) => !(/^\d+$/.test(dep.name) && dep.name.length === 1)
    );

    if (missingDependencies.length === 0) {
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine(
        "⚠️  No missing dependencies detected in error output."
      );
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine("   This could mean:");
      this.outputChannel.appendLine(
        "   1. The deployment actually succeeded (check your org)"
      );
      this.outputChannel.appendLine(
        "   2. The error is a different type (syntax, validation, etc.)"
      );
      this.outputChannel.appendLine(
        "   3. The error format is not recognized by the parser"
      );
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine("   Error output preview:");
      const errorPreview = initialResult.output
        .split("\n")
        .slice(0, 10)
        .join("\n");
      this.outputChannel.appendLine(
        `   ${errorPreview.replace(/\n/g, "\n   ")}`
      );
      this.outputChannel.appendLine("");
      vscode.window.showErrorMessage(
        "Deployment failed. Check output for details."
      );
      return;
    }

    this.outputChannel.appendLine(
      `Found ${missingDependencies.length} missing dependency/dependencies:`
    );
    missingDependencies.forEach((dep) => {
      this.outputChannel.appendLine(`  - ${dep.type}: ${dep.name}`);
    });
    this.outputChannel.appendLine("");

    // Step 5: Search repository for dependency files and add to manifest
    this.outputChannel.appendLine(
      "🔍 Searching repository for dependency files..."
    );
    const allComponentsToDeploy: ComponentInfo[] = [...components]; // Start with original components
    const failedDependencies: ComponentInfo[] = [];

    for (const dependency of missingDependencies) {
      // Handle CustomField dependencies specially
      if (dependency.type === "CustomField") {
        // Check if this field is already included (might be in format "ObjectName.FieldName__c")
        const alreadyIncluded = allComponentsToDeploy.some(
          (c) =>
            c.type === "CustomField" &&
            (c.name === dependency.name ||
              c.name.endsWith(`.${dependency.name}`) ||
              dependency.name === c.name.split(".").pop())
        );
        if (alreadyIncluded) {
          this.outputChannel.appendLine(
            `  ✓ CustomField ${dependency.name} already included in deployment`
          );
          continue;
        }
        this.outputChannel.appendLine(
          `  Searching for CustomField: ${dependency.name}...`
        );
        const objectName = await this.componentLocator.findObjectForField(
          dependency.name
        );

        if (!objectName) {
          this.outputChannel.appendLine(
            `  ⚠ Could not find object for field ${dependency.name}`
          );
          failedDependencies.push(dependency);
          continue;
        }

        // Create CustomField component with format "ObjectName.FieldName__c"
        const customFieldComponent: ComponentInfo = {
          type: "CustomField",
          name: `${objectName}.${dependency.name}`,
        };
        allComponentsToDeploy.push(customFieldComponent);
        this.outputChannel.appendLine(
          `  ✓ Found CustomField: ${objectName}.${dependency.name}`
        );
        continue;
      }

      // Skip if already in the deployment list (for non-CustomField types)
      const alreadyIncluded = allComponentsToDeploy.some(
        (c) => c.type === dependency.type && c.name === dependency.name
      );
      if (alreadyIncluded) {
        this.outputChannel.appendLine(
          `  ✓ ${dependency.name} already included in deployment`
        );
        continue;
      }

      // Find component file in repository (under force-app/main/default)
      this.outputChannel.appendLine(
        `  Searching for ${dependency.type}: ${dependency.name}...`
      );
      const filePath = await this.componentLocator.findComponentFile(
        dependency
      );

      if (!filePath) {
        this.outputChannel.appendLine(
          `  ⚠ Could not find file for ${dependency.type}: ${dependency.name}`
        );
        failedDependencies.push(dependency);
        continue;
      }

      // Determine component type from file path
      const componentInfo = await this.componentLocator.pathToComponent(
        filePath
      );
      if (componentInfo) {
        componentInfo.filePath = filePath;
        allComponentsToDeploy.push(componentInfo);
        this.outputChannel.appendLine(
          `  ✓ Found ${componentInfo.type}: ${componentInfo.name} at ${filePath}`
        );
      } else {
        // Fallback: use the dependency info we have
        dependency.filePath = filePath;
        allComponentsToDeploy.push(dependency);
        this.outputChannel.appendLine(
          `  ✓ Found ${dependency.type}: ${dependency.name} at ${filePath}`
        );
      }
    }

    this.outputChannel.appendLine("");
    this.outputChannel.appendLine(
      `📦 Deploying ${allComponentsToDeploy.length} component(s) together:`
    );
    allComponentsToDeploy.forEach((comp, index) => {
      this.outputChannel.appendLine(
        `  ${index + 1}. ${comp.type}: ${comp.name}`
      );
    });
    this.outputChannel.appendLine("");

    // Step 6: Deploy all components together (original + dependencies) in one manifest
    // Log deployment details before deploying
    this.outputChannel.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    this.outputChannel.appendLine("📤 SENDING TO SALESFORCE");
    this.outputChannel.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    this.outputChannel.appendLine(
      `Components to deploy: ${allComponentsToDeploy.length}`
    );
    this.outputChannel.appendLine("");
    this.outputChannel.appendLine("Component List:");
    allComponentsToDeploy.forEach((comp, index) => {
      this.outputChannel.appendLine(
        `  ${index + 1}. ${comp.type}: ${comp.name}`
      );
      if (comp.filePath) {
        this.outputChannel.appendLine(`     File: ${comp.filePath}`);
      }
    });
    this.outputChannel.appendLine("");

    // Mark this combination as attempted BEFORE deploying (for loop detection)
    const deploymentSignature = this.getComponentSignature(
      allComponentsToDeploy
    );
    if (!this.attemptedDeployments.has(deploymentSignature)) {
      this.attemptedDeployments.add(deploymentSignature);
      this.attemptedDeploymentDetails.set(deploymentSignature, [
        ...allComponentsToDeploy,
      ]);
    }

    // Increment attempt counter for the combined deployment
    this.deploymentAttemptCounter++;
    const combinedAttempt = this.deploymentAttemptCounter;

    const combinedResult = await this.deployComponentList(
      allComponentsToDeploy,
      orgAlias,
      combinedAttempt
    );

    if (combinedResult.success) {
      this.outputChannel.appendLine("✓ All components deployed successfully!");
      vscode.window.showInformationMessage(
        "SF Wormhole Deploy completed successfully!"
      );

      // Mark all components as deployed
      allComponentsToDeploy.forEach((comp) => {
        this.stateManager.markDeployed(comp);
      });
    } else {
      // Check if it's a conflict error
      if (this.errorParser.isConflictError(combinedResult.output)) {
        const conflictComponents = this.errorParser.parseConflictComponents(
          combinedResult.output
        );
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          "⚠️  CONFLICT DETECTED: Some components have conflicts with the org"
        );
        conflictComponents.forEach((comp) => {
          this.outputChannel.appendLine(
            `   Conflict: ${comp.type}: ${comp.name}`
          );
        });
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          "   These components exist in the org with different changes."
        );
        this.outputChannel.appendLine(
          "   Please resolve conflicts manually or retrieve the org version first."
        );
        vscode.window.showErrorMessage(
          `Deployment failed due to conflicts: ${conflictComponents
            .map((c) => c.name)
            .join(", ")}`
        );
        return;
      }

      // Check for additional dependencies in the combined deployment error
      const additionalDeps = this.errorParser.parseMissingDependencies(
        combinedResult.output
      );

      // Filter out dependencies that are already in our deployment list
      const newDeps = additionalDeps.filter((dep) => {
        // Skip single-digit dependencies (likely line number parsing errors)
        if (/^\d+$/.test(dep.name) && dep.name.length === 1) {
          return false;
        }

        if (dep.type === "CustomField") {
          // For CustomField, check if it's already included (might be in format "ObjectName.FieldName__c")
          return !allComponentsToDeploy.some(
            (c) =>
              c.type === "CustomField" &&
              (c.name === dep.name ||
                c.name.endsWith(`.${dep.name}`) ||
                dep.name === c.name.split(".").pop())
          );
        } else {
          // For other types, exact match
          return !allComponentsToDeploy.some(
            (c) => c.type === dep.type && c.name === dep.name
          );
        }
      });

      if (newDeps.length > 0) {
        this.outputChannel.appendLine(
          `Found ${newDeps.length} new dependency/dependencies. Resolving and adding...`
        );
        this.outputChannel.appendLine("");

        // Resolve and add the new dependencies to the deployment list
        const updatedComponentsToDeploy = [...allComponentsToDeploy];

        for (const dependency of newDeps) {
          // Handle CustomField dependencies specially
          if (dependency.type === "CustomField") {
            // Check if this field is already included
            const alreadyIncluded = updatedComponentsToDeploy.some(
              (c) =>
                c.type === "CustomField" &&
                (c.name === dependency.name ||
                  c.name.endsWith(`.${dependency.name}`) ||
                  dependency.name === c.name.split(".").pop())
            );
            if (alreadyIncluded) {
              this.outputChannel.appendLine(
                `  ✓ CustomField ${dependency.name} already included`
              );
              continue;
            }

            this.outputChannel.appendLine(
              `  Searching for CustomField: ${dependency.name}...`
            );
            const objectName = await this.componentLocator.findObjectForField(
              dependency.name
            );

            if (!objectName) {
              this.outputChannel.appendLine(
                `  ⚠ Could not find object for field ${dependency.name}`
              );
              continue;
            }

            // Create CustomField component with format "ObjectName.FieldName__c"
            const customFieldComponent: ComponentInfo = {
              type: "CustomField",
              name: `${objectName}.${dependency.name}`,
            };
            updatedComponentsToDeploy.push(customFieldComponent);
            this.outputChannel.appendLine(
              `  ✓ Found CustomField: ${objectName}.${dependency.name}`
            );
          } else {
            // For other types, find the component file
            this.outputChannel.appendLine(
              `  Searching for ${dependency.type}: ${dependency.name}...`
            );
            const filePath = await this.componentLocator.findComponentFile(
              dependency
            );

            if (!filePath) {
              this.outputChannel.appendLine(
                `  ⚠ Could not find file for ${dependency.type}: ${dependency.name}`
              );
              continue;
            }

            // Determine component type from file path
            const componentInfo = await this.componentLocator.pathToComponent(
              filePath
            );
            if (componentInfo) {
              componentInfo.filePath = filePath;
              updatedComponentsToDeploy.push(componentInfo);
              this.outputChannel.appendLine(
                `  ✓ Found ${componentInfo.type}: ${componentInfo.name} at ${filePath}`
              );
            } else {
              // Fallback: use the dependency info we have
              dependency.filePath = filePath;
              updatedComponentsToDeploy.push(dependency);
              this.outputChannel.appendLine(
                `  ✓ Found ${dependency.type}: ${dependency.name} at ${filePath}`
              );
            }
          }
        }

        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          `📦 Updated deployment list: ${updatedComponentsToDeploy.length} component(s)`
        );
        updatedComponentsToDeploy.forEach((comp, index) => {
          this.outputChannel.appendLine(
            `  ${index + 1}. ${comp.type}: ${comp.name}`
          );
        });
        this.outputChannel.appendLine("");

        // Recursively deploy with the new dependencies added
        await this.deployComponents(
          updatedComponentsToDeploy,
          recursionDepth + 1
        );
      } else {
        // Check if we're trying to deploy the same components again (loop detection)
        const componentSignature = this.getComponentSignature(
          allComponentsToDeploy
        );
        if (this.attemptedDeployments.has(componentSignature)) {
          const previousAttempt =
            this.attemptedDeploymentDetails.get(componentSignature);
          this.outputChannel.appendLine("");
          this.outputChannel.appendLine(
            "⚠️  LOOP DETECTED: Already attempted deploying these exact components together."
          );
          this.outputChannel.appendLine("");
          if (previousAttempt) {
            this.outputChannel.appendLine(
              "   Last attempt included these components:"
            );
            previousAttempt.forEach((comp, index) => {
              this.outputChannel.appendLine(
                `     ${index + 1}. ${comp.type}: ${comp.name}`
              );
            });
          }
          this.outputChannel.appendLine("");
          this.outputChannel.appendLine(
            "   Current attempt includes these components:"
          );
          allComponentsToDeploy.forEach((comp, index) => {
            this.outputChannel.appendLine(
              `     ${index + 1}. ${comp.type}: ${comp.name}`
            );
          });
          this.outputChannel.appendLine("");
          this.outputChannel.appendLine(
            "   No new dependencies found. Stopping to prevent infinite loop."
          );
          vscode.window.showErrorMessage(
            "Deployment failed: No new dependencies found. The same error persists."
          );
        } else {
          this.outputChannel.appendLine("");
          this.outputChannel.appendLine(
            "⚠️  Deployment failed and no new dependencies were detected."
          );
          this.outputChannel.appendLine(
            "   This may indicate a different type of error (e.g., field-level, syntax, etc.)."
          );
          this.outputChannel.appendLine("   Check output for details.");
          vscode.window.showErrorMessage(
            "Deployment failed. Check output for details."
          );
        }
      }
    }
  }

  /**
   * Create a signature string for a component list (for duplicate detection)
   */
  private getComponentSignature(components: ComponentInfo[]): string {
    const sorted = [...components]
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
      })
      .map((c) => `${c.type}:${c.name}`)
      .join("|");
    return sorted;
  }

  /**
   * Deploy a list of components
   */
  private async deployComponentList(
    components: ComponentInfo[],
    orgAlias?: string,
    attemptNumber?: number
  ): Promise<DeploymentResult> {
    // Verify components exist before deploying (skip CustomField as it doesn't have a file path)
    for (const component of components) {
      if (component.type === "CustomField") {
        // CustomField components don't have file paths - they're referenced by ObjectName.FieldName__c
        continue;
      }

      if (!component.filePath) {
        const filePath = await this.componentLocator.findComponentFile(
          component
        );
        if (!filePath) {
          return {
            success: false,
            output: `Could not find file for ${component.type}: ${component.name}`,
            error: `Component file not found: ${component.name}`,
          };
        }
        component.filePath = filePath;
      }
    }

    // Deploy using manifest (package.xml)
    return this.cliExecutor.deployComponents(
      components,
      orgAlias,
      this.componentLocator,
      attemptNumber
    );
  }

  /**
   * Retry all queued deployments
   */
  private async retryQueuedDeployments(orgAlias?: string): Promise<void> {
    while (!this.stateManager.isQueueEmpty()) {
      const queuedItem = this.stateManager.getNextQueuedItem();

      if (!queuedItem) {
        break;
      }

      // Check retry limit
      if (queuedItem.retryCount >= 3) {
        this.outputChannel.appendLine(
          `⚠ Max retries reached for components. Skipping...`
        );
        continue;
      }

      this.outputChannel.appendLine(
        `Retrying deployment (attempt ${queuedItem.retryCount + 1})...`
      );

      // Increment attempt counter for queued retry
      this.deploymentAttemptCounter++;
      const queuedAttempt = this.deploymentAttemptCounter;

      const result = await this.deployComponentList(
        queuedItem.components,
        orgAlias,
        queuedAttempt
      );

      if (result.success) {
        this.outputChannel.appendLine("✓ Retry deployment successful!");

        // Mark components as deployed
        queuedItem.components.forEach((comp) => {
          this.stateManager.markDeployed(comp);
        });
      } else {
        // Check for new dependencies
        const newDependencies = this.errorParser.parseMissingDependencies(
          result.output
        );

        if (newDependencies.length > 0) {
          this.outputChannel.appendLine(
            `Found ${newDependencies.length} new dependencies. Deploying...`
          );
          await this.deployComponents(newDependencies);

          // Queue for retry again
          if (this.stateManager.incrementRetry(queuedItem)) {
            this.stateManager.queueDeployment(queuedItem.components);
          }
        } else {
          // No new dependencies, might be a different error
          if (this.stateManager.incrementRetry(queuedItem)) {
            this.stateManager.queueDeployment(queuedItem.components);
          } else {
            this.outputChannel.appendLine(
              "⚠ Max retries reached. Deployment failed."
            );
            vscode.window.showErrorMessage(
              "Deployment failed after maximum retries."
            );
          }
        }
      }
    }

    // Final status
    if (this.stateManager.isQueueEmpty()) {
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine("=== Deployment Process Complete ===");
      vscode.window.showInformationMessage("SF Wormhole Deploy completed!");
    }
  }
}
