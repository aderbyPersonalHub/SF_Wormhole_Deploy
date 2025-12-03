import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ComponentInfo } from "../types";

export class PackageXmlGenerator {
  /**
   * Generate a package.xml file for the given components
   */
  public static generatePackageXml(
    components: ComponentInfo[],
    apiVersion: string = "60.0"
  ): string {
    // Group components by type
    const componentsByType: { [type: string]: string[] } = {};

    for (const component of components) {
      const metadataType = this.getMetadataType(component.type);
      if (!componentsByType[metadataType]) {
        componentsByType[metadataType] = [];
      }
      componentsByType[metadataType].push(component.name);
    }

    // Build XML
    let typesXml = "";
    for (const [metadataType, names] of Object.entries(componentsByType)) {
      const membersXml = names
        .map((name) => `        <members>${this.escapeXml(name)}</members>`)
        .join("\n");
      typesXml += `      <types>\n${membersXml}\n        <name>${metadataType}</name>\n      </types>\n`;
    }

    const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${typesXml}  <version>${apiVersion}</version>
</Package>`;

    return packageXml;
  }

  /**
   * Create a package.xml file and return its path
   * Files are saved with timestamps so they can be referenced later
   */
  public static async createTempPackageXml(
    components: ComponentInfo[],
    workspaceRoot: string,
    apiVersion?: string,
    outputChannel?: vscode.OutputChannel,
    attemptNumber?: number
  ): Promise<string> {
    // Try to detect API version from existing package.xml or use default
    if (outputChannel) {
      outputChannel.appendLine("🔍 Detecting API version...");
    }

    const detectedApiVersion =
      apiVersion ||
      (await this.detectApiVersion(workspaceRoot, outputChannel)) ||
      "60.0";

    if (outputChannel) {
      outputChannel.appendLine(`   Using API version: ${detectedApiVersion}`);
    }

    const packageXml = this.generatePackageXml(components, detectedApiVersion);

    // Create manifest directory if it doesn't exist
    const manifestDir = path.join(workspaceRoot, ".wormhole", "manifests");
    if (!fs.existsSync(manifestDir)) {
      fs.mkdirSync(manifestDir, { recursive: true });
    }

    // Generate filename with timestamp and attempt number
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const attemptSuffix =
      attemptNumber !== undefined ? `-attempt-${attemptNumber}` : "";
    const filename = `package${attemptSuffix}-${timestamp}.xml`;
    const tempPath = path.join(manifestDir, filename);

    // Debug: Show package.xml content
    if (outputChannel) {
      outputChannel.appendLine("📄 Generated package.xml content:");
      outputChannel.appendLine(
        "   ┌─────────────────────────────────────────┐"
      );
      packageXml.split("\n").forEach((line) => {
        outputChannel.appendLine(`   │ ${line.padEnd(39)} │`);
      });
      outputChannel.appendLine(
        "   └─────────────────────────────────────────┘"
      );
    }

    fs.writeFileSync(tempPath, packageXml, "utf8");
    return tempPath;
  }

  /**
   * Save deployment response/output to a file
   */
  public static saveDeploymentResponse(
    output: string,
    workspaceRoot: string,
    attemptNumber?: number,
    success: boolean = false
  ): string {
    // Create responses directory if it doesn't exist
    const responsesDir = path.join(workspaceRoot, ".wormhole", "responses");
    if (!fs.existsSync(responsesDir)) {
      fs.mkdirSync(responsesDir, { recursive: true });
    }

    // Generate filename with timestamp and attempt number
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const attemptSuffix =
      attemptNumber !== undefined ? `-attempt-${attemptNumber}` : "";
    const statusSuffix = success ? "-success" : "-failed";
    const filename = `response${attemptSuffix}${statusSuffix}-${timestamp}.txt`;
    const responsePath = path.join(responsesDir, filename);

    fs.writeFileSync(responsePath, output, "utf8");
    return responsePath;
  }

  /**
   * Map component type to Salesforce metadata type name
   */
  private static getMetadataType(componentType: string): string {
    const typeMap: { [key: string]: string } = {
      ApexClass: "ApexClass",
      ApexTrigger: "ApexTrigger",
      CustomObject: "CustomObject",
      CustomField: "CustomField",
      LightningComponentBundle: "LightningComponentBundle",
      AuraDefinitionBundle: "AuraDefinitionBundle",
    };

    return typeMap[componentType] || componentType;
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Try to detect API version from existing package.xml or sfdx-project.json
   */
  private static async detectApiVersion(
    workspaceRoot: string,
    outputChannel?: vscode.OutputChannel
  ): Promise<string | null> {
    try {
      // Check for sfdx-project.json
      const sfdxProjectPath = path.join(workspaceRoot, "sfdx-project.json");
      if (fs.existsSync(sfdxProjectPath)) {
        if (outputChannel) {
          outputChannel.appendLine(
            `   Found sfdx-project.json: ${sfdxProjectPath}`
          );
        }
        const content = fs.readFileSync(sfdxProjectPath, "utf8");
        const project = JSON.parse(content);
        if (project.sourceApiVersion) {
          if (outputChannel) {
            outputChannel.appendLine(
              `   ✓ Detected API version from sfdx-project.json: ${project.sourceApiVersion}`
            );
          }
          return project.sourceApiVersion;
        } else {
          if (outputChannel) {
            outputChannel.appendLine(
              "   ⚠ No sourceApiVersion found in sfdx-project.json"
            );
          }
        }
      } else {
        if (outputChannel) {
          outputChannel.appendLine(
            `   ℹ sfdx-project.json not found at: ${sfdxProjectPath}`
          );
        }
      }

      // Check for any existing package.xml
      const packageXmlPath = path.join(
        workspaceRoot,
        "manifest",
        "package.xml"
      );
      if (fs.existsSync(packageXmlPath)) {
        if (outputChannel) {
          outputChannel.appendLine(`   Found package.xml: ${packageXmlPath}`);
        }
        const content = fs.readFileSync(packageXmlPath, "utf8");
        const versionMatch = content.match(/<version>(\d+\.\d+)<\/version>/);
        if (versionMatch) {
          if (outputChannel) {
            outputChannel.appendLine(
              `   ✓ Detected API version from package.xml: ${versionMatch[1]}`
            );
          }
          return versionMatch[1];
        }
      } else {
        if (outputChannel) {
          outputChannel.appendLine(
            `   ℹ package.xml not found at: ${packageXmlPath}`
          );
        }
      }

      if (outputChannel) {
        outputChannel.appendLine(
          "   ⚠ Could not detect API version, using default: 60.0"
        );
      }
    } catch (error: any) {
      if (outputChannel) {
        outputChannel.appendLine(
          `   ⚠ Error detecting API version: ${error.message}`
        );
        outputChannel.appendLine("   Using default: 60.0");
      }
    }

    return null;
  }
}
