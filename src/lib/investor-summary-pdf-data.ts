/**
 * Payload for the investor summary PDF. Built in the export-summary API route.
 */
export type InvestorSummaryPDFData = {
  generatedAt: string; // ISO string
  atAGlance: string | null;
  teamCount: number;
  phaseSummary: string | null;
  lastUpdated: string | null;
  areas: { name: string; progress: number; status?: string; phase?: string }[];
  recentTasks: { name: string; status: string; assignee?: string; due?: string }[];
  updates: string[];
  blocked: number;
  overdueCount: number;
};
