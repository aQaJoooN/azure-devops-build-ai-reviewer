import { computeClientSignature } from "../utils/client-signature";

describe("computeClientSignature", () => {
  it("produces the correct hash for the API URL format", () => {
    const url =
      "https://stageazure.asax.ir/tfs/AsaProjects/bc24cb70-e692-4049-ae06-d776b7bf4b81/_apis/build/builds/1116251";
    expect(computeClientSignature(url)).toBe("3ed106d8182ba132e7ba5998a5ab1ef3");
  });

  it("produces the same hash for the equivalent UI URL format", () => {
    const url =
      "https://stageazure.asax.ir/tfs/AsaProjects/bc24cb70-e692-4049-ae06-d776b7bf4b81/_build/results?buildId=1116251";
    expect(computeClientSignature(url)).toBe("3ed106d8182ba132e7ba5998a5ab1ef3");
  });

  it("throws when the URL has no recognizable Azure DevOps path marker", () => {
    expect(() =>
      computeClientSignature("https://example.com/some/random/path")
    ).toThrow("URL is not a recognized Azure DevOps build URL");
  });

  it("throws when the API URL is missing the builds segment run ID", () => {
    expect(() =>
      computeClientSignature(
        "https://stageazure.asax.ir/tfs/AsaProjects/proj/_apis/build/builds"
      )
    ).toThrow("Cannot extract run ID from API URL");
  });

  it("throws when the UI URL is missing the buildId query parameter", () => {
    expect(() =>
      computeClientSignature(
        "https://stageazure.asax.ir/tfs/AsaProjects/proj/_build/results"
      )
    ).toThrow("Missing buildId query parameter in URL");
  });
});
