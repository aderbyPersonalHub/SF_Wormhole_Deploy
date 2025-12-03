import * as vscode from "vscode";
import * as path from "path";
import { ComponentInfo } from "../types";

export class ComponentLocator {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Find component file in workspace based on component info
   * Searches specifically under force-app/main/default
   */
  public async findComponentFile(
    component: ComponentInfo
  ): Promise<string | null> {
    // Search specifically under force-app/main/default
    const searchPatterns = [
      `force-app/main/default/classes/${component.name}.cls`,
      `force-app/main/default/triggers/${component.name}.trigger`,
      `force-app/main/default/objects/${component.name}__c/**`,
      `force-app/main/default/lwc/${component.name}/**`,
      `force-app/main/default/aura/${component.name}/**`,
      // Also try without the full path in case structure differs
      `**/force-app/**/classes/${component.name}.cls`,
      `**/force-app/**/triggers/${component.name}.trigger`,
      `**/force-app/**/objects/${component.name}__c/**`,
      `**/force-app/**/lwc/${component.name}/**`,
      `**/force-app/**/aura/${component.name}/**`,
      // Fallback patterns
      `**/classes/${component.name}.cls`,
      `**/triggers/${component.name}.trigger`,
      `**/${component.name}.cls`,
      `**/${component.name}.trigger`,
    ];

    for (const pattern of searchPatterns) {
      const files = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
        1
      );
      if (files.length > 0) {
        return files[0].fsPath;
      }
    }

    // Try to find by type-specific patterns
    return this.findByType(component);
  }

  /**
   * Find component by type-specific logic
   * Searches specifically under force-app/main/default
   */
  private async findByType(component: ComponentInfo): Promise<string | null> {
    let patterns: string[];

    switch (component.type.toLowerCase()) {
      case "apexclass":
        patterns = [
          `force-app/main/default/classes/${component.name}.cls`,
          `**/force-app/**/classes/${component.name}.cls`,
          `**/${component.name}.cls`,
        ];
        break;
      case "apextrigger":
        patterns = [
          `force-app/main/default/triggers/${component.name}.trigger`,
          `**/force-app/**/triggers/${component.name}.trigger`,
          `**/${component.name}.trigger`,
        ];
        break;
      case "customobject":
        patterns = [
          `force-app/main/default/objects/${component.name.replace(
            "__c",
            ""
          )}__c/**`,
          `**/force-app/**/objects/${component.name.replace("__c", "")}__c/**`,
          `**/objects/${component.name.replace("__c", "")}__c/**`,
        ];
        break;
      case "lightningcomponentbundle":
      case "lwc":
        patterns = [
          `force-app/main/default/lwc/${component.name}/**`,
          `**/force-app/**/lwc/${component.name}/**`,
          `**/lwc/${component.name}/**`,
        ];
        break;
      case "auradefinitionbundle":
      case "aura":
        patterns = [
          `force-app/main/default/aura/${component.name}/**`,
          `**/force-app/**/aura/${component.name}/**`,
          `**/aura/${component.name}/**`,
        ];
        break;
      default:
        // Generic search
        patterns = [
          `force-app/main/default/**/${component.name}*`,
          `**/force-app/**/${component.name}*`,
          `**/${component.name}*`,
        ];
    }

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
        1
      );
      if (files.length > 0) {
        return files[0].fsPath;
      }
    }

    return null;
  }

  /**
   * Get source path for deployment from file path
   */
  public getSourcePath(filePath: string): string {
    // Extract the path relative to common Salesforce folders
    const relativePath = path.relative(this.workspaceRoot, filePath);

    // For Apex classes, return the directory containing the .cls file
    if (filePath.endsWith(".cls") || filePath.endsWith(".trigger")) {
      return path.dirname(filePath);
    }

    // For other components, return the file or directory
    return filePath;
  }

  /**
   * Convert file path to ComponentInfo
   */
  public async pathToComponent(
    filePath: string
  ): Promise<ComponentInfo | null> {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    const fileName = path.basename(filePath, path.extname(filePath));

    // Determine type from path structure
    if (relativePath.includes("/classes/")) {
      return { type: "ApexClass", name: fileName, filePath };
    } else if (relativePath.includes("/triggers/")) {
      return { type: "ApexTrigger", name: fileName, filePath };
    } else if (relativePath.includes("/lwc/")) {
      const lwcName = relativePath.split("/lwc/")[1].split("/")[0];
      return { type: "LightningComponentBundle", name: lwcName, filePath };
    } else if (relativePath.includes("/aura/")) {
      const auraName = relativePath.split("/aura/")[1].split("/")[0];
      return { type: "AuraDefinitionBundle", name: auraName, filePath };
    } else if (relativePath.includes("/objects/")) {
      const objectName = relativePath.split("/objects/")[1].split("/")[0];
      return { type: "CustomObject", name: objectName, filePath };
    }

    return null;
  }

  /**
   * Find which object a custom field belongs to by searching in the objects folder
   * Returns the object name (e.g., "Account") or null if not found
   */
  public async findObjectForField(fieldName: string): Promise<string | null> {
    // Search for the field file in objects folder
    // Pattern: force-app/main/default/objects/*/fields/{fieldName}.field-meta.xml
    const searchPatterns = [
      `force-app/main/default/objects/*/fields/${fieldName}.field-meta.xml`,
      `**/force-app/**/objects/*/fields/${fieldName}.field-meta.xml`,
      `**/objects/*/fields/${fieldName}.field-meta.xml`,
    ];

    for (const pattern of searchPatterns) {
      const files = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
        10 // Get multiple matches to find the right one
      );

      if (files.length > 0) {
        // Extract object name from path
        // Path format: .../objects/ObjectName__c/fields/FieldName__c.field-meta.xml
        for (const file of files) {
          const relativePath = path.relative(this.workspaceRoot, file.fsPath);
          const objectsMatch = relativePath.match(/objects\/([^\/]+)\//);
          if (objectsMatch && objectsMatch[1]) {
            const objectName = objectsMatch[1];
            // Remove __c suffix if present for standard objects, keep for custom objects
            // For now, return as-is since Salesforce accepts both formats
            return objectName;
          }
        }
      }
    }

    return null;
  }
}
