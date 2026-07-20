import * as SDK from "azure-devops-extension-sdk";
import { AnalysisResult } from "../models/analysis";

/**
 * Service for persisting analysis results for each build run.
 *
 * Uses the ExtensionManagement document REST API directly with the current
 * browser session (cookie auth) to avoid the OAuth session-token flow, which
 * fails on on-prem Azure DevOps Server and triggers an interactive login popup.
 */
export class StorageService {
  private static readonly ANALYSIS_KEY_PREFIX = "analysis-result-";
  private static readonly COLLECTION_NAME = "$analysis";
  private static readonly API_VERSION = "3.2-preview.1";

  /**
   * Build the base URL for the extension data documents endpoint.
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
      `Collections/${StorageService.COLLECTION_NAME}/Documents`
    );
  }

  /**
   * Build request headers with optional Bearer token, falling back to
   * cookie-based auth without triggering an interactive login.
   * @private
   */
  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    try {
      const token = await SDK.getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch (tokenError) {
      console.warn(
        "getAccessToken() unavailable, using session cookie auth:",
        tokenError
      );
    }

    return headers;
  }

  /**
   * Generate a build-scoped storage key.
   * @private
   */
  private getStorageKey(buildId: number): string {
    return `${StorageService.ANALYSIS_KEY_PREFIX}${buildId}`;
  }

  /**
   * Save analysis result for a specific build.
   * @param buildId - The build ID
   * @param analysis - The analysis result to save
   */
  async saveAnalysis(buildId: number, analysis: AnalysisResult): Promise<void> {
    try {
      const baseUrl = await this.getDocumentsBaseUrl();
      const url = `${baseUrl}?api-version=${StorageService.API_VERSION}`;
      const headers = await this.buildHeaders();

      const document = {
        ...analysis,
        id: this.getStorageKey(buildId),
        __etag: -1,
      };

      const response = await fetch(url, {
        method: "PUT",
        headers,
        credentials: "include",
        body: JSON.stringify(document),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error saving analysis for build ${buildId}:`, error);
      throw new Error("Failed to save analysis result");
    }
  }

  /**
   * Get analysis result for a specific build.
   * @param buildId - The build ID
   * @returns Promise resolving to AnalysisResult or null if not found
   */
  async getAnalysis(buildId: number): Promise<AnalysisResult | null> {
    try {
      const baseUrl = await this.getDocumentsBaseUrl();
      const url = `${baseUrl}/${this.getStorageKey(buildId)}?api-version=${StorageService.API_VERSION}`;
      const headers = await this.buildHeaders();

      const response = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const doc = await response.json();
      return doc as AnalysisResult;
    } catch (error) {
      console.error(`Error retrieving analysis for build ${buildId}:`, error);
      return null;
    }
  }

  /**
   * Check if analysis exists for a specific build.
   * @param buildId - The build ID
   * @returns Promise resolving to true if analysis exists
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
