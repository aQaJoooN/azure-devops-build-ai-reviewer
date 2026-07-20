import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { SettingsService } from "../services/settings-service";
import { StorageService } from "../services/storage-service";
import { BuildService } from "../services/build-service";
import { AIService } from "../services/ai-service";
import { renderMarkdown } from "../utils/markdown-renderer";
import { AnalysisResult } from "../models/analysis";
import "./analyzer-tab.scss";

/**
 * AI Analyzer Tab Controller
 * Manages the UI and logic for the AI-powered build analysis tab
 */
class AnalyzerTabController {
  private settingsService: SettingsService;
  private storageService: StorageService;
  private buildService: BuildService;
  private aiService: AIService;

  private projectId: string | null = null;
  private buildId: number | null = null;

  // UI element references
  private controlsSection: HTMLElement | null = null;
  private loadingSection: HTMLElement | null = null;
  private errorSection: HTMLElement | null = null;
  private resultsSection: HTMLElement | null = null;

  private analyzeButton: HTMLButtonElement | null = null;
  private superAnalyzeButton: HTMLButtonElement | null = null;
  private retryButton: HTMLButtonElement | null = null;
  private superAnalyzeHelp: HTMLElement | null = null;

  private errorMessage: HTMLElement | null = null;
  private errorTitle: HTMLElement | null = null;
  private markdownContent: HTMLElement | null = null;
  private analysisType: HTMLElement | null = null;
  private analysisTimestamp: HTMLElement | null = null;

  constructor() {
    this.settingsService = new SettingsService();
    this.storageService = new StorageService();
    this.buildService = new BuildService();
    this.aiService = new AIService();
  }

