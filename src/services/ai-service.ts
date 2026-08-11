import { AIResponse, ChatRequest } from "../models/analysis";
import { BuildStatus } from "../models/build-data";

/** Calls the configured BFF AI endpoint directly from the iframe. */
export class AIService {
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 1000;

  /**
   * Standard analysis — sends failed/relevant logs with type "normal".
   * message is "azure build pipeline error" for failed/partial builds,
   * "azure build pipeline improvement" for everything else.
   */
  async analyze(
    serviceUrl: string,
    token: string,
    buildRunUrl: string,
    buildStatus: BuildStatus
  ): Promise<string> {
    const message =
      buildStatus === "failed" || buildStatus === "partiallySucceeded"
        ? "azure build pipeline error"
        : "azure build pipeline improvement";

    const request: ChatRequest = {
      message,
      data: buildRunUrl,
      role: "user",
      type: "normal",
    };

    return this.sendRequest(serviceUrl, token, request);
  }

  /**
   * Super analysis — always sends full logs with type "super".
   * message follows the same failed/improvement rule.
   */
  async superAnalyze(
    serviceUrl: string,
    token: string,
    buildRunUrl: string,
    buildStatus: BuildStatus
  ): Promise<string> {
    const message =
      buildStatus === "failed" || buildStatus === "partiallySucceeded"
        ? "azure build pipeline error"
        : "azure build pipeline improvement";

    const request: ChatRequest = {
      message,
      data: buildRunUrl,
      role: "user",
      type: "super",
    };

    return this.sendRequest(serviceUrl, token, request);
  }

  private async sendRequest(
    serviceUrl: string,
    token: string,
    payload: ChatRequest
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
            `AI service returned HTTP ${response.status}: ${message || response.statusText}`
          ) as Error & { statusCode: number };
          error.statusCode = response.status;
          throw error;
        }

        const result = (await response.json()) as unknown;
        if (!this.isValidAIResponse(result)) {
          throw new Error("AI service returned an unexpected response format");
        }
        return result.response;
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
    return (
      !!data &&
      typeof data === "object" &&
      typeof (data as { response?: unknown }).response === "string"
    );
  }

  private isNonRetryable(error: Error): boolean {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    return (
      (statusCode !== undefined && statusCode >= 400 && statusCode < 500) ||
      error.message.includes("URL") ||
      error.message.includes("unexpected response")
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
