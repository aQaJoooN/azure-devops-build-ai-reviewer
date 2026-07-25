/** Possible Azure DevOps build states used by log selection. */
export type BuildStatus =
  | "succeeded"
  | "failed"
  | "partiallySucceeded"
  | "canceled"
  | "inProgress"
  | "none";

/** Log reference attached to a timeline task. */
export interface TimelineLogReference {
  id: number;
  url?: string;
}

/** Relevant fields returned for an Azure DevOps timeline record. */
export interface TimelineRecord {
  id: string;
  name: string;
  type: string;
  result?: string;
  log?: TimelineLogReference;
  issues?: Array<{
    type: string;
    message: string;
  }>;
}

/** Azure DevOps build timeline response. */
export interface TimelineResponse {
  records: TimelineRecord[];
}