  /**
   * Initialize the tab controller
   * Sets up the UI and checks for existing analysis
   */
  async initialize(): Promise<void> {
    try {
      console.log("=== Initializing AI Analyzer Tab ===");

      // Initialize Azure DevOps SDK. Use the default loaded:true handshake,
      // which is reliable on Azure DevOps Server 2022. (loaded:false leaves
      // the tab stuck on the loading spinner on this server version.)
      await SDK.init({ applyTheme: true });

      // Attempt to register the dynamic tab visibility callback. On Azure
      // DevOps Server 2022 this is generally NOT honored, so the tab stays
      // visible and shows an in-tab "disabled" message instead. Harmless to
      // register on hosts that do support it.
      this.registerTabVisibility();

      await SDK.ready();
      console.log("SDK initialized and ready");

      // Get configuration and apply theme
      const configuration = SDK.getConfiguration();
      console.log("=== Theme Debug ===");
      console.log("configuration.theme:", JSON.stringify(configuration.theme, null, 2));
      SDK.applyTheme(configuration.theme);
      this.applyThemeClass(configuration.theme);
      console.log(
        "body --background-color CSS var:",
        getComputedStyle(document.body).getPropertyValue("--background-color").trim()
      );
      console.log("body classList:", document.body.className);
      console.log("body data-theme:", document.body.getAttribute("data-theme"));
      console.log("=== End Theme Debug ===");

      // Get project ID
      this.projectId = await this.getProjectId();
      console.log("Project ID:", this.projectId);

      // Get build ID from SDK configuration (primary method for Azure DevOps extensions)
      console.log("SDK Configuration:", JSON.stringify(configuration, null, 2));

      // Method 1: Check configuration object for build context
      if (configuration) {
        // Try buildId directly
        if (configuration.buildId) {
          this.buildId = typeof configuration.buildId === 'number'
            ? configuration.buildId
            : parseInt(configuration.buildId as string, 10);
        }

        // Try build object
        if (!this.buildId && (configuration as any).build) {
          const build = (configuration as any).build;
          if (build.id) {
            this.buildId = typeof build.id === 'number' ? build.id : parseInt(build.id, 10);
          }
        }

        // Try data object (common in build extensions)
        if (!this.buildId && (configuration as any).data) {
          const data = (configuration as any).data;
          if (data.buildId) {
            this.buildId = typeof data.buildId === 'number'
              ? data.buildId
              : parseInt(data.buildId as string, 10);
          }
        }
      }

      // Method 2: Try URL parameters (fallback)
      if (!this.buildId) {
        const urlMatch = window.location.href.match(/[?&]buildId=(\d+)/);
        if (urlMatch && urlMatch[1]) {
          this.buildId = parseInt(urlMatch[1], 10);
        }
      }

      // Method 3: Try parent window URL (when loaded in iframe)
      if (!this.buildId && window.parent !== window) {
        try {
          const parentUrl = window.parent.location.href;
          const parentMatch = parentUrl.match(/[?&]buildId=(\d+)/);
          if (parentMatch && parentMatch[1]) {
            this.buildId = parseInt(parentMatch[1], 10);
          }
        } catch (e) {
          // Cross-origin restriction, cannot access parent URL
          console.log("Cannot access parent window URL (cross-origin)");
        }
      }

      console.log("Build ID extracted:", this.buildId);
      console.log("Current iframe URL:", window.location.href);

      if (!this.buildId || isNaN(this.buildId)) {
        throw new Error("Build ID not available. Please open this tab from a build result page.");
      }

      // Initialize UI elements
      this.initializeUIElements();
      console.log("UI elements initialized");

      // Check if extension is enabled
      const isEnabled = await this.settingsService.isExtensionEnabled(this.projectId);
      console.log("Extension enabled:", isEnabled);

      if (!isEnabled) {
        this.showExtensionDisabled();
        return;
      }

      // Load settings to check super analyze availability
      const settings = await this.settingsService.getSettings(this.projectId);
      console.log("Settings loaded:", settings);
      console.log("Super analyze enabled:", settings.superAnalyzeEnabled);
      console.log("Super analyze button element:", this.superAnalyzeButton);
      console.log("Super analyze help element:", this.superAnalyzeHelp);

      // Show super analyze button if enabled
      if (settings.superAnalyzeEnabled) {
        if (this.superAnalyzeButton) {
          console.log("Showing super analyze button");
          this.superAnalyzeButton.style.display = "inline-flex";
        } else {
          console.error("Super analyze button element not found!");
        }

        if (this.superAnalyzeHelp) {
          console.log("Showing super analyze help");
          this.superAnalyzeHelp.style.display = "block";
        } else {
          console.error("Super analyze help element not found!");
        }
      } else {
        console.log("Super analyze not enabled in settings");
        if (this.superAnalyzeButton) {
          this.superAnalyzeButton.style.display = "none";
        }
        if (this.superAnalyzeHelp) {
          this.superAnalyzeHelp.style.display = "none";
        }
      }

      // Check if analysis already exists
      const existingAnalysis = await this.storageService.getAnalysis(this.buildId);
      console.log("Existing analysis:", existingAnalysis ? "Found" : "Not found");

      if (existingAnalysis) {
        // Display existing analysis results
        this.displayResults(existingAnalysis);
      } else {
        // Show controls for new analysis
        this.showControls();
      }

      // Attach event listeners
      this.attachEventListeners();
      console.log("Event listeners attached");

      console.log("=== AI Analyzer Tab Initialization Complete ===");

    } catch (error) {
      console.error("=== Error Initializing Analyzer Tab ===");
      console.error("Error:", error);
      this.showError(
        error instanceof Error
          ? error.message
          : "Failed to initialize AI Analyzer. Please refresh the page."
      );
    }
  }

  /**
   * Register the contribution instance the host uses to decide whether to
   * show the build-results tab. The host calls isInvisible() (dynamic tabs)
   * before rendering the tab header; returning true hides the tab entirely
   * when the extension is disabled for the project.
   */
  private registerTabVisibility(): void {
    try {
      const contributionId = SDK.getContributionId();
      SDK.register(contributionId, {
        // Newer hosts use isInvisible()
        isInvisible: async () => {
          const hidden = !(await this.checkEnabled());
          console.log("Tab isInvisible ->", hidden);
          return hidden;
        },
        // Some hosts use isVisible()
        isVisible: async () => {
          const visible = await this.checkEnabled();
          console.log("Tab isVisible ->", visible);
          return visible;
        },
      });
      console.log("Tab visibility callback registered for:", contributionId);
    } catch (error) {
      console.warn("Could not register tab visibility callback:", error);
    }
  }

