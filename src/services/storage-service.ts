import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds } from "azure-devops-extension-api";
import { AnalysisResult } from "../models/analysis";

/**
 * Service for persisting analysis results for each build run
 * Uses Azure DevOps Extension Data Service with build-scoped keys
 */
export class StorageService {
  private static readonly ANALYSIS_KEY_PREFIX = "analysis-result-";
  private dataManager: any | null = null;

  /**
   * Initialize the data manager for storage operations
   * @private
   */
  private async getDataManager(): Promise<any> {
    if (!this.dataManager) {
      await SDK.ready();
      const accessToken = await SDK.getAccessToken();
      const extContext = SDK.getExtensionContext();

      const dataService = await SDK.getService<any>(CommonServiceIds.ExtensionDataService);
      this.dataManager = await dataService.getExtensionDataManager(
        extContext.publisherId + "." + extContext.extensionId,
        accessToken
      );
    }
    return this.dataManager;
  }

  /**
   * Generate a build-scoped storage key
   * @param buildId - The build ID
   * @returns Storage key for the build
   * @private
   */
  private getStorageKey(buildId: number): string {
    return `${StorageService.ANALYSIS_KEY_PREFIX}${buildId}`;
  }

  /**
   * Save analysis result for a specific build
   * @param buildId - The build ID
   * @param analysis - The analysis result to save
   * @returns Promise that resolves when analysis is saved
   */
  async saveAnalysis(buildId: number, analysis: AnalysisResult): Promise<void> {
    try {
      const dataManager = await this.getDataManager();
      const storageKey = this.getStorageKey(buildId);

      await dataManager.setValue(
        storageKey,
        analysis
      );
    } catch (error) {
      console.error(`Error saving analysis for build ${buildId}:`, error);
      throw new Error("Failed to save analysis result");
    }
  }

  /**
   * Get analysis result for a specific build
   * @param buildId - The build ID
   * @returns Promise resolving to AnalysisResult or null if not found
   */
  async getAnalysis(buildId: number): Promise<AnalysisResult | null> {
    try {
      const dataManager = await this.getDataManager();
      const storageKey = this.getStorageKey(buildId);

      const analysis = await dataManager.getValue(
        storageKey
      ) as AnalysisResult | undefined;

      return analysis || null;
    } catch (error) {
      console.error(`Error retrieving analysis for build ${buildId}:`, error);
      return null;
    }
  }

  /**
   * Check if analysis exists for a specific build
   * @param buildId - The build ID
   * @returns Promise resolving to true if analysis exists, false otherwise
   */
  async hasAnalysis(buildId: number): Promise<boolean> {
    try {
      const analysis = await this.getAnalysis(buildId);
      return analysis !== null;
    } catch (error) {
      console.error(`Error checking analysis existence for build ${buildId}:`, error);
      return false;
    }
  }
}
