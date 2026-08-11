import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { BuildStatus } from "../models/build-data";

/** Retrieves build metadata from Azure DevOps. */
export class BuildService {
  private projectId: string | null = null;

  private async getProjectId(): Promise<string> {
    if (!this.projectId) {
      await SDK.ready();
      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService
      );
      const project = await projectService.getProject();
      if (!project) {
        throw new Error("Unable to determine current project");
      }
      this.projectId = project.id ?? "";
    }
    return this.projectId as string;
  }

  /** Returns the result/status of a build. */
  async getBuildStatus(buildId: number): Promise<BuildStatus> {
    try {
      const projectId = await this.getProjectId();
      const host = SDK.getHost();
      const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ":" + window.location.port : ""}`;
      const apiUrl = `${baseUrl}/tfs/${host.name}/${projectId}/_apis/build/builds/${buildId}?api-version=5.0`;

      const response = await fetch(apiUrl, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const build = await response.json();
      if (!build) {
        throw new Error(`Build ${buildId} not found`);
      }

      if (build.result) {
        const result = build.result.toLowerCase();
        if (result.includes("succeed")) return "succeeded";
        if (result.includes("fail")) return "failed";
        if (result.includes("partial")) return "partiallySucceeded";
        if (result.includes("cancel")) return "canceled";
      }

      if (build.status) {
        const status = build.status.toLowerCase();
        if (status.includes("inprogress") || status.includes("notstarted")) {
          return "inProgress";
        }
      }

      return "none";
    } catch (error) {
      console.error(`Error retrieving build status for build ${buildId}:`, error);
      return "failed";
    }
  }
}
