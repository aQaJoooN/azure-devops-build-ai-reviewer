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
   * Name of the Azure DevOps Generic service connection whose Server URL
   * points to the OpenAI-compatible chat-completions endpoint.
   */
  serviceConnectionName: string;

  /**
   * Whether the super analyze feature is enabled
   */
  superAnalyzeEnabled: boolean;
}
