import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { ExtensionSettings } from "../models/settings";
import { SettingsService } from "../services/settings-service";
import "./settings.scss";

/** Project settings page for the AI Analyzer extension. */
class SettingsPage {
  private readonly settingsService = new SettingsService();
  private projectId = "";

  private enableExtensionCheckbox!: HTMLInputElement;
  private configurationSection!: HTMLElement;
  private serviceConnectionNameInput!: HTMLInputElement;
  private enableSuperAnalyzeCheckbox!: HTMLInputElement;
  private saveButton!: HTMLButtonElement;
  private saveStatus!: HTMLElement;
  private serviceConnectionError!: HTMLElement;

  constructor() {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.initializeDOMElements();

      // Acknowledge the host immediately after the SDK handshake. Project and
      // settings requests continue afterward without blocking page loading.
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
      await SDK.notifyLoadSucceeded();
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
    this.serviceConnectionNameInput = document.getElementById(
      "serviceConnectionName"
    ) as HTMLInputElement;
    this.enableSuperAnalyzeCheckbox = document.getElementById(
      "enableSuperAnalyze"
    ) as HTMLInputElement;
    this.saveButton = document.getElementById("saveButton") as HTMLButtonElement;
    this.saveStatus = document.getElementById("saveStatus") as HTMLElement;
    this.serviceConnectionError = document.getElementById(
      "serviceConnectionError"
    ) as HTMLElement;
  }

  private setupEventListeners(): void {
    this.enableExtensionCheckbox.addEventListener("change", () =>
      this.toggleConfigurationOptions()
    );
    this.serviceConnectionNameInput.addEventListener("input", () => {
      this.serviceConnectionError.textContent = "";
    });
    this.saveButton.addEventListener("click", () => void this.saveSettings());
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.settingsService.getSettings(this.projectId);
    this.enableExtensionCheckbox.checked = settings.enabled;
    this.serviceConnectionNameInput.value = settings.serviceConnectionName;
    this.enableSuperAnalyzeCheckbox.checked = settings.superAnalyzeEnabled;
    this.toggleConfigurationOptions();
  }

  private toggleConfigurationOptions(): void {
    const enabled = this.enableExtensionCheckbox.checked;
    this.configurationSection.style.display = enabled ? "block" : "none";
    if (!enabled) {
      this.serviceConnectionError.textContent = "";
    }
  }

  private validateForm(): boolean {
    this.serviceConnectionError.textContent = "";
    this.saveStatus.textContent = "";
    this.saveStatus.className = "status-message";

    if (
      this.enableExtensionCheckbox.checked &&
      !this.serviceConnectionNameInput.value.trim()
    ) {
      this.serviceConnectionError.textContent =
        "Generic service connection name is required when the extension is enabled";
      this.serviceConnectionNameInput.focus();
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

      const settings: ExtensionSettings = {
        enabled: this.enableExtensionCheckbox.checked,
        serviceConnectionName: this.serviceConnectionNameInput.value.trim(),
        superAnalyzeEnabled: this.enableSuperAnalyzeCheckbox.checked,
      };

      await this.settingsService.saveSettings(this.projectId, settings);
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
