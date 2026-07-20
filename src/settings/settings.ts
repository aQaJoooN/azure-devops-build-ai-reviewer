import * as SDK from "azure-devops-extension-sdk";
import { IProjectPageService, CommonServiceIds } from "azure-devops-extension-api";
import { SettingsService } from "../services/settings-service";
import { ExtensionSettings } from "../models/settings";
import "./settings.scss";

/**
 * Settings page logic for the AI Analyzer extension
 * Handles loading, validation, and saving of project-level configuration
 */
class SettingsPage {
  private settingsService: SettingsService;
  private projectId: string = "";

  // DOM elements
  private enableExtensionCheckbox!: HTMLInputElement;
  private configurationSection!: HTMLElement;
  private aiBackendUrlInput!: HTMLInputElement;
  private apiKeyInput!: HTMLInputElement;
  private enableSuperAnalyzeCheckbox!: HTMLInputElement;
  private saveButton!: HTMLButtonElement;
  private saveStatus!: HTMLElement;
  private urlError!: HTMLElement;

  constructor() {
    this.settingsService = new SettingsService();
    this.initialize();
  }

  /**
   * Initialize the settings page
   * Sets up SDK, loads project context, and initializes UI
   */
  private async initialize(): Promise<void> {
    try {
      console.log("=== Initializing Settings Page ===");
      
      // Initialize Azure DevOps Extension SDK
      await SDK.init();
      console.log("SDK initialized");

      await SDK.ready();
      console.log("SDK ready");

      // Apply theme
      SDK.applyTheme(SDK.getConfiguration().theme);
      console.log("Theme applied");

      // Get the current project context
      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService
      );
      console.log("Project service obtained");
      
      const project = await projectService.getProject();
      console.log("Project obtained:", project ? project.name : "null");

      if (!project) {
        this.showError("Unable to load project context");
        return;
      }

      this.projectId = project.id;
      console.log("Project ID:", this.projectId);

      // Initialize DOM elements
      this.initializeDOMElements();
      console.log("DOM elements initialized");

      // Set up event listeners
      this.setupEventListeners();
      console.log("Event listeners set up");

      // Load current settings
      await this.loadSettings();
      console.log("Settings loaded");

      // Notify Azure DevOps that the page is ready
      await SDK.notifyLoadSucceeded();
      console.log("=== Settings Page Initialization Complete ===");
    } catch (error) {
      console.error("=== Error Initializing Settings Page ===");
      console.error("Error:", error);
      this.showError("Failed to initialize settings page");
      await SDK.notifyLoadFailed(error as Error);
    }
  }

  /**
   * Initialize DOM element references
   */
  private initializeDOMElements(): void {
    this.enableExtensionCheckbox = document.getElementById(
      "enableExtension"
    ) as HTMLInputElement;
    this.configurationSection = document.getElementById(
      "configurationOptions"
    ) as HTMLElement;
    this.aiBackendUrlInput = document.getElementById(
      "aiBackendUrl"
    ) as HTMLInputElement;
    this.apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
    this.enableSuperAnalyzeCheckbox = document.getElementById(
      "enableSuperAnalyze"
    ) as HTMLInputElement;
    this.saveButton = document.getElementById("saveButton") as HTMLButtonElement;
    this.saveStatus = document.getElementById("saveStatus") as HTMLElement;
    this.urlError = document.getElementById("urlError") as HTMLElement;
  }

  /**
   * Set up event listeners for form controls
   */
  private setupEventListeners(): void {
    // Toggle configuration options visibility based on extension enabled state
    this.enableExtensionCheckbox.addEventListener("change", () => {
      this.toggleConfigurationOptions();
    });

    // Clear error messages when user types
    this.aiBackendUrlInput.addEventListener("input", () => {
      this.urlError.textContent = "";
    });

    // Save button click handler
    this.saveButton.addEventListener("click", () => {
      this.saveSettings();
    });
  }

  /**
   * Load current settings from storage and populate form
   */
  private async loadSettings(): Promise<void> {
    try {
      const settings = await this.settingsService.getSettings(this.projectId);

      // Populate form fields
      this.enableExtensionCheckbox.checked = settings.enabled;
      this.aiBackendUrlInput.value = settings.aiBackendUrl || "";
      this.apiKeyInput.value = settings.apiKey || "";
      this.enableSuperAnalyzeCheckbox.checked = settings.superAnalyzeEnabled;

      // Update UI based on enabled state
      this.toggleConfigurationOptions();
    } catch (error) {
      console.error("Error loading settings:", error);
      this.showError("Failed to load settings");
    }
  }

  /**
   * Toggle visibility of configuration options based on extension enabled state
   */
  private toggleConfigurationOptions(): void {
    const isEnabled = this.enableExtensionCheckbox.checked;
    
    if (isEnabled) {
      this.configurationSection.style.display = "block";
    } else {
      this.configurationSection.style.display = "none";
      // Clear error messages when hiding
      this.urlError.textContent = "";
    }
  }

  /**
   * Validate form inputs
   * @returns true if validation passes, false otherwise
   */
  private validateForm(): boolean {
    // Clear previous error messages
    this.urlError.textContent = "";
    this.saveStatus.textContent = "";
    this.saveStatus.className = "status-message";

    const isEnabled = this.enableExtensionCheckbox.checked;

    // If extension is disabled, no validation needed
    if (!isEnabled) {
      return true;
    }

    // Validate AI Backend URL is provided
    const aiBackendUrl = this.aiBackendUrlInput.value.trim();
    if (!aiBackendUrl) {
      this.urlError.textContent = "AI Backend URL is required when extension is enabled";
      this.aiBackendUrlInput.focus();
      return false;
    }

    // Validate URL format
    try {
      new URL(aiBackendUrl);
    } catch {
      this.urlError.textContent = "Please enter a valid URL (e.g., https://example.com)";
      this.aiBackendUrlInput.focus();
      return false;
    }

    return true;
  }

  /**
   * Save settings to storage
   */
  private async saveSettings(): Promise<void> {
    // Validate form
    if (!this.validateForm()) {
      return;
    }

    try {
      // Disable save button during save operation
      this.saveButton.disabled = true;
      this.saveButton.textContent = "Saving...";
      this.saveStatus.textContent = "";

      // Build settings object
      const settings: ExtensionSettings = {
        enabled: this.enableExtensionCheckbox.checked,
        aiBackendUrl: this.aiBackendUrlInput.value.trim(),
        apiKey: this.apiKeyInput.value.trim() || undefined,
        superAnalyzeEnabled: this.enableSuperAnalyzeCheckbox.checked,
      };

      console.log("=== Settings Page - Save Attempt ===");
      console.log("Attempting to save settings...");

      // Save settings
      await this.settingsService.saveSettings(this.projectId, settings);

      console.log("Settings saved via service successfully");

      // Show success message
      this.showSuccess("Settings saved successfully");
    } catch (error) {
      console.error("=== Settings Page - Save Error ===");
      console.error("Error in saveSettings():", error);
      
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      this.showError(`Failed to save settings: ${errorMessage}`);
    } finally {
      // Re-enable save button
      this.saveButton.disabled = false;
      this.saveButton.textContent = "Save Settings";
    }
  }

  /**
   * Display success message
   * @param message - Success message to display
   */
  private showSuccess(message: string): void {
    this.saveStatus.textContent = message;
    this.saveStatus.className = "status-message success";

    // Clear message after 3 seconds
    setTimeout(() => {
      this.saveStatus.textContent = "";
      this.saveStatus.className = "status-message";
    }, 3000);
  }

  /**
   * Display error message
   * @param message - Error message to display
   */
  private showError(message: string): void {
    this.saveStatus.textContent = message;
    this.saveStatus.className = "status-message error";
  }
}

// Initialize settings page when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new SettingsPage();
  });
} else {
  new SettingsPage();
}
