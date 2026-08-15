/** Persisted result of an AI analysis for a build. */
export interface AnalysisResult {
  buildId: number;
  analysisType: "analyze" | "super-analyze";
  timestamp: Date;
  result: string;
}

/** Request payload sent to the BFF AI endpoint. */
export interface ChatRequest {
  message: string;
  data: string;
  role: "user";
  type: "normal" | "super";
}

/** Response from the BFF AI endpoint. */
export interface AIResponse {
  answer: string;
  request_id?: string;
}
