import {
  AnalyzeRequest,
  SuperAnalyzeRequest,
  AIResponse,
  RepositoryContext,
} from "../models/analysis";

/**
 * Service for communicating with external AI backend
 * Handles HTTP requests to AI service for log analysis
 */
export class AIService {
  private readonly DEFAULT_TIMEOUT = 60000; // 60 seconds
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 1000; // 1 second

  /**
   * Perform standard analysis on build logs
   * Sends error logs (or full logs if build succeeded) to AI backend in OpenAI format
   * @param backendUrl - Complete URL of the AI backend service (used as-is)
   * @param logs - Build logs to analyze
   * @param apiKey - Optional API key for authentication
   * @returns Promise resolving to markdown-formatted analysis
   */
  async analyze(
    backendUrl: string,
    logs: string,
    apiKey?: string
  ): Promise<string> {
    const request: AnalyzeRequest = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing Azure DevOps build logs. Provide concise, actionable analysis in markdown format (60-80 lines max). First summarize the problem in 5-10 lines, then provide details.'
        },
        {
          role: 'user',
          content: `Analyze these Azure DevOps build logs and identify issues:\n\n${logs}`
        }
      ]
    };

    // Use backendUrl as-is without appending paths
    const response = await this.sendRequest<AnalyzeRequest, AIResponse>(
      backendUrl,
      request,
      apiKey
    );

    return response.choices[0].message.content;
  }

  /**
   * Perform comprehensive analysis with full logs and repository context
   * Sends data to AI backend in OpenAI format
   * @param backendUrl - Complete URL of the AI backend service (used as-is)
   * @param logs - Full build logs
   * @param repositories - Repository context including source files
   * @param apiKey - Optional API key for authentication
   * @returns Promise resolving to markdown-formatted analysis
   */
  async superAnalyze(
    backendUrl: string,
    logs: string,
    repositories: RepositoryContext[],
    apiKey?: string
  ): Promise<string> {
    // Build repository context string
    let repoContext = '';
    for (const repo of repositories) {
      repoContext += `\n\nRepository: ${repo.repositoryName}\nBranch: ${repo.branch}\nCommit: ${repo.commit}\n`;
      repoContext += `Files:\n`;
      for (const file of repo.files) {
        if (file.content) {
          repoContext += `\n--- ${file.path} ---\n${file.content}\n`;
        } else {
          repoContext += `- ${file.path}\n`;
        }
      }
    }

    const request: SuperAnalyzeRequest = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing Azure DevOps build logs with repository context. Provide comprehensive analysis in markdown format (60-80 lines max). First summarize the problem in 5-10 lines, then provide detailed analysis with code references.'
        },
        {
          role: 'user',
          content: `Analyze these Azure DevOps build logs with repository context:\n\n# Build Logs\n${logs}\n\n# Repository Context${repoContext}`
        }
      ]
    };

    // Use backendUrl as-is without appending paths
    const response = await this.sendRequest<SuperAnalyzeRequest, AIResponse>(
      backendUrl,
      request,
      apiKey
    );

    return response.choices[0].message.content;
  }

  /**
   * Send HTTP request to AI backend with retry logic
   * @param endpoint - Full endpoint URL
   * @param payload - Request payload
   * @param apiKey - Optional API key for authentication
   * @returns Promise resolving to AI response
   * @private
   */
  private async sendRequest<TRequest, TResponse>(
    endpoint: string,
    payload: TRequest,
    apiKey?: string
  ): Promise<TResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await this.executeRequest<TRequest, TResponse>(
          endpoint,
          payload,
          apiKey
        );
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on authentication errors or bad request errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // If this isn't the last attempt, wait before retrying
        if (attempt < this.MAX_RETRIES) {
          console.warn(
            `Request attempt ${attempt + 1} failed, retrying...`,
            error
          );
          await this.delay(this.RETRY_DELAY * (attempt + 1));
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `AI backend request failed after ${this.MAX_RETRIES + 1} attempts: ${
        lastError?.message || "Unknown error"
      }`
    );
  }

  /**
   * Execute a single HTTP request to the AI backend
   * @param endpoint - Full endpoint URL
   * @param payload - Request payload
   * @param apiKey - Optional API key for authentication
   * @returns Promise resolving to response data
   * @private
   */
  private async executeRequest<TRequest, TResponse>(
    endpoint: string,
    payload: TRequest,
    apiKey?: string
  ): Promise<TResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.DEFAULT_TIMEOUT
    );

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      // Add authorization header if API key is provided
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP error responses
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Parse and validate response
      const data = await response.json();
      
      if (!this.isValidAIResponse(data)) {
        throw new Error("AI backend returned invalid response format");
      }

      return data as TResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout errors
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          "Analysis request timed out. Please try again."
        );
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new Error(
          "Unable to connect to AI backend. Check configuration."
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Handle HTTP error responses
   * @param response - Fetch response object
   * @throws Error with appropriate message based on status code
   * @private
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `AI backend returned error: ${response.status} ${response.statusText}`;

    try {
      // Try to extract error message from response body
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Ignore JSON parse errors, use default message
    }

    switch (response.status) {
      case 401:
      case 403:
        throw new Error(
          "Invalid API key. Update settings and try again."
        );
      case 400:
        throw new Error(`Bad request: ${errorMessage}`);
      case 404:
        throw new Error(
          "AI backend endpoint not found. Check configuration."
        );
      case 500:
      case 502:
      case 503:
      case 504:
        throw new Error(
          `AI backend service error (${response.status}). Please try again later.`
        );
      default:
        throw new Error(errorMessage);
    }
  }

  /**
   * Check if error is non-retryable (authentication, bad request, etc.)
   * @param error - Error object
   * @returns True if error should not be retried
   * @private
   */
  private isNonRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("invalid api key") ||
        message.includes("bad request") ||
        message.includes("endpoint not found") ||
        message.includes("invalid response format")
      );
    }
    return false;
  }

  /**
   * Validate AI response format (OpenAI chat completions format)
   * @param data - Response data to validate
   * @returns True if response is valid
   * @private
   */
  private isValidAIResponse(data: unknown): boolean {
    if (!data || typeof data !== "object") {
      return false;
    }

    const response = data as { choices?: unknown };
    if (!Array.isArray(response.choices) || response.choices.length === 0) {
      return false;
    }

    const firstChoice = response.choices[0] as { message?: unknown };
    if (!firstChoice.message || typeof firstChoice.message !== "object") {
      return false;
    }

    const message = firstChoice.message as { content?: unknown };
    return typeof message.content === "string";
  }

  /**
   * Delay helper for retry logic
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after delay
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
