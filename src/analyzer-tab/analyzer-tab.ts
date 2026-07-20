import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { SettingsService } from "../services/settings-service";
import { StorageService } from "../services/storage-service";
import { BuildService } from "../services/build-service";
import { AIService } from "../services/ai-service";
import { renderMarkdown } from "../utils/markdown-renderer";
import { AnalysisResult } from "../models/analysis";

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
      
      // Initialize Azure DevOps SDK
      await SDK.init();
      await SDK.ready();
      console.log("SDK initialized and ready");

      // Get configuration and apply theme
      const configuration = SDK.getConfiguration();
      SDK.applyTheme(configuration.theme);
      console.log("Theme applied:", configuration.theme);

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
   * Show error section with message
   */
  private showError(message: string): void {
    this.hideAllSections();
    
    if (this.errorMessage) {
      this.errorMessage.textContent = message;
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
      "AI Analyzer is currently off. Please contact the administrator."
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
