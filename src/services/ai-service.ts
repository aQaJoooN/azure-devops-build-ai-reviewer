import {
  AIResponse,
  AnalyzeRequest,
  RepositoryContext,
  SuperAnalyzeRequest,
} from "../models/analysis";

/** Calls the configured OpenAI-compatible endpoint directly from the iframe. */
export class AIService {
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 1000;

  async analyze(
    serviceUrl: string,
    token: string,
    logs: string
  ): Promise<string> {
    const request: AnalyzeRequest = {
      messages: [
        {
          role: "system",
          content:
            "You are an expert at analyzing Azure DevOps build logs. Provide concise, actionable analysis in markdown format (60-80 lines max). First summarize the problem in 5-10 lines, then provide details.",
        },
        {
          role: "user",
          content: `Analyze these Azure DevOps build logs and identify issues:\n\n${logs}`,
        },
      ],
    };

    return this.sendRequest(serviceUrl, token, request);
  }

  async superAnalyze(
    serviceUrl: string,
    token: string,
    logs: string,
    repositories: RepositoryContext[]
  ): Promise<string> {
    let repositoryContext = "";
    for (const repository of repositories) {
      repositoryContext += `\n\nRepository: ${repository.repositoryName}\nBranch: ${repository.branch}\nCommit: ${repository.commit}\nFiles:\n`;
      for (const file of repository.files) {
        repositoryContext += file.content
          ? `\n--- ${file.path} ---\n${file.content}\n`
          : `- ${file.path}\n`;
      }
    }
    const request: SuperAnalyzeRequest = {
      messages: [
        {
          role: "system",
          content:
            "You are an expert at analyzing Azure DevOps build logs with repository context. Provide comprehensive analysis in markdown format (60-80 lines max). First summarize the problem in 5-10 lines, then provide detailed analysis with code references.",
        },
        {
          role: "user",
          content: `Analyze these Azure DevOps build logs with repository context:\n\n# Build Logs\n${logs}\n\n# Repository Context${repositoryContext}`,
        },
      ],
    };

    return this.sendRequest(serviceUrl, token, request);
  }

  private async sendRequest(
    serviceUrl: string,
    token: string,
    payload: AnalyzeRequest | SuperAnalyzeRequest
  ): Promise<string> {
    this.validateServiceUrl(serviceUrl);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(serviceUrl, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const message = await response.text().catch(() => "");
          const error = new Error(
            `AI service returned HTTP ${response.status}: ${
              message || response.statusText
            }`
          ) as Error & { statusCode: number };
          error.statusCode = response.status;
          throw error;
        }

        const result = (await response.json()) as unknown;
        if (!this.isValidAIResponse(result)) {
          throw new Error("AI service returned invalid OpenAI response format");
        }
        return result.choices[0].message.content;
      } catch (error) {
        lastError = this.toRequestError(error);
        if (this.isNonRetryable(lastError) || attempt === this.MAX_RETRIES) {
          break;
        }
        await this.delay(this.RETRY_DELAY * (attempt + 1));
      }
    }

    throw new Error(`AI request failed: ${lastError?.message || "Unknown error"}`);
  }

  private validateServiceUrl(serviceUrl: string): void {
    let url: URL;
    try {
      url = new URL(serviceUrl);
    } catch {
      throw new Error("AI service URL is invalid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("AI service URL must use HTTP or HTTPS");
    }
  }

  private toRequestError(error: unknown): Error {
    if (error instanceof TypeError) {
      return new Error(
        "Unable to reach the AI service. Check network access, CORS policy, and whether the browser blocked an HTTP request from an HTTPS page."
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private isValidAIResponse(data: unknown): data is AIResponse {
    if (!data || typeof data !== "object") {
      return false;
    }
    const choices = (data as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      return false;
    }
    const message = (choices[0] as { message?: unknown }).message;
    return (
      !!message &&
      typeof message === "object" &&
      typeof (message as { content?: unknown }).content === "string"
    );
  }

  private isNonRetryable(error: Error): boolean {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    return (
      (statusCode !== undefined && statusCode >= 400 && statusCode < 500) ||
      error.message.includes("URL") ||
      error.message.includes("invalid OpenAI response")
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}