import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { DeploymentResult, ComponentInfo } from "../types";
import { PackageXmlGenerator } from "./packageXmlGenerator";
import { ForceIgnoreHandler } from "./forceIgnoreHandler";

const execAsync = promisify(exec);

export class CLIExecutor {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Execute Salesforce CLI command
   */
  public async executeCommand(
    command: string,
    args: string[] = [],
    orgAlias?: string
  ): Promise<DeploymentResult> {
    const fullCommand = this.buildCommand(command, args, orgAlias);
    const workingDir =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    this.outputChannel.appendLine("📋 Command Details:");
    this.outputChannel.appendLine(`   Command: ${command}`);
    this.outputChannel.appendLine(`   Arguments: ${args.join(" ")}`);
    this.outputChannel.appendLine(`   Working Directory: ${workingDir}`);
    this.outputChannel.appendLine(`   Full Command: ${fullCommand}`);
    this.outputChannel.appendLine("");

    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        cwd: workingDir,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      const output = stdout + stderr;

      // Debug: Show command output
      if (stdout) {
        this.outputChannel.appendLine("📤 Command Output (stdout):");
        this.outputChannel.appendLine(stdout);
      }
      if (stderr) {
        this.outputChannel.appendLine("⚠️  Command Output (stderr):");
        this.outputChannel.appendLine(stderr);
      }

      // Check if deployment actually succeeded (even if there's stderr output)
      const deploymentSucceeded = this.isDeploymentSuccess(output);

      // Check if this is just a Metadata API finalization error (deployment may have succeeded)
      const isMetadataApiFinalizationError =
        this.isMetadataApiFinalizationError(stderr);

      // Check if there are actual deployment errors (not just validation warnings)
      // For --metadata deployments, validation errors about unrelated files can occur
      // but the actual deployment might still succeed
      const isValidationOnly = this.isValidationWarningOnly(stderr);
      const hasActualDeploymentErrors = this.hasActualDeploymentErrors(output);

      // If deployment succeeded OR it's just a Metadata API finalization error, don't treat as error
      // (Metadata API finalization errors often occur even when deployment succeeds)
      const hasErrors =
        !deploymentSucceeded &&
        !isMetadataApiFinalizationError &&
        (hasActualDeploymentErrors || (stderr.length > 0 && !isValidationOnly));

      // Debug: Analyze error type
      if (hasErrors) {
        const isValidationOnly = this.isValidationWarningOnly(stderr);
        if (isValidationOnly) {
          this.outputChannel.appendLine(
            "⚠️  Note: This appears to be a validation warning about unrelated files."
          );
          this.outputChannel.appendLine(
            "   The deployment may have succeeded despite this warning."
          );
        }
      } else if (isMetadataApiFinalizationError) {
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          "⚠️  Note: Metadata API finalization error detected, but deployment may have succeeded."
        );
        this.outputChannel.appendLine(
          "   This is a known Salesforce API issue that can occur even on successful deployments."
        );
        this.outputChannel.appendLine(
          "   Please verify in your org if the components were deployed."
        );
      }

      return {
        success: !hasErrors,
        output: output,
        error: hasErrors ? output : undefined,
      };
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      const exitCode = error.code || "unknown";

      this.outputChannel.appendLine("❌ Command Execution Error:");
      this.outputChannel.appendLine(`   Exit Code: ${exitCode}`);
      this.outputChannel.appendLine(`   Error: ${errorOutput}`);

      if (error.stdout) {
        this.outputChannel.appendLine(`   stdout: ${error.stdout}`);
      }
      if (error.stderr) {
        this.outputChannel.appendLine(`   stderr: ${error.stderr}`);
      }

      // Check if this is a Metadata API finalization error (deployment may have succeeded)
      const isMetadataApiFinalizationError =
        this.isMetadataApiFinalizationError(error.stderr || errorOutput);

