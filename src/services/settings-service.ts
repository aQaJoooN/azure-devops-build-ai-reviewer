import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds } from "azure-devops-extension-api";
import { ExtensionSettings } from "../models/settings";

/**
 * Service for managing extension settings storage and retrieval  
 * Uses Azure DevOps Extension Data Service
 */
export class SettingsService {
  private static readonly SETTINGS_KEY = "ai-analyzer-extension-settings";
  private static readonly TIMEOUT_MS = 5000;
  private dataManagerPromise: Promise<any> | null = null;

  /**
   * Get or create cached data manager
   * @private
   */
  private async getDataManager(): Promise<any> {
    if (!this.dataManagerPromise) {
      this.dataManagerPromise = this.createDataManager();
    }
    return this.dataManagerPromise;
  }

  /**
   * Create data manager with timeout protection
   * @private
   */
  private async createDataManager(): Promise<any> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Data manager initialization timed out')), SettingsService.TIMEOUT_MS);
    });

    await SDK.ready();
    const accessToken = await SDK.getAccessToken();
    const extContext = SDK.getExtensionContext();
    
    const dataService = await SDK.getService<any>(CommonServiceIds.ExtensionDataService);
    
    const dataManager = await Promise.race([
      dataService.getExtensionDataManager(
        extContext.publisherId + "." + extContext.extensionId,
        accessToken
      ),
      timeoutPromise
    ]);

    return dataManager;
  }

  /**
   * Get extension settings for a specific project
   * @param projectId - The Azure DevOps project ID
   * @returns Promise resolving to ExtensionSettings or default settings if not found
   */
  async getSettings(projectId: string): Promise<ExtensionSettings> {
    try {
      console.log("=== Getting Settings ===");
      console.log("Project ID:", projectId);
      
      const dataManager = await this.getDataManager();
      console.log("Data manager obtained (cached)");
      
      const settings = await dataManager.getValue(
        SettingsService.SETTINGS_KEY
      ) as ExtensionSettings | undefined;

      console.log("Settings retrieved:", settings);

      // Return settings if found, otherwise return default settings
      if (settings) {
        return settings;
      }

      // Default settings when not configured
      console.log("No settings found, returning defaults");
      return {
        enabled: false,
        aiBackendUrl: "",
        apiKey: undefined,
        superAnalyzeEnabled: false,
      };
    } catch (error) {
      console.error("=== Error Retrieving Settings ===");
      console.error("Error:", error);
      // Return default settings on error
      return {
        enabled: false,
        aiBackendUrl: "",
        apiKey: undefined,
        superAnalyzeEnabled: false,
      };
    }
  }

  /**
   * Save extension settings for a specific project
   * @param projectId - The Azure DevOps project ID
   * @param settings - The settings to save
   * @returns Promise that resolves when settings are saved
   */
  async saveSettings(
    projectId: string,
    settings: ExtensionSettings
  ): Promise<void> {
    try {
      console.log("=== Saving Settings ===");
      console.log("Project ID:", projectId);
      console.log("Settings:", JSON.stringify(settings, null, 2));
      
      const dataManager = await this.getDataManager();
      console.log("Data manager obtained (cached)");
      
      await dataManager.setValue(
        SettingsService.SETTINGS_KEY,
        settings
      );
      
      console.log("Settings saved successfully");
    } catch (error) {
      console.error("=== Error Saving Settings ===");
      console.error("Error type:", typeof error);
      console.error("Error:", error);
      
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Stack trace:", error.stack);
        throw new Error(`Failed to save extension settings: ${error.message}`);
      } else {
        throw new Error(`Failed to save extension settings: ${JSON.stringify(error)}`);
      }
    }
  }

  /**
   * Check if the extension is enabled for a specific project
   * @param projectId - The Azure DevOps project ID
   * @returns Promise resolving to true if extension is enabled, false otherwise
   */
  async isExtensionEnabled(projectId: string): Promise<boolean> {
    try {
      const settings = await this.getSettings(projectId);
      return settings.enabled;
    } catch (error) {
      console.error("Error checking if extension is enabled:", error);
      return false;
    }
  }
}
