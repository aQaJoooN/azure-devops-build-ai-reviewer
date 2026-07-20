/**
 * Analysis result interface
 * Stores the results of an AI-powered build log analysis
 */
export interface AnalysisResult {
  /**
   * Unique identifier of the build that was analyzed
   */
  buildId: number;

  /**
   * Type of analysis performed
   */
  analysisType: 'analyze' | 'super-analyze';

  /**
   * Timestamp when the analysis was performed
   */
  timestamp: Date;

  /**
   * Markdown-formatted analysis results from the AI backend
   */
  result: string;
}

/**
 * Request payload for standard analyze endpoint (OpenAI chat completions format)
 */
export interface AnalyzeRequest {
  /**
   * Array of messages in OpenAI format
   */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Request payload for super analyze endpoint (OpenAI chat completions format)
 */
export interface SuperAnalyzeRequest {
  /**
   * Array of messages in OpenAI format
   */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Response from AI backend (OpenAI chat completions format)
 */
export interface AIResponse {
  /**
   * Array of completion choices
   */
  choices: Array<{
    /**
     * Message from the assistant
     */
    message: {
      /**
       * Role of the message
       */
      role: string;
      /**
       * Content of the message
       */
      content: string;
    };
  }>;
}

/**
 * Repository context interface
 * Contains repository information and relevant source files
 */
export interface RepositoryContext {
  /**
   * Unique identifier of the repository
   */
  repositoryId: string;

  /**
   * Name of the repository
   */
  repositoryName: string;

  /**
   * Branch that was built
   */
  branch: string;

  /**
   * Commit SHA that was built
   */
  commit: string;

  /**
   * List of files in the repository
   */
  files: FileInfo[];
}

/**
 * File information interface
 * Represents a single file in the repository context
 */
export interface FileInfo {
  /**
   * Relative path to the file in the repository
   */
  path: string;

  /**
   * File content (optional, included only for relevant files)
   */
  content?: string;
}
