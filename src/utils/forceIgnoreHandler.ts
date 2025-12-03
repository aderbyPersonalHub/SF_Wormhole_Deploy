import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export class ForceIgnoreHandler {
  private workspaceRoot: string;
  private forceIgnorePath: string;
  private originalContent: string | null = null;
  private addedEntries: string[] = [];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.forceIgnorePath = path.join(workspaceRoot, ".forceignore");
  }

  /**
   * Add directory to .forceignore to exclude it from validation
   */
  public addExclusion(
    directoryPath: string,
    outputChannel?: vscode.OutputChannel
  ): void {
    const relativePath = path.relative(this.workspaceRoot, directoryPath);
    const ignorePattern = relativePath.replace(/\\/g, "/"); // Normalize path separators

    // Read existing .forceignore or create new
    let content = "";
    if (fs.existsSync(this.forceIgnorePath)) {
      this.originalContent = fs.readFileSync(this.forceIgnorePath, "utf8");
      content = this.originalContent;
    }

    // Check if pattern already exists
    if (content.includes(ignorePattern)) {
      if (outputChannel) {
        outputChannel.appendLine(
          `   Pattern already in .forceignore: ${ignorePattern}`
        );
      }
      return;
    }

    // Add Wormhole comment and pattern
    const wormholeSection = `# Wormhole temporary exclusions\n${ignorePattern}\n`;
    content += `\n${wormholeSection}`;

    // Write updated .forceignore
    fs.writeFileSync(this.forceIgnorePath, content, "utf8");
    this.addedEntries.push(ignorePattern);

    if (outputChannel) {
      outputChannel.appendLine(`   Added to .forceignore: ${ignorePattern}`);
    }
  }

  /**
   * Restore original .forceignore content
   */
  public restore(outputChannel?: vscode.OutputChannel): void {
    if (this.addedEntries.length === 0) {
      return;
    }

    try {
      if (this.originalContent === null) {
        // We created the file, so delete it
        if (fs.existsSync(this.forceIgnorePath)) {
          fs.unlinkSync(this.forceIgnorePath);
          if (outputChannel) {
            outputChannel.appendLine("   Removed temporary .forceignore file");
          }
        }
      } else {
        // Restore original content
        fs.writeFileSync(this.forceIgnorePath, this.originalContent, "utf8");
        if (outputChannel) {
          outputChannel.appendLine("   Restored original .forceignore");
        }
      }
      this.addedEntries = [];
    } catch (error: any) {
      if (outputChannel) {
        outputChannel.appendLine(
          `   ⚠️  Warning: Could not restore .forceignore: ${error.message}`
        );
      }
    }
  }

  /**
   * Extract problematic directory from error message
   */
  public static extractProblematicPath(errorMessage: string): string | null {
    // Pattern: /path/to/file: Could not infer a metadata type
    const match = errorMessage.match(/^Error \(\d+\): (.+?): Could not infer/);
    if (match) {
      const filePath = match[1];
      // Return the directory containing the file
      return path.dirname(filePath);
    }
    return null;
  }
}
