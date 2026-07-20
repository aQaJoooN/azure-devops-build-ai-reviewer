import * as SDK from "azure-devops-extension-sdk";
import { ExtensionSettings } from "../models/settings";

/**
 * Service for managing extension settings storage and retrieval.
 *
 * On on-prem Azure DevOps Server the OAuth session-token endpoint
 * (/_apis/WebPlatformAuth/SessionToken) can fail with
 * "HostAuthorizationNotFound", and the SDK Extension Data Service then
 * triggers an interactive login popup. To avoid this, settings are stored
 * directly through the ExtensionManagement document REST API using the
 * current browser session (cookie auth via credentials: "include").
 */
export class SettingsService {
  private static readonly DOCUMENT_ID = "ai-analyzer-extension-settings";
  private static readonly COLLECTION_NAME = "$settings";
  private static readonly API_VERSION = "3.2-preview.1";

  private static readonly DEFAULT_SETTINGS: ExtensionSettings = {
    enabled: false,
    aiBackendUrl: "",
    apiKey: undefined,
    superAnalyzeEnabled: false,
  };

  /**
   * Build the base URL for the extension data documents endpoint.
   * Uses the current window origin and TFS collection name so it works
   * on on-prem Azure DevOps Server.
   * @private
   */
  private async getDocumentsBaseUrl(): Promise<string> {
    await SDK.ready();
    const ctx = SDK.getExtensionContext();
    const host = SDK.getHost();
    const origin = `${window.location.protocol}//${window.location.host}`;
    return (
      `${origin}/tfs/${host.name}/_apis/ExtensionManagement/InstalledExtensions/` +
      `${ctx.publisherId}/${ctx.extensionId}/Data/Scopes/Default/Current/` +
      `Collections/${SettingsService.COLLECTION_NAME}/Documents`
    );
  }

  /**
   * Build request headers. Includes a Bearer token only when one can be
   * obtained without failing; otherwise relies purely on the session cookie.
   * @private
   */
  private async buildHeaders(): Promise<Record<string, string>> {
    // NOTE: We intentionally do NOT call SDK.getAccessToken() here.
    // On on-prem Azure DevOps Server the OAuth session-token endpoint
    // (/_apis/WebPlatformAuth/SessionToken) returns HTTP 500
    // (HostAuthorizationNotFound), which floods the console with errors on
    // every request. The requests already succeed using the current browser
    // session (cookie auth via credentials: "include"), so we rely on that.
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Get extension settings for a specific project.
   * @param projectId - The Azure DevOps project ID (kept for API compatibility)
   * @returns Promise resolving to ExtensionSettings or defaults if not found
   */
  async getSettings(_projectId: string): Promise<ExtensionSettings> {
    try {
      console.log("=== Getting Settings ===");
      const baseUrl = await this.getDocumentsBaseUrl();
      const url = `${baseUrl}/${SettingsService.DOCUMENT_ID}?api-version=${SettingsService.API_VERSION}`;
      const headers = await this.buildHeaders();

      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      });

      if (response.status === 404) {
        console.log("No settings document found, returning defaults");
        return { ...SettingsService.DEFAULT_SETTINGS };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const doc = await response.json();
      console.log("Settings document retrieved");

      return {
        enabled: !!doc.enabled,
        aiBackendUrl: doc.aiBackendUrl || "",
        apiKey: doc.apiKey || undefined,
        superAnalyzeEnabled: !!doc.superAnalyzeEnabled,
      };
    } catch (error) {
      console.error("=== Error Retrieving Settings ===");
      console.error("Error:", error);
      // Return defaults on error so the page still loads without a popup
      return { ...SettingsService.DEFAULT_SETTINGS };
    }
  }

  /**
   * Save extension settings for a specific project.
   * @param projectId - The Azure DevOps project ID (kept for API compatibility)
   * @param settings - The settings to save
   */
  async saveSettings(
    _projectId: string,
    settings: ExtensionSettings
  ): Promise<void> {
    try {
      console.log("=== Saving Settings ===");
      const baseUrl = await this.getDocumentsBaseUrl();
      const url = `${baseUrl}?api-version=${SettingsService.API_VERSION}`;
      const headers = await this.buildHeaders();

      // __etag: -1 performs an upsert (create or overwrite) without a
      // concurrency check.
      const document = {
        id: SettingsService.DOCUMENT_ID,
        __etag: -1,
        enabled: settings.enabled,
        aiBackendUrl: settings.aiBackendUrl,
        apiKey: settings.apiKey || null,
        superAnalyzeEnabled: settings.superAnalyzeEnabled,
      };

      const response = await fetch(url, {
        method: "PUT",
        headers,
        credentials: "include",
        body: JSON.stringify(document),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${response.statusText} ${text}`);
      }

      console.log("Settings saved successfully");
    } catch (error) {
      console.error("=== Error Saving Settings ===");
      console.error("Error:", error);
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(`Failed to save extension settings: ${message}`);
    }
  }

  /**
   * Check if the extension is enabled for a specific project.
   * @param projectId - The Azure DevOps project ID
   * @returns Promise resolving to true if extension is enabled
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
