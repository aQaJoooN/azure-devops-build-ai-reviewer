import * as SDK from "azure-devops-extension-sdk";
import { ExtensionSettings } from "../models/settings";

/** Persists project-specific settings and credentials in extension data. */
export class SettingsService {
  private static readonly SETTINGS_PREFIX = "ai-analyzer-extension-settings";
  private static readonly TOKEN_PREFIX = "ai-analyzer-service-token";
  private static readonly SETTINGS_COLLECTION = "$settings";
  private static readonly CREDENTIALS_COLLECTION = "$credentials";
  private static readonly API_VERSION = "3.2-preview.1";

  private static readonly DEFAULT_SETTINGS: ExtensionSettings = {
    enabled: false,
    aiServiceUrl: "",
    aiServiceToken: "",
    aiServiceTokenConfigured: false,
    superAnalyzeEnabled: false,
  };

  private async getDocumentsBaseUrl(collection: string): Promise<string> {
    await SDK.ready();
    const context = SDK.getExtensionContext();
    const host = SDK.getHost();
    return (
      `${window.location.origin}/tfs/${encodeURIComponent(host.name)}/_apis/ExtensionManagement/InstalledExtensions/` +
      `${encodeURIComponent(context.publisherId)}/${encodeURIComponent(context.extensionId)}/Data/Scopes/Default/Current/` +
      `Collections/${encodeURIComponent(collection)}/Documents`
    );
  }

  private getSettingsId(projectId: string): string {
    return `${SettingsService.SETTINGS_PREFIX}-${projectId}`;
  }

  private getTokenId(projectId: string): string {
    return `${SettingsService.TOKEN_PREFIX}-${projectId}`;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async getDocument(
    collection: string,
    documentId: string
  ): Promise<Record<string, unknown> | null> {
    const baseUrl = await this.getDocumentsBaseUrl(collection);
    const url = `${baseUrl}/${encodeURIComponent(documentId)}?api-version=${SettingsService.API_VERSION}`;
    const response = await fetch(url, {
      headers: this.buildHeaders(),
      credentials: "include",
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private async putDocument(
    collection: string,
    document: Record<string, unknown>
  ): Promise<void> {
    const baseUrl = await this.getDocumentsBaseUrl(collection);
    const response = await fetch(
      `${baseUrl}?api-version=${SettingsService.API_VERSION}`,
      {
        method: "PUT",
        headers: this.buildHeaders(),
        credentials: "include",
        body: JSON.stringify({ ...document, __etag: -1 }),
      }
    );
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${message || response.statusText}`);
    }
  }

  private async deleteDocument(
    collection: string,
    documentId: string
  ): Promise<void> {
    const baseUrl = await this.getDocumentsBaseUrl(collection);
    const response = await fetch(
      `${baseUrl}/${encodeURIComponent(documentId)}?api-version=${SettingsService.API_VERSION}`,
      { method: "DELETE", credentials: "include" }
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  async getSettings(
    projectId: string,
    includeToken = true
  ): Promise<ExtensionSettings> {
    const settingsDocument = await this.getDocument(
      SettingsService.SETTINGS_COLLECTION,
      this.getSettingsId(projectId)
    );
    if (!settingsDocument) {
      return { ...SettingsService.DEFAULT_SETTINGS };
    }

    // Read the old inline value only for migration compatibility. New saves
    // always remove it from the general settings document.
    const legacyToken =
      typeof settingsDocument.aiServiceToken === "string"
        ? settingsDocument.aiServiceToken
        : "";
    let storedToken = "";
    if (includeToken) {
      const tokenDocument = await this.getDocument(
        SettingsService.CREDENTIALS_COLLECTION,
        this.getTokenId(projectId)
      );
      storedToken =
        typeof tokenDocument?.token === "string" ? tokenDocument.token : legacyToken;
    }

    return {
      enabled: !!settingsDocument.enabled,
      aiServiceUrl:
        typeof settingsDocument.aiServiceUrl === "string"
          ? settingsDocument.aiServiceUrl
          : "",
      aiServiceToken: storedToken,
      aiServiceTokenConfigured: includeToken
        ? !!storedToken
        : !!settingsDocument.aiServiceTokenConfigured || !!legacyToken,
      superAnalyzeEnabled: !!settingsDocument.superAnalyzeEnabled,
    };
  }

  async saveSettings(
    projectId: string,
    settings: ExtensionSettings,
    tokenUpdate?: string | null
  ): Promise<void> {
    let tokenToMigrate = "";
    if (tokenUpdate === undefined) {
      const currentSettings = await this.getDocument(
        SettingsService.SETTINGS_COLLECTION,
        this.getSettingsId(projectId)
      );
      tokenToMigrate =
        typeof currentSettings?.aiServiceToken === "string"
          ? currentSettings.aiServiceToken
          : "";
    }

    if (tokenUpdate) {
      await this.putDocument(SettingsService.CREDENTIALS_COLLECTION, {
        id: this.getTokenId(projectId),
        token: tokenUpdate,
      });
    } else if (tokenUpdate === null) {
      await this.deleteDocument(
        SettingsService.CREDENTIALS_COLLECTION,
        this.getTokenId(projectId)
      );
    } else if (tokenToMigrate) {
      await this.putDocument(SettingsService.CREDENTIALS_COLLECTION, {
        id: this.getTokenId(projectId),
        token: tokenToMigrate,
      });
    }

    await this.putDocument(SettingsService.SETTINGS_COLLECTION, {
      id: this.getSettingsId(projectId),
      enabled: settings.enabled,
      aiServiceUrl: settings.aiServiceUrl,
      aiServiceTokenConfigured:
        tokenUpdate === null
          ? false
          : !!tokenUpdate || !!tokenToMigrate || settings.aiServiceTokenConfigured,
      superAnalyzeEnabled: settings.superAnalyzeEnabled,
    });
  }

  async isExtensionEnabled(projectId: string): Promise<boolean> {
    return (await this.getSettings(projectId, false)).enabled;
  }
}