  /**
   * Resolve whether the extension is enabled for the current project.
   * Cached-safe: reads settings via the settings service.
   */
  private async checkEnabled(): Promise<boolean> {
    try {
      const projectId = this.projectId || (await this.getProjectId());
      this.projectId = projectId;
      return await this.settingsService.isExtensionEnabled(projectId);
    } catch (error) {
      console.warn("checkEnabled failed, assuming enabled:", error);
      return true;
    }
  }

  /**
   * Detect whether the current theme is dark and toggle the
   * `vss-dark-theme` class on the body accordingly. SDK.applyTheme only
   * injects CSS variables, so the class-based dark styles need this to
   * activate. Without it, dark backgrounds keep light (black) text.
   */
  private applyThemeClass(theme?: { [varName: string]: string }): void {
    const isDark = this.isDarkTheme(theme);
    console.log("isDarkTheme result:", isDark);
    document.body.classList.toggle("vss-dark-theme", isDark);
    if (isDark) {
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.body.removeAttribute("data-theme");
    }
  }

  /**
   * Determine if a theme is dark.
   *
   * The SDK's applyTheme sets `body { color: var(--text-primary-color) }`, so
   * after it runs the body's computed text color equals the theme's primary
   * text color. This is a key-independent signal: bright text means a dark
   * theme, dark text means a light theme. We check the text color first
   * (most reliable), then fall back to the background color.
   */
  private isDarkTheme(theme?: { [varName: string]: string }): boolean {
    const bodyStyle = getComputedStyle(document.body);

    // 1. Primary signal: the body text color set by SDK.applyTheme.
    const textColor = bodyStyle.color;
    const textRgb = this.parseColor(textColor);
    if (textRgb) {
      const textLuminance =
        0.299 * textRgb.r + 0.587 * textRgb.g + 0.114 * textRgb.b;
      console.log("Body text color:", textColor, "luminance:", textLuminance);
      // Bright text => dark theme.
      return textLuminance > 128;
    }

    // 2. Fall back to background color from theme CSS variables / object.
    let bg = "";
    const cssVarNames = [
      "--background-color",
      "--palette-neutral-2",
      "--palette-neutral-0",
    ];
    for (const name of cssVarNames) {
      const value = bodyStyle.getPropertyValue(name).trim();
      if (value) {
        bg = value;
        break;
      }
    }
    if (!bg && theme) {
      bg =
        theme["background-color"] ||
        theme["backgroundColor"] ||
        theme["palette-neutral-2"] ||
        theme["palette-neutral-0"] ||
        "";
    }
    if (!bg) {
      console.log("No color signal detected, defaulting to light theme");
      return false;
    }

    console.log("Detected background color for theme check:", bg);
    const rgb = this.parseColor(bg);
    if (!rgb) {
      console.log("Could not parse background color:", bg);
      return false;
    }
    const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    console.log("Background luminance:", luminance);
    return luminance < 128;
  }

  /**
   * Parse a hex (#rrggbb / #rgb) or "r,g,b" color string.
   */
  private parseColor(
    color: string
  ): { r: number; g: number; b: number } | null {
    let value = color.trim();

    // Strip rgb()/rgba() wrapper, leaving "r, g, b[, a]".
    const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
      value = rgbMatch[1];
    }

    if (value.startsWith("#")) {
      let hex = value.slice(1);
      if (hex.length === 3) {
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      }
      if (hex.length >= 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }
      return null;
    }

