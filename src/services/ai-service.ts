import * as SDK from "azure-devops-extension-sdk";
import {
  AIResponse,
  AnalyzeRequest,
  RepositoryContext,
  SuperAnalyzeRequest,
} from "../models/analysis";

interface ServiceEndpointSummary {
  id: string;
  name: string;
  type: string;
  url: string;
  authorization?: {
    parameters: Record<string, string>;
    scheme: string;
  };
  data?: Record<string, string>;
}

interface EndpointListResponse {
  value?: ServiceEndpointSummary[];
}

interface EndpointProxyResult {
  errorMessage?: string;
  result?: unknown;
  statusCode?: string | number;
}

/**
 * Sends OpenAI-compatible requests through an Azure DevOps Generic service
 * connection. Azure DevOps performs the backend HTTP request server-side,
 * avoiding browser mixed-content and CORS restrictions.
 */
export class AIService {
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_DELAY = 1000;

  async analyze(
    projectId: string,
    serviceConnectionName: string,
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

    return this.sendOpenAIRequest(projectId, serviceConnectionName, request);
  }

  async superAnalyze(
    projectId: string,
    serviceConnectionName: string,
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

    return this.sendOpenAIRequest(projectId, serviceConnectionName, request);
  }

  private async sendOpenAIRequest(
    projectId: string,
    serviceConnectionName: string,
    payload: AnalyzeRequest | SuperAnalyzeRequest
  ): Promise<string> {
    const endpoint = await this.getGenericServiceEndpoint(
      projectId,
      serviceConnectionName
    );
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const proxyResult = await this.executeEndpointRequest(
          projectId,
          endpoint,
          payload
        );
        const response = this.parseProxyResult(proxyResult);
        return response.choices[0].message.content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (this.isNonRetryableError(lastError) || attempt === this.MAX_RETRIES) {
          break;
        }
        await this.delay(this.RETRY_DELAY * (attempt + 1));
      }
    }

    throw new Error(
      `AI request through service connection failed: ${lastError?.message || "Unknown error"
      }`
    );
  }

  private async getGenericServiceEndpoint(
    projectId: string,
    serviceConnectionName: string
  ): Promise<ServiceEndpointSummary> {
    await SDK.ready();
    const baseUrl = this.getCollectionBaseUrl();
    const query = new URLSearchParams({
      endpointNames: serviceConnectionName,
      type: "generic",
      "api-version": "6.0-preview.4",
    });
    const response = await fetch(
      `${baseUrl}/${encodeURIComponent(projectId)}/_apis/serviceendpoint/endpoints?${query}`,
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Unable to resolve service connection (${response.status} ${response.statusText})`
      );
    }

    const data = (await response.json()) as EndpointListResponse;
    const endpoint = data.value?.find(
      (item) =>
        item.name.toLowerCase() === serviceConnectionName.toLowerCase() &&
        item.type.toLowerCase() === "generic"
    );
    if (!endpoint) {
      throw new Error(
        `Generic service connection "${serviceConnectionName}" was not found or is not authorized for use`
      );
    }
    if (!endpoint.url) {
      throw new Error(
        `Generic service connection "${serviceConnectionName}" has no Server URL`
      );
    }

    return endpoint;
  }

  private async executeEndpointRequest(
    projectId: string,
    endpoint: ServiceEndpointSummary,
    payload: AnalyzeRequest | SuperAnalyzeRequest
  ): Promise<EndpointProxyResult> {
    const proxyRequest = {
      dataSourceDetails: {
        dataSourceUrl: "{{endpoint.url}}",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Accept", value: "application/json" },
        ],
        initialContextTemplate: "",
        parameters: {},
        requestContent: JSON.stringify(payload),
        requestVerb: "POST",
        resultSelector: "jsonpath:$",
      },
      resultTransformationDetails: {
        callbackContextTemplate: "",
        callbackRequiredTemplate: "",
        resultTemplate: "",
      },
      serviceEndpointDetails: {
        authorization: endpoint.authorization,
        data: endpoint.data || {},
        type: endpoint.type,
        url: endpoint.url,
      },
    };

    const baseUrl = this.getCollectionBaseUrl();
    const query = new URLSearchParams({
      endpointId: endpoint.id,
      "api-version": "6.0-preview.1",
    });
    const response = await fetch(
      `${baseUrl}/${encodeURIComponent(projectId)}/_apis/serviceendpoint/endpointproxy?${query}`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(proxyRequest),
      }
    );

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      if (
        response.status === 400 &&
        /enough permissions required/i.test(message) &&
        /post/i.test(message)
      ) {
        throw this.createProxyError(
          response.status,
          `Azure DevOps denied endpoint-proxy POST (runtime ${AIService.RUNTIME_VERSION}). Install or approve an extension version granted the vso.serviceendpoint_manage scope. User service-connection permissions do not replace this extension grant.`
        );
      }
      throw this.createProxyError(
        response.status,
        `Azure DevOps endpoint proxy returned ${response.status}: ${message || response.statusText}`
      );
    }

    return (await response.json()) as EndpointProxyResult;
  }

  private parseProxyResult(proxyResult: EndpointProxyResult): AIResponse {
    const statusCode =
      Number.parseInt(String(proxyResult.statusCode || 0), 10) || 0;
    if (statusCode >= 400) {
      throw this.createProxyError(
        statusCode,
        `AI backend returned HTTP ${statusCode}${proxyResult.errorMessage ? `: ${proxyResult.errorMessage}` : ""}`
      );
    }
    if (proxyResult.errorMessage) {
      throw new Error(proxyResult.errorMessage);
    }

    let result = proxyResult.result;
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        throw new Error("AI backend returned invalid JSON");
      }
    }

    if (!this.isValidAIResponse(result)) {
      throw new Error("AI backend returned invalid OpenAI response format");
    }

    return result;
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

  private getCollectionBaseUrl(): string {
    const host = SDK.getHost();
    const origin = window.location.origin;
    return `${origin}/tfs/${encodeURIComponent(host.name)}`;
  }

  private createProxyError(statusCode: number, message: string): Error {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = statusCode;
    return error;
  }

  private isNonRetryableError(error: Error): boolean {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return true;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes("was not found") ||
      message.includes("not authorized") ||
      message.includes("has no server url") ||
      message.includes("invalid openai response") ||
      message.includes("invalid json") ||
      message.includes("invalidserviceendpointrequestexception") ||
      message.includes("invaliddatasourcebindingexception")
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
