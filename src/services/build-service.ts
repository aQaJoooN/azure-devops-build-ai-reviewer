import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService, getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { BuildStatus } from "../models/build-data";
import { RepositoryContext, FileInfo } from "../models/analysis";

/**
 * Service for retrieving build logs and repository information from Azure DevOps
 * Uses Azure DevOps REST APIs for data access
 */
export class BuildService {
  private projectId: string | null = null;

  /**
   * Initialize the build REST client
   * @private
   */
  private async getBuildClient(): Promise<BuildRestClient> {
    await SDK.ready();
    return getClient(BuildRestClient);
  }

  /**
   * Initialize the git REST client
   * @private
   */
  private async getGitClient(): Promise<GitRestClient> {
    await SDK.ready();
    return getClient(GitRestClient);
  }

  /**
   * Get the current project ID
   * @private
   */
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
      this.projectId = project.id;
    }
    return this.projectId;
  }

  /**
   * Get full build logs for a specific build using direct API call
   * @param buildId - The build ID
   * @returns Promise resolving to concatenated log content
   */
  async getBuildLogs(buildId: number): Promise<string> {
    try {
      console.log(`Getting build logs for build ${buildId}`);
      
      const projectId = await this.getProjectId();
      console.log("Project ID:", projectId);

      // Get access token for authentication
      const accessToken = await SDK.getAccessToken();
      console.log("Access token obtained");

      // Get host URL - using window.location as fallback
      const host = SDK.getHost();
      const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
      console.log("Base URL:", baseUrl);

      // Construct API URL - TFS format
      const apiUrl = `${baseUrl}/tfs/${host.name}/${projectId}/_apis/build/builds/${buildId}/logs?api-version=5.0`;
      console.log("API URL:", apiUrl);

      // Fetch log references using direct HTTP
      console.log("Fetching build log references...");
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const logData = await response.json();
      console.log(`Found ${logData.count || 0} log files`);

      if (!logData.value || logData.value.length === 0) {
        console.warn("No logs found for this build");
        return "";
      }

      // Fetch and concatenate all log content
      const logContents: string[] = [];
      for (const log of logData.value) {
        if (log.id) {
          try {
            console.log(`Fetching log ${log.id}...`);
            const logUrl = `${baseUrl}/tfs/${host.name}/${projectId}/_apis/build/builds/${buildId}/logs/${log.id}?api-version=5.0`;
            
            const logResponse = await fetch(logUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'text/plain'
              }
            });

            if (logResponse.ok) {
              const logText = await logResponse.text();
              console.log(`Log ${log.id}: ${logText.length} characters`);
              logContents.push(logText);
            } else {
              console.warn(`Failed to fetch log ${log.id}: ${logResponse.status}`);
            }
          } catch (error) {
            console.warn(`Failed to fetch log ${log.id}:`, error);
          }
        }
      }

      console.log(`Total log content length: ${logContents.join("\n").length} characters`);
      return logContents.join("\n");
    } catch (error) {
      console.error(`Error retrieving build logs for build ${buildId}:`, error);
      console.error("Error type:", typeof error);
      console.error("Error details:", error);
      throw new Error("Failed to retrieve build logs");
    }
  }

  /**
   * Get error logs for a specific build
   * Filters logs to include only lines containing error keywords
   * @param buildId - The build ID
   * @returns Promise resolving to filtered error log content
   */
  async getErrorLogs(buildId: number): Promise<string> {
    try {
      // Get full logs first
      const fullLogs = await this.getBuildLogs(buildId);
      
      if (!fullLogs) {
        return "";
      }

      // Filter for error lines
      const errorKeywords = ['error', 'fail', 'failed', 'failure', 'exception', 'fatal'];
      const lines = fullLogs.split("\n");
      const errorLines: string[] = [];

      for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (errorKeywords.some(keyword => lowerLine.includes(keyword))) {
          errorLines.push(line);
        }
      }

      // If no error lines found, return last 5000 lines as fallback
      if (errorLines.length === 0) {
        const lastLines = lines.slice(-5000);
        return lastLines.join("\n");
      }

      return errorLines.join("\n");
    } catch (error) {
      console.error(`Error retrieving error logs for build ${buildId}:`, error);
      throw new Error("Failed to retrieve error logs");
    }
  }

  /**
   * Get build status for a specific build using direct API call
   * @param buildId - The build ID
   * @returns Promise resolving to build status string
   */
  async getBuildStatus(buildId: number): Promise<BuildStatus> {
    try {
      console.log(`Attempting to get build status for build ${buildId}`);
      
      const projectId = await this.getProjectId();
      console.log("Project ID obtained:", projectId);

      // Get access token for authentication
      const accessToken = await SDK.getAccessToken();
      console.log("Access token obtained");

      // Get host URL - using window.location as fallback
      const host = SDK.getHost();
      const baseUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
      console.log("Base URL:", baseUrl);

      // Construct API URL - TFS format
      const apiUrl = `${baseUrl}/tfs/${host.name}/${projectId}/_apis/build/builds/${buildId}?api-version=5.0`;
      console.log("API URL:", apiUrl);

      // Fetch build details using direct HTTP
      console.log("Fetching build details...");
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const build = await response.json();
      console.log("Build object retrieved:", build);
      
      if (!build) {
        throw new Error(`Build ${buildId} not found`);
      }

      // Map result to our BuildStatus type
      if (build.result) {
        const result = build.result.toLowerCase();
        if (result.includes('succeed')) return 'succeeded';
        if (result.includes('fail')) return 'failed';
        if (result.includes('partial')) return 'partiallySucceeded';
        if (result.includes('cancel')) return 'canceled';
      }
      
      if (build.status) {
        const status = build.status.toLowerCase();
        if (status.includes('inprogress') || status.includes('notstarted')) {
          return 'inProgress';
        }
      }

      return 'none';
    } catch (error) {
      console.error(`Error retrieving build status for build ${buildId}:`, error);
      console.error("Error details:", error);
      // Return 'failed' as default assumption - this will get error logs
      console.log("Defaulting to 'failed' status due to error");
      return 'failed';
    }
  }

  /**
   * Get repository context for super analyze
   * Includes repository information and relevant source files
   * @param buildId - The build ID
   * @returns Promise resolving to repository context
   */
  async getRepositoryContext(buildId: number): Promise<RepositoryContext> {
    try {
      const buildClient = await this.getBuildClient();
      const projectId = await this.getProjectId();

      // Get build information
      const build = await buildClient.getBuild(projectId, buildId);
      
      if (!build || !build.repository) {
        throw new Error(`Build ${buildId} or repository information not found`);
      }

      const repositoryId = build.repository.id || "";
      const repositoryName = build.repository.name || "";
      const branch = build.sourceBranch || "";
      const commit = build.sourceVersion || "";

      // Get files from the repository
      const files = await this.getRelevantFiles(
        projectId,
        repositoryId,
        commit
      );

      return {
        repositoryId,
        repositoryName,
        branch,
        commit,
        files
      };
    } catch (error) {
      console.error(`Error retrieving repository context for build ${buildId}:`, error);
      throw new Error("Failed to retrieve repository context");
    }
  }

  /**
   * Get relevant files from repository for super analyze
   * Includes build definition files and key configuration files
   * @param projectId - The project ID
   * @param repositoryId - The repository ID
   * @param commitSha - The commit SHA
   * @returns Promise resolving to array of FileInfo
   * @private
   */
  private async getRelevantFiles(
    projectId: string,
    repositoryId: string,
    commitSha: string
  ): Promise<FileInfo[]> {
    try {
      const gitClient = await this.getGitClient();
      const files: FileInfo[] = [];

      // Key configuration file patterns to include
      const relevantPatterns = [
        /^azure-pipelines\.ya?ml$/i,
        /^\.azure-pipelines\/.*\.ya?ml$/i,
        /^Dockerfile$/i,
        /^docker-compose\.ya?ml$/i,
        /^package\.json$/i,
        /^requirements\.txt$/i,
        /^pom\.xml$/i,
        /^build\.gradle$/i,
        /^\.gitignore$/i,
        /^\.env\.example$/i
      ];

      // Get commit details to find changed files
      let changedFiles: string[] = [];
      try {
        const commit = await gitClient.getCommit(commitSha, repositoryId, projectId);
        if (commit && commit.changes) {
          changedFiles = commit.changes
            .filter(change => change.item?.path)
            .map(change => change.item!.path!);
        }
      } catch (error) {
        console.warn("Could not retrieve commit changes:", error);
      }

      // Get tree items at commit
      const tree = await gitClient.getTree(
        repositoryId,
        commitSha,
        projectId,
        undefined,
        true // recursive
      );

      if (!tree || !tree.treeEntries) {
        return files;
      }

      // Limit total size to prevent overwhelming the AI backend
      let totalSize = 0;
      const maxTotalSize = 2 * 1024 * 1024; // 2MB limit

      for (const entry of tree.treeEntries) {
        if (totalSize >= maxTotalSize) {
          break;
        }

        // Skip if not a blob (file)
        if (entry.gitObjectType !== 3) { // 3 = Blob
          continue;
        }

        const path = entry.relativePath || "";
        
        // Check if file matches relevant patterns or is in changed files
        const isRelevant = relevantPatterns.some(pattern => pattern.test(path)) ||
                          changedFiles.includes("/" + path);

        if (!isRelevant) {
          continue;
        }

        // Skip binary files and large files
        if (this.isBinaryFile(path) || (entry.size && entry.size > 100000)) {
          files.push({ path });
          continue;
        }

        // Fetch file content
        try {
          const item = await gitClient.getItem(
            repositoryId,
            path,
            projectId,
            undefined,
            undefined,
            true, // includeContent
            false,
            undefined,
            { versionType: 0, version: commitSha, versionOptions: 0 } // GitVersionType.Commit = 0
          );

          if (item && item.content) {
            const contentSize = item.content.length;
            if (totalSize + contentSize <= maxTotalSize) {
              files.push({
                path,
                content: item.content
              });
              totalSize += contentSize;
            } else {
              // Include path only if content would exceed limit
              files.push({ path });
            }
          }
        } catch (error) {
          console.warn(`Could not fetch content for ${path}:`, error);
          files.push({ path });
        }
      }

      return files;
    } catch (error) {
      console.error("Error retrieving relevant files:", error);
      return [];
    }
  }

  /**
   * Check if a file is likely binary based on extension
   * @param path - File path
   * @returns True if file is likely binary
   * @private
   */
  private isBinaryFile(path: string): boolean {
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.bin', '.dat', '.db', '.sqlite',
      '.woff', '.woff2', '.ttf', '.eot',
      '.mp3', '.mp4', '.avi', '.mov',
      '.jar', '.war', '.ear'
    ];

    const lowerPath = path.toLowerCase();
    return binaryExtensions.some(ext => lowerPath.endsWith(ext));
  }
}