    const parts = value.split(",").map((p) => parseInt(p.trim(), 10));
    if (parts.length >= 3 && parts.every((n) => !isNaN(n))) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }

    return null;
  }

  /**
   * Get the current project ID
   */
  private async getProjectId(): Promise<string> {
    const projectService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService
    );
    const project = await projectService.getProject();

    if (!project) {
      throw new Error("Unable to determine current project");
    }

    return project.id;
  }

  /**
   * Initialize references to UI elements
   */
  private initializeUIElements(): void {
    this.controlsSection = document.getElementById("controlsSection");
    this.loadingSection = document.getElementById("loadingSection");
    this.errorSection = document.getElementById("errorSection");
    this.resultsSection = document.getElementById("resultsSection");

    this.analyzeButton = document.getElementById("analyzeButton") as HTMLButtonElement;
    this.superAnalyzeButton = document.getElementById("superAnalyzeButton") as HTMLButtonElement;
    this.retryButton = document.getElementById("retryButton") as HTMLButtonElement;
    this.superAnalyzeHelp = document.getElementById("superAnalyzeHelp");

    this.errorMessage = document.getElementById("errorMessage");
    this.errorTitle = document.querySelector(".error-title");
    this.markdownContent = document.getElementById("markdownContent");
    this.analysisType = document.getElementById("analysisType");
    this.analysisTimestamp = document.getElementById("analysisTimestamp");
  }

  /**
   * Attach event listeners to buttons
   */
  private attachEventListeners(): void {
    if (this.analyzeButton) {
      this.analyzeButton.addEventListener("click", () => this.handleAnalyze());
    }

    if (this.superAnalyzeButton) {
      this.superAnalyzeButton.addEventListener("click", () => this.handleSuperAnalyze());
    }

    if (this.retryButton) {
      this.retryButton.addEventListener("click", () => this.handleRetry());
    }
  }

  /**
   * Handle Analyze button click
   * Performs standard error log analysis
   */
  private async handleAnalyze(): Promise<void> {
    console.log("=== Analyze Button Clicked ===");

    if (!this.projectId || !this.buildId) {
      console.error("Missing projectId or buildId");
      return;
    }

    try {
      this.showLoading();

      // Get settings for AI backend configuration
      const settings = await this.settingsService.getSettings(this.projectId);
      console.log("Settings:", settings);

      if (!settings.aiBackendUrl) {
        throw new Error("AI backend URL not configured. Please update extension settings.");
      }

      console.log("Getting build status...");
      // Get build status to determine which logs to send
      const buildStatus = await this.buildService.getBuildStatus(this.buildId);
      console.log("Build status:", buildStatus);

      let logs: string;
      if (buildStatus === 'failed') {
        console.log("Getting error logs...");
        // Get error logs for failed builds
        logs = await this.buildService.getErrorLogs(this.buildId);
      } else {
        console.log("Getting full logs...");
        // Get full logs for successful builds
        logs = await this.buildService.getBuildLogs(this.buildId);
      }

      console.log("Logs retrieved, length:", logs.length);

      if (!logs || logs.trim().length === 0) {
        throw new Error("No build logs available for analysis");
      }

      console.log("Calling AI service...");
      // Call AI service for analysis
      const analysisMarkdown = await this.aiService.analyze(
        settings.aiBackendUrl,
        logs,
        settings.apiKey
      );

      console.log("Analysis received, length:", analysisMarkdown.length);

      // Create analysis result
      const analysisResult: AnalysisResult = {
        buildId: this.buildId,
        analysisType: 'analyze',
        timestamp: new Date(),
        result: analysisMarkdown
      };

      console.log("Saving analysis result...");
      // Save analysis result
      await this.storageService.saveAnalysis(this.buildId, analysisResult);

      console.log("Displaying results...");
      // Display results
      this.displayResults(analysisResult);

      console.log("=== Analyze Complete ===");

    } catch (error) {
      console.error("=== Error Performing Analysis ===");
      console.error("Error:", error);
      this.showError(
        error instanceof Error
          ? error.message
          : "Analysis failed. Please try again."
      );
    }
  }

  /**
   * Handle Super Analyze button click
   * Performs comprehensive analysis with full logs and repository context
   */
  private async handleSuperAnalyze(): Promise<void> {
    if (!this.projectId || !this.buildId) {
      return;
    }

    try {
      this.showLoading();

      // Get settings for AI backend configuration
      const settings = await this.settingsService.getSettings(this.projectId);

      if (!settings.aiBackendUrl) {
        throw new Error("AI backend URL not configured. Please update extension settings.");
      }

      if (!settings.superAnalyzeEnabled) {
        throw new Error("Super Analyze is not enabled. Please update extension settings.");
      }

      // Get full build logs
      const logs = await this.buildService.getBuildLogs(this.buildId);

      if (!logs || logs.trim().length === 0) {
        throw new Error("No build logs available for analysis");
      }

      // Get repository context
      const repositoryContext = await this.buildService.getRepositoryContext(this.buildId);

      // Call AI service for super analysis
      const analysisMarkdown = await this.aiService.superAnalyze(
        settings.aiBackendUrl,
        logs,
        [repositoryContext],
        settings.apiKey
      );

      // Create analysis result
      const analysisResult: AnalysisResult = {
        buildId: this.buildId,
        analysisType: 'super-analyze',
        timestamp: new Date(),
        result: analysisMarkdown
      };

      // Save analysis result
      await this.storageService.saveAnalysis(this.buildId, analysisResult);

      // Display results
      this.displayResults(analysisResult);

    } catch (error) {
      console.error("Error performing super analysis:", error);
      this.showError(
        error instanceof Error
          ? error.message
          : "Super analysis failed. Please try again."
      );
    }
  }

  /**
   * Handle retry button click
   * Returns to initial state to allow retry
   */
  private handleRetry(): void {
    this.showControls();
  }

  /**
   * Show controls section (initial state with buttons)
   */
  private showControls(): void {
    this.hideAllSections();
    if (this.controlsSection) {
      this.controlsSection.style.display = "block";
    }
  }

  /**
   * Show loading section
   */
  private showLoading(): void {
    this.hideAllSections();
    if (this.loadingSection) {
      this.loadingSection.style.display = "flex";
    }
  }

  /**
   * Show error section with message.
   * @param message - Message text to display
   * @param title - Optional heading (defaults to "Analysis Failed")
   * @param showRetry - Whether to show the Try Again button (default true)
   */
  private showError(
    message: string,
    title: string = "Analysis Failed",
    showRetry: boolean = true
  ): void {
    this.hideAllSections();

    if (this.errorTitle) {
      this.errorTitle.textContent = title;
    }

    if (this.errorMessage) {
      this.errorMessage.textContent = message;
    }

    if (this.retryButton) {
      this.retryButton.style.display = showRetry ? "inline-block" : "none";
    }

    if (this.errorSection) {
      this.errorSection.style.display = "flex";
    }
  }

  /**
   * Display analysis results
   */
  private displayResults(analysis: AnalysisResult): void {
    this.hideAllSections();

    // Render markdown content
    if (this.markdownContent) {
      const renderedHtml = renderMarkdown(analysis.result);
      this.markdownContent.innerHTML = renderedHtml;
    }

    // Set analysis type badge
    if (this.analysisType) {
      const badgeText = analysis.analysisType === 'analyze' ? 'Standard Analysis' : 'Super Analysis';
      this.analysisType.textContent = badgeText;
      this.analysisType.className = `analysis-badge ${analysis.analysisType === 'analyze' ? 'standard' : 'super'}`;
    }

    // Set timestamp
    if (this.analysisTimestamp) {
      const timestamp = new Date(analysis.timestamp);
      this.analysisTimestamp.textContent = this.formatTimestamp(timestamp);
    }

    // Show results section
    if (this.resultsSection) {
      this.resultsSection.style.display = "block";
    }
  }

  /**
   * Show message when extension is disabled
   */
  private showExtensionDisabled(): void {
    this.hideAllSections();

    this.showError(
      "AI Analyzer is currently off. Please contact the administrator.",
      "Analysis is Off",
      false
    );
  }

  /**
   * Hide all sections
   */
  private hideAllSections(): void {
    if (this.controlsSection) {
      this.controlsSection.style.display = "none";
    }
    if (this.loadingSection) {
      this.loadingSection.style.display = "none";
    }
    if (this.errorSection) {
      this.errorSection.style.display = "none";
    }
    if (this.resultsSection) {
      this.resultsSection.style.display = "none";
    }
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return "Just now";
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
  }
}

// Initialize the tab when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const controller = new AnalyzerTabController();
  controller.initialize().catch((error) => {
    console.error("Fatal error initializing analyzer tab:", error);
  });
});
