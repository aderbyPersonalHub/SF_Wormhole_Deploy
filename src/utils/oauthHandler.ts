import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import { CLIExecutor } from "./cliExecutor";
import { OrgConfig } from "../types";

const execAsync = promisify(exec);

export class OAuthHandler {
  private cliExecutor: CLIExecutor;
  private orgConfig: OrgConfig | null = null;

  constructor(cliExecutor: CLIExecutor) {
    this.cliExecutor = cliExecutor;
  }

  /**
   * Authenticate user to Salesforce org via OAuth
   */
  public async authenticate(alias?: string): Promise<boolean> {
    try {
      // Prompt user to select org type
      const orgType = await vscode.window.showQuickPick(
        [
          { label: "Production", value: "production" },
          { label: "Sandbox", value: "sandbox" },
        ],
        {
          placeHolder: "Select the type of Salesforce org",
          title: "Org Type Selection",
        }
      );

      if (!orgType) {
        vscode.window.showInformationMessage("Authentication cancelled.");
        return false;
      }

      // Determine instance URL based on org type
      const instanceUrl =
        orgType.value === "production"
          ? "https://login.salesforce.com"
          : "https://test.salesforce.com";

      vscode.window.showInformationMessage(
        `Opening Salesforce ${orgType.label.toLowerCase()} login in browser...`
      );

      const result = await this.cliExecutor.authenticateOrg(alias, instanceUrl);

      if (result.success) {
        // Parse org info from output
        this.orgConfig = await this.parseOrgInfo(result.output);

        vscode.window.showInformationMessage(
          `Successfully authenticated to Salesforce ${orgType.label.toLowerCase()} org${
            alias ? ` (${alias})` : ""
          }`
        );
        return true;
      } else {
        vscode.window.showErrorMessage(
          `Authentication failed: ${result.error}`
        );
        return false;
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Authentication error: ${error.message}`);
      return false;
    }
  }

  /**
   * Get current org configuration
   */
  public getOrgConfig(): OrgConfig | null {
    return this.orgConfig;
  }

  /**
   * Check if user is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    // Try to get org info to verify authentication
    try {
      await execAsync("sf org display --json");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse org information from CLI output
   */
  private async parseOrgInfo(output: string): Promise<OrgConfig> {
    // Try to get org info via CLI
    try {
      const { stdout } = await execAsync("sf org display --json");
      const orgInfo = JSON.parse(stdout);

      return {
        orgId: orgInfo.result?.id,
        username: orgInfo.result?.username,
        instanceUrl: orgInfo.result?.instanceUrl,
      };
    } catch {
      // Fallback to basic config
      return {};
    }
  }

  /**
   * Get default org alias
   */
  public async getDefaultOrgAlias(): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync("sf org display --json");
      const orgInfo = JSON.parse(stdout);

      return orgInfo.result?.alias || orgInfo.result?.username;
    } catch {
      return undefined;
    }
  }
}