      if (isMetadataApiFinalizationError) {
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          "⚠️  METADATA API FINALIZATION ERROR DETECTED"
        );
        this.outputChannel.appendLine(
          "   This error often occurs even when deployment succeeds!"
        );
        this.outputChannel.appendLine(
          "   Please check your org - the components may have been deployed successfully."
        );
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          "   If components were deployed, this is just a Salesforce API quirk."
        );
        this.outputChannel.appendLine(
          "   If not, try updating Salesforce CLI: sf update"
        );
        this.outputChannel.appendLine("");

        // Treat as success if it's just a finalization error
        return {
          success: true,
          output: errorOutput,
          error: undefined,
        };
      }

      // Check if this is just a validation warning
      const isValidationOnly = this.isValidationWarningOnly(
        error.stderr || errorOutput
      );
      if (isValidationOnly) {
        this.outputChannel.appendLine(
          "⚠️  This appears to be a validation warning, not a deployment failure."
        );
        this.outputChannel.appendLine(
          "   The CLI may have failed validation but the actual deployment might succeed."
        );
      }

      return {
        success: false,
        output: errorOutput,
        error: errorOutput,
      };
    }
  }

  /**
   * Deploy component(s) to Salesforce org using package.xml manifest or source-dir
   */
  public async deployComponents(
    components: ComponentInfo[],
    orgAlias?: string,
    componentLocator?: any, // ComponentLocator instance
    attemptNumber?: number // Attempt number for file naming
  ): Promise<DeploymentResult> {
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    let tempPackageXmlPath: string | null = null;
    const currentAttempt = attemptNumber || 0;

    try {
      // Debug: Show deployment details
      this.outputChannel.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      this.outputChannel.appendLine("🔍 DEPLOYMENT DEBUG INFO");
      this.outputChannel.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      this.outputChannel.appendLine(`Workspace Root: ${workspaceRoot}`);
      this.outputChannel.appendLine(`Target Org: ${orgAlias || "default"}`);
      this.outputChannel.appendLine(
        `Components to deploy: ${components.length}`
      );
      this.outputChannel.appendLine("");

      // Debug: List each component
      components.forEach((component, index) => {
        this.outputChannel.appendLine(
          `  ${index + 1}. ${component.type}: ${component.name}`
        );
        if (component.filePath) {
          this.outputChannel.appendLine(`     File: ${component.filePath}`);
        }
      });
      this.outputChannel.appendLine("");

      // Use manifest/package.xml approach
      // First, ensure conversationMessageDefinitions is in .forceignore
      this.outputChannel.appendLine("📦 Generating package.xml manifest...");

      const forceIgnoreHandler = new ForceIgnoreHandler(workspaceRoot);
      const conversationMsgDefsPath = path.join(
        workspaceRoot,
        "force-app",
        "main",
        "default",
        "conversationMessageDefinitions"
      );

      // Add conversationMessageDefinitions to .forceignore
      this.outputChannel.appendLine(
        "🔧 Updating .forceignore to exclude conversationMessageDefinitions..."
      );
      forceIgnoreHandler.addExclusion(
        conversationMsgDefsPath,
        this.outputChannel
      );

      try {
        // Generate package.xml (saved permanently with timestamp)
        tempPackageXmlPath = await PackageXmlGenerator.createTempPackageXml(
          components,
          workspaceRoot,
          undefined,
          this.outputChannel,
          currentAttempt
        );

        this.outputChannel.appendLine(
          `✓ Generated package.xml: ${tempPackageXmlPath}`
        );
        this.outputChannel.appendLine("");

        // Log manifest file location
        this.outputChannel.appendLine("📋 Manifest File Details:");
        this.outputChannel.appendLine(`   Path: ${tempPackageXmlPath}`);
        this.outputChannel.appendLine("");

        // Read and log manifest content
        try {
          const manifestContent = fs.readFileSync(tempPackageXmlPath, "utf8");
          this.outputChannel.appendLine("📄 Manifest Content:");
          this.outputChannel.appendLine("   ┌─────────────────────────────────────────┐");
          manifestContent.split("\n").forEach((line) => {
            if (line.trim()) {
              // Truncate very long lines for readability
              const displayLine =
                line.length > 75 ? line.substring(0, 72) + "..." : line;
              this.outputChannel.appendLine(`   │ ${displayLine.padEnd(39)} │`);
            }
          });
          this.outputChannel.appendLine("   └─────────────────────────────────────────┘");
          this.outputChannel.appendLine("");
        } catch (error) {
          this.outputChannel.appendLine(
            `   ⚠ Could not read manifest file: ${error}`
          );
        }

        const args: string[] = [
          "--manifest",
          tempPackageXmlPath,
          "--ignore-conflicts", // Overwrite remote changes if there are conflicts
        ];

        if (orgAlias) {
          args.push("--target-org", orgAlias);
        }

        this.outputChannel.appendLine("🚀 Starting deployment to Salesforce...");
        this.outputChannel.appendLine(`   Command: sf project deploy start`);
        this.outputChannel.appendLine(`   Arguments: ${args.join(" ")}`);
        this.outputChannel.appendLine("");

        const result = await this.executeCommand(
          "sf project deploy start",
          args,
          orgAlias
        );

        // Restore .forceignore after deployment
        forceIgnoreHandler.restore(this.outputChannel);

        // Save deployment response to file
        const responsePath = PackageXmlGenerator.saveDeploymentResponse(
          result.output,
          workspaceRoot,
          currentAttempt,
          result.success
        );
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(`💾 Saved deployment response: ${responsePath}`);

        // Debug: Show result summary
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        );
        this.outputChannel.appendLine(
          result.success
            ? "✅ DEPLOYMENT RESULT: SUCCESS"
            : "❌ DEPLOYMENT RESULT: FAILED"
        );
        this.outputChannel.appendLine(
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        );

        return result;
      } catch (error: any) {
        // Restore .forceignore even if there's an error
        forceIgnoreHandler.restore(this.outputChannel);
        throw error;
      }
    } catch (error: any) {
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine("❌ ERROR during deployment preparation:");
      this.outputChannel.appendLine(`   ${error.message}`);
      this.outputChannel.appendLine("");
      throw error;
    } finally {
      // Manifest files are now saved permanently in .wormhole/manifests/
      // No cleanup needed - files are kept for reference
      if (tempPackageXmlPath) {
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(`💾 Manifest saved: ${tempPackageXmlPath}`);
        this.outputChannel.appendLine("   (Manifest files are kept for reference)");
        this.outputChannel.appendLine("");
      }
    }
  }

  /**
   * Convert component info to metadata flag format
   * e.g., ApexClass:MyClass
   */
  private getMetadataFlag(component: ComponentInfo): string | null {
    // Map component types to Salesforce metadata type names
    const metadataTypeMap: { [key: string]: string } = {
      ApexClass: "ApexClass",
      ApexTrigger: "ApexTrigger",
      CustomObject: "CustomObject",
      LightningComponentBundle: "LightningComponentBundle",
      AuraDefinitionBundle: "AuraDefinitionBundle",
    };

    const metadataType = metadataTypeMap[component.type] || component.type;

    // Format: MetadataType:ComponentName
    return `${metadataType}:${component.name}`;
  }

  /**
   * Authenticate to Salesforce org
   */
  public async authenticateOrg(
    alias?: string,
    instanceUrl?: string
  ): Promise<DeploymentResult> {
    const args = ["--set-default"];

    if (alias) {
      args.push("--alias", alias);
    }

    if (instanceUrl) {
      args.push("--instance-url", instanceUrl);
    }

    return this.executeCommand("sf org login web", args);
  }

  /**
   * Build full command string
   */
  private buildCommand(
    command: string,
    args: string[],
    orgAlias?: string
  ): string {
    let fullCommand = command;

    if (args.length > 0) {
      fullCommand += " " + args.join(" ");
    }

    return fullCommand;
  }

  /**
   * Check if output contains error keywords
   */
  private hasErrorKeywords(output: string): boolean {
    const errorKeywords = [
      "ERROR",
      "FAILED",
      "Error:",
      "deployment failed",
      "Deployment Failed",
      "does not exist",
      "Invalid",
    ];

    const lowerOutput = output.toLowerCase();
    return errorKeywords.some((keyword) =>
      lowerOutput.includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if stderr contains only validation warnings (not actual deployment errors)
   * Validation warnings about unrelated files can be ignored
   */
  private isValidationWarningOnly(stderr: string): boolean {
    const validationWarningPatterns = [
      "Could not infer a metadata type",
      "Did you mean",
      "metadata type lookup",
      "Additional suggestions",
      "Validate against the registry",
      "cannot also be provided when using", // Flag conflicts
    ];

    const lowerStderr = stderr.toLowerCase();
    const hasValidationWarning = validationWarningPatterns.some((pattern) =>
      lowerStderr.includes(pattern.toLowerCase())
    );

    return hasValidationWarning;
  }

  /**
   * Check if deployment actually succeeded
   */
  private isDeploymentSuccess(output: string): boolean {
    const successPatterns = [
      "status: succeeded",
      "status:succeeded",
      "succeeded |",
      "state.*created",
      "state.*unchanged",
      "deployed source",
      "deployment succeeded",
      "deployed successfully",
    ];

    const lowerOutput = output.toLowerCase();
    return successPatterns.some((pattern) => {
      const regex = new RegExp(pattern, "i");
      return regex.test(lowerOutput);
    });
  }

  /**
   * Check if stderr contains only Metadata API finalization error
   * This error often occurs even when deployment succeeds
   */
  private isMetadataApiFinalizationError(stderr: string): boolean {
    const finalizationErrorPatterns = [
      "Missing message metadata.transfer:Finalizing",
      "Metadata API request failed.*Finalizing",
    ];

    const lowerStderr = stderr.toLowerCase();
    const hasFinalizationError = finalizationErrorPatterns.some((pattern) => {
      const regex = new RegExp(pattern, "i");
      return regex.test(lowerStderr);
    });

    // Only treat as finalization error if there are no actual component failures
    const hasComponentFailures =
      lowerStderr.includes("component failures") ||
      lowerStderr.includes("componentfailures");

    return hasFinalizationError && !hasComponentFailures;
  }

  /**
   * Check if output contains actual deployment errors (not just validation warnings)
   */
  private hasActualDeploymentErrors(output: string): boolean {
    const actualErrorPatterns = [
      "component failures",
      "deployment failed",
      "failed to deploy",
      "component deployment error",
      "does not exist", // Missing dependency
      "compilation failed",
      "test failures",
      "invalid type:", // Dependency error
    ];

    const lowerOutput = output.toLowerCase();
    const hasActualError = actualErrorPatterns.some((pattern) =>
      lowerOutput.includes(pattern.toLowerCase())
    );

    // If we see success indicators, it's not an actual error
    return hasActualError && !this.isDeploymentSuccess(output);
  }
}
