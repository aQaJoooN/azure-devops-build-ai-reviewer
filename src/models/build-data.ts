/**
 * Build status type
 * Represents the possible states of a build run
 */
export type BuildStatus = 'succeeded' | 'failed' | 'partiallySucceeded' | 'canceled' | 'inProgress' | 'none';

/**
 * Build data interface
 * Contains information about a specific build run
 */
export interface BuildData {
  /**
   * Unique identifier of the build
   */
  id: number;

  /**
   * Build number (user-friendly identifier)
   */
  buildNumber: string;

  /**
   * Current status of the build
   */
  status: BuildStatus;

  /**
   * Result of the build (if completed)
   */
  result?: string;

  /**
   * ID of the repository that was built
   */
  repositoryId?: string;

  /**
   * Name of the repository that was built
   */
  repositoryName?: string;

  /**
   * Branch that was built
   */
  sourceBranch?: string;

  /**
   * Commit SHA that was built
   */
  sourceVersion?: string;
}
