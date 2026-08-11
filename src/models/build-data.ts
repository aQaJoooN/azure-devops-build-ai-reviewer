/** Possible Azure DevOps build result/status values. */
export type BuildStatus =
  | "succeeded"
  | "failed"
  | "partiallySucceeded"
  | "canceled"
  | "inProgress"
  | "none";
