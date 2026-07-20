/**
 * Extension settings interface
 * Stores project-level configuration for the AI Analyzer extension
 */
export interface ExtensionSettings {
  /**
   * Whether the extension is enabled for the project
   */
  enabled: boolean;

  /**
   * URL of the AI backend service (Python service or AI API)
   */
  aiBackendUrl: string;

  /**
   * Optional API key for authenticating with the AI backend
   */
  apiKey?: string;

  /**
   * Whether the super analyze feature is enabled
   */
  superAnalyzeEnabled: boolean;
}
