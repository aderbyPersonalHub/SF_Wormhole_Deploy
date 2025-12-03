import { DeploymentQueueItem, ComponentInfo } from "../types";

export class StateManager {
  private deploymentQueue: DeploymentQueueItem[] = [];
  private deployedComponents: Set<string> = new Set();
  private maxRetries: number = 3;

  /**
   * Queue components for deployment
   */
  public queueDeployment(components: ComponentInfo[]): void {
    this.deploymentQueue.push({
      components,
      retryCount: 0,
    });
  }

  /**
   * Get next item from queue
   */
  public getNextQueuedItem(): DeploymentQueueItem | undefined {
    return this.deploymentQueue.shift();
  }

  /**
   * Check if queue is empty
   */
  public isQueueEmpty(): boolean {
    return this.deploymentQueue.length === 0;
  }

  /**
   * Mark component as deployed
   */
  public markDeployed(component: ComponentInfo): void {
    const key = `${component.type}:${component.name}`;
    this.deployedComponents.add(key);
  }

  /**
   * Check if component was already deployed
   */
  public isDeployed(component: ComponentInfo): boolean {
    const key = `${component.type}:${component.name}`;
    return this.deployedComponents.has(key);
  }

  /**
   * Increment retry count for a queue item
   */
  public incrementRetry(item: DeploymentQueueItem): boolean {
    item.retryCount++;
    return item.retryCount < this.maxRetries;
  }

  /**
   * Clear all state
   */
  public clear(): void {
    this.deploymentQueue = [];
    this.deployedComponents.clear();
  }

  /**
   * Get current queue size
   */
  public getQueueSize(): number {
    return this.deploymentQueue.length;
  }
}
