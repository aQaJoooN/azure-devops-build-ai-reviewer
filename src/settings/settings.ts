import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { ExtensionSettings } from "../models/settings";
import { SettingsService } from "../services/settings-service";
import "./settings.scss";

/** Project settings page for the AI Analyzer extension. */
class SettingsPage {
  private static readonly TOKEN_MASK = "********";
  private readonly settingsService = new SettingsService();
  private projectId = "";

  private enableExtensionCheckbox!: HTMLInputElement;
  private configurationSection!: HTMLElement;
  private aiServiceUrlInput!: HTMLInputElement;
  private aiServiceTokenInput!: HTMLInputElement;
  private aiServiceTokenConfigured = false;
  private enableSuperAnalyzeCheckbox!: HTMLInputElement;
  private saveButton!: HTMLButtonElement;
  private saveStatus!: HTMLElement;
  private aiServiceUrlError!: HTMLElement;

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.initializeDOMElements();
      await SDK.init({ loaded: false, applyTheme: true });
      await SDK.ready();
      await SDK.notifyLoadSucceeded();
      SDK.applyTheme(SDK.getConfiguration().theme);

      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService
      );
      const project = await projectService.getProject();
      if (!project) {
        throw new Error("Unable to load project context");
      }

      this.projectId = project.id;
      this.setupEventListeners();
      await this.loadSettings();
    } catch (error) {
      console.error("Failed to initialize settings page:", error);
      this.showError("Failed to initialize settings page");
    }
  }
  private initializeDOMElements(): void {
    this.enableExtensionCheckbox = document.getElementById(
      "enableExtension"
    ) as HTMLInputElement;
    this.configurationSection = document.getElementById(
      "configurationOptions"
    ) as HTMLElement;
    this.aiServiceUrlInput = document.getElementById(
      "aiServiceUrl"
    ) as HTMLInputElement;
    this.aiServiceTokenInput = document.getElementById(
      "aiServiceToken"
    ) as HTMLInputElement;
    this.enableSuperAnalyzeCheckbox = document.getElementById(
      "enableSuperAnalyze"
    ) as HTMLInputElement;
    this.saveButton = document.getElementById("saveButton") as HTMLButtonElement;
    this.saveStatus = document.getElementById("saveStatus") as HTMLElement;
    this.aiServiceUrlError = document.getElementById(
      "aiServiceUrlError"
    ) as HTMLElement;
  }

  private setupEventListeners(): void {
    this.enableExtensionCheckbox.addEventListener("change", () =>
      this.toggleConfigurationOptions()
    );
    this.aiServiceUrlInput.addEventListener("input", () => {
      this.aiServiceUrlError.textContent = "";
    });
    this.saveButton.addEventListener("click", () => void this.saveSettings());
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.settingsService.getSettings(this.projectId, false);
    this.enableExtensionCheckbox.checked = settings.enabled;
    this.aiServiceUrlInput.value = settings.aiServiceUrl;
    this.aiServiceTokenConfigured = settings.aiServiceTokenConfigured;
    this.updateTokenField();
    this.enableSuperAnalyzeCheckbox.checked = settings.superAnalyzeEnabled;
    this.toggleConfigurationOptions();
  }

  private updateTokenField(): void {
    this.aiServiceTokenInput.value = this.aiServiceTokenConfigured
      ? SettingsPage.TOKEN_MASK
      : "";
    this.aiServiceTokenInput.placeholder = "Optional bearer token";
  }

  private toggleConfigurationOptions(): void {
    const enabled = this.enableExtensionCheckbox.checked;
    this.configurationSection.style.display = enabled ? "block" : "none";
    if (!enabled) {
      this.aiServiceUrlError.textContent = "";
    }
  }

  private validateForm(): boolean {
    this.aiServiceUrlError.textContent = "";
    this.saveStatus.textContent = "";
    this.saveStatus.className = "status-message";

    if (!this.enableExtensionCheckbox.checked) {
      return true;
    }

    const value = this.aiServiceUrlInput.value.trim();
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error();
      }
    } catch {
      this.aiServiceUrlError.textContent =
        "A valid HTTP or HTTPS AI service URL is required when the extension is enabled";
      this.aiServiceUrlInput.focus();
      return false;
    }
    return true;
  }

  private async saveSettings(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    try {
      this.saveButton.disabled = true;
      this.saveButton.textContent = "Saving...";
      const tokenValue = this.aiServiceTokenInput.value.trim();
      const tokenUnchanged =
        this.aiServiceTokenConfigured && tokenValue === SettingsPage.TOKEN_MASK;
      const tokenUpdate = tokenUnchanged ? undefined : tokenValue || null;
      const settings: ExtensionSettings = {
        enabled: this.enableExtensionCheckbox.checked,
        aiServiceUrl: this.aiServiceUrlInput.value.trim(),
        aiServiceToken: "",
        aiServiceTokenConfigured: tokenUnchanged || !!tokenValue,
        superAnalyzeEnabled: this.enableSuperAnalyzeCheckbox.checked,
      };
      await this.settingsService.saveSettings(
        this.projectId,
        settings,
        tokenUpdate
      );
      this.aiServiceTokenConfigured = settings.aiServiceTokenConfigured;
      this.updateTokenField();
      this.showSuccess("Settings saved successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.showError(`Failed to save settings: ${message}`);
    } finally {
      this.saveButton.disabled = false;
      this.saveButton.textContent = "Save Settings";
    }
  }

  private showSuccess(message: string): void {
    this.saveStatus.textContent = message;
    this.saveStatus.className = "status-message success";
    setTimeout(() => {
      this.saveStatus.textContent = "";
      this.saveStatus.className = "status-message";
    }, 3000);
  }

  private showError(message: string): void {
    if (!this.saveStatus) {
      console.error(message);
      return;
    }
    this.saveStatus.textContent = message;
    this.saveStatus.className = "status-message error";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new SettingsPage());
} else {
  new SettingsPage();
}