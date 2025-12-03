export interface ComponentInfo {
  type: string; // e.g., 'ApexClass', 'ApexTrigger', 'CustomObject', 'CustomField'
  name: string; // e.g., 'MyClass', 'MyTrigger', 'Account.dependent_field__c' (for CustomField)
  filePath?: string; // Full path to the component file
}

export interface DeploymentResult {
  success: boolean;
  output: string;
  error?: string;
  missingDependencies?: ComponentInfo[];
}

export interface DeploymentQueueItem {
  components: ComponentInfo[];
  retryCount: number;
}

export interface OrgConfig {
  orgId?: string;
  username?: string;
  accessToken?: string;
  instanceUrl?: string;
}
