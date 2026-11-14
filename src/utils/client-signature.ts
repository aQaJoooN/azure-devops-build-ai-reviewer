import md5 from "blueimp-md5";

/**
 * Computes the client_signature required by the BFF /api/v1/analyze endpoint.
 *
 * The signature is the MD5 hash of the string:
 *   "{azureHost}|{projectId}|{runId}"
 *
 * Example:
 *   Input URL : "https://stageazure.asax.ir/tfs/AsaProjects/bc24cb70-e692-4049-ae06-d776b7bf4b81/_apis/build/builds/1116251"
 *   azureHost : "stageazure.asax.ir"
 *   projectId : "bc24cb70-e692-4049-ae06-d776b7bf4b81"
 *   runId     : "1116251"
 *   payload   : "stageazure.asax.ir|bc24cb70-e692-4049-ae06-d776b7bf4b81|1116251"
 *   signature : "3ed106d8182ba132e7ba5998a5ab1ef3"
 *
 * Both URL formats are supported:
 *   API format: https://host/tfs/Collection/{project}/_apis/build/builds/{runId}
 *   UI  format: https://host/tfs/Collection/{project}/_build/results?buildId={runId}
 *
 * @param buildUrl - The full Azure DevOps build URL.
 * @returns 32-character lowercase MD5 hex string.
 * @throws Error if the URL is not a recognizable Azure DevOps build URL.
 */
export function computeClientSignature(buildUrl: string): string {
  const url = new URL(buildUrl);

  // Part 1: Azure host — hostname only, no protocol, no port, no slash, lowercase
  const azureHost = url.hostname.toLowerCase();

  // Part 2: Project ID and Run ID — extracted from the URL path
  const pathSegments = url.pathname
    .split("/")
    .filter((segment) => segment.length > 0);

  let projectId: string;
  let runId: string;

  const apisIndex = pathSegments.indexOf("_apis");

  if (apisIndex !== -1) {
    // API format: …/{project}/_apis/build/builds/{runId}
    projectId = pathSegments[apisIndex - 1];
    const buildsIndex = pathSegments.indexOf("builds", apisIndex);
    if (buildsIndex === -1 || buildsIndex + 1 >= pathSegments.length) {
      throw new Error(`Cannot extract run ID from API URL: ${buildUrl}`);
    }
    runId = pathSegments[buildsIndex + 1];
  } else {
    // UI format: …/{project}/_build/results?buildId={runId}
    const buildIndex = pathSegments.indexOf("_build");
    if (buildIndex === -1) {
      throw new Error(
        `URL is not a recognized Azure DevOps build URL: ${buildUrl}`
      );
    }
    projectId = pathSegments[buildIndex - 1];
    runId = url.searchParams.get("buildId") ?? "";
    if (!runId) {
      throw new Error(`Missing buildId query parameter in URL: ${buildUrl}`);
    }
  }

  // Part 3: Build the payload and compute MD5
  const payload = `${azureHost}|${projectId}|${runId}`;
  return md5(payload); // blueimp-md5 returns lowercase hex by default
}
