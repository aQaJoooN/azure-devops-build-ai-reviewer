/**
 * Extension settings interface
 * Stores project-level configuration for the AI Analyzer extension
 */
export interface ExtensionSettings {
  /**
   * Whether the extension is enabled for the project
   */
  enabled: boolean;

  /** Complete HTTP or HTTPS URL of the OpenAI-compatible endpoint. */
  aiServiceUrl: string;

  /** Optional bearer token loaded only by the analyzer runtime. */
  aiServiceToken: string;

  /** Whether a token exists without exposing its value to the settings page. */
  aiServiceTokenConfigured: boolean;

  /**
   * Whether the super analyze feature is enabled
   */
  superAnalyzeEnabled: boolean;
}
