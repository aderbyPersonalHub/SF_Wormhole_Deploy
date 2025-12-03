import { ComponentInfo } from "../types";
import * as vscode from "vscode";

export class ErrorParser {
  private outputChannel?: vscode.OutputChannel;

  constructor(outputChannel?: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }
  /**
   * Parse deployment output to find missing dependencies
   */
  public parseMissingDependencies(output: string): ComponentInfo[] {
    const dependencies: ComponentInfo[] = [];
    const lines = output.split("\n");

    // Common Salesforce error patterns for missing dependencies
    const patterns = [
      // Pattern: "Class 'ClassName' does not exist"
      /Class\s+['"]([\w]+)['"]\s+does\s+not\s+exist/i,

      // Pattern: "Dependent class is invalid and needs recompilation: ClassName"
      /Dependent\s+class\s+is\s+invalid\s+and\s+needs\s+recompilation:\s*([\w]+)/i,

      // Pattern: "No such column 'Field__c' on entity 'CustomObject__c'"
      /No\s+such\s+column\s+['"]([\w_]+)['"]\s+on\s+entity\s+['"]([\w_]+)['"]/i,

      // Pattern: "sObject type 'CustomObject__c' is not supported"
      /sObject\s+type\s+['"]([\w_]+)['"]\s+is\s+not\s+supported/i,

      // Pattern: "Invalid type: ClassName"
      /Invalid\s+type:\s*([\w]+)/i,

      // Pattern: "Variable does not exist: FieldName__c" or "Variable does not exist: ClassName"
      // Note: This should match field names (with underscores) or class names, but NOT line numbers
      /Variable\s+does\s+not\s+exist:\s*([\w_]+)(?:\s*\([\d:]+\))?/i,

      // Pattern: "Type is not visible: ClassName"
      /Type\s+is\s+not\s+visible:\s*([\w_]+)/i,
    ];

    for (const line of lines) {
      // Skip lines that are just line numbers (like "4:13" at the end of error tables)
      // This should be checked first to prevent other patterns from matching
      if (/^\s*\d+:\d+\s*$/.test(line.trim())) {
        continue;
      }

      // Skip lines that end with just a line number pattern (like "...4:13")
      // This catches cases where line numbers appear at the end of error lines
      if (/^\s*.+\s+\d+:\d+\s*$/.test(line.trim()) && !line.includes(":")) {
        // Only skip if the line doesn't contain other meaningful content
        const withoutLineNumber = line.replace(/\s+\d+:\d+\s*$/, "").trim();
        if (withoutLineNumber.length < 5) {
          continue;
        }
      }

      // Check for Apex Class dependencies
      const classMatch = line.match(
        /Class\s+['"]([\w]+)['"]\s+does\s+not\s+exist/i
      );
      if (classMatch) {
        dependencies.push({
          type: "ApexClass",
          name: classMatch[1],
        });
        continue;
      }

      // Check for "Invalid type: ClassName" pattern (common in deployment errors)
      // But skip if it's just a number (line number) or contains colons (like "4:13")
      const invalidTypeMatch = line.match(/Invalid\s+type:\s*([\w_]+)/i);
      if (invalidTypeMatch) {
        const typeName = invalidTypeMatch[1];
        // Skip if it's just a number or contains colons (likely a line number)
        if (
          !/^\d+$/.test(typeName) &&
          !typeName.includes(":") &&
          typeName.length > 1
        ) {
          dependencies.push({
            type: "ApexClass",
            name: typeName,
          });
        }
        continue;
      }

      // Check for recompilation needed
      const recompileMatch = line.match(
        /Dependent\s+class\s+is\s+invalid[^:]*:\s*([\w]+)/i
      );
      if (recompileMatch) {
        const className = recompileMatch[1];
        // Skip if it's just a number (line number)
        if (!/^\d+$/.test(className) && className.length > 1) {
          dependencies.push({
            type: "ApexClass",
            name: className,
          });
        }
        continue;
      }

      // Check for Custom Object dependencies
      const objectMatch = line.match(/sObject\s+type\s+['"]([\w_]+)['"]/i);
      if (objectMatch) {
        dependencies.push({
          type: "CustomObject",
          name: objectMatch[1],
        });
        continue;
      }

      // Check for field dependencies (implies object dependency)
      const fieldMatch = line.match(
        /No\s+such\s+column\s+['"]([\w_]+)['"]\s+on\s+entity\s+['"]([\w_]+)['"]/i
      );
      if (fieldMatch) {
        dependencies.push({
          type: "CustomObject",
          name: fieldMatch[2],
        });
        continue;
      }

      // Check for "Variable does not exist" - this could be a field or class
      // Pattern: "Variable does not exist: FieldName__c (4:13)" or "Variable does not exist: ClassName"
      // We need to extract the variable name but skip line numbers
      const variableMatch = line.match(
        /Variable\s+does\s+not\s+exist:\s*([\w_]+)(?:\s*\([\d:]+\))?/i
      );
      if (variableMatch) {
        const varName = variableMatch[1];
        // Skip if it's just a number (likely a line number mis-parsed) or too short
        if (!/^\d+$/.test(varName) && varName.length > 1) {
          // If it ends with __c, it's likely a custom field (CustomField dependency)
          if (varName.endsWith("__c")) {
            dependencies.push({
              type: "CustomField",
              name: varName, // Will be resolved to "ObjectName.FieldName__c" later
            });
          } else {
            // Assume it's a class name or variable name that refers to a class
            dependencies.push({
              type: "ApexClass",
              name: varName,
            });
          }
        }
        continue;
      }
    }

    // Remove duplicates
    return this.deduplicateComponents(dependencies);
  }

  /**
   * Check if output indicates a deployment error
   */
  public isDeploymentError(output: string): boolean {
    const errorIndicators = [
      "ERROR",
      "FAILED",
      "does not exist",
      "Invalid",
      "Error:",
      "deployment failed",
      "Deployment Failed",
    ];

    const lowerOutput = output.toLowerCase();
    return errorIndicators.some((indicator) =>
      lowerOutput.includes(indicator.toLowerCase())
    );
  }

  /**
   * Check if output indicates successful deployment
   */
  public isDeploymentSuccess(output: string): boolean {
    const successIndicators = [
      "Deployed",
      "deployed successfully",
      "Deployment Succeeded",
      "SUCCESS",
      "status: succeeded",
      "status:succeeded",
      "succeeded |",
    ];

    const lowerOutput = output.toLowerCase();
    return successIndicators.some((indicator) =>
      lowerOutput.includes(indicator.toLowerCase())
    );
  }

  /**
   * Check if output indicates a conflict error
   */
  public isConflictError(output: string): boolean {
    const conflictIndicators = [
      "conflict",
      "changes in the org that conflict",
      "conflict with the local changes",
    ];

    const lowerOutput = output.toLowerCase();
    return conflictIndicators.some((indicator) =>
      lowerOutput.includes(indicator.toLowerCase())
    );
  }

  /**
   * Extract component names from conflict errors
   */
  public parseConflictComponents(output: string): ComponentInfo[] {
    const conflicts: ComponentInfo[] = [];
    const lines = output.split("\n");

    // Pattern: "Conflict ComponentName ComponentType /path/to/file"
    for (const line of lines) {
      const conflictMatch = line.match(/Conflict\s+([\w_]+)\s+(\w+)\s+/i);
      if (conflictMatch) {
        const componentName = conflictMatch[1];
        const componentType = conflictMatch[2];

        // Map Salesforce types to our types
        const typeMap: { [key: string]: string } = {
          ApexClass: "ApexClass",
          ApexTrigger: "ApexTrigger",
          CustomObject: "CustomObject",
        };

        conflicts.push({
          type: typeMap[componentType] || componentType,
          name: componentName,
        });
      }
    }

    return this.deduplicateComponents(conflicts);
  }

  /**
   * Remove duplicate components from array
   */
  private deduplicateComponents(components: ComponentInfo[]): ComponentInfo[] {
    const seen = new Set<string>();
    const unique: ComponentInfo[] = [];

    for (const component of components) {
      const key = `${component.type}:${component.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(component);
      }
    }

    return unique;
  }
}
