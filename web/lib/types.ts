export type Route = "standards" | "internal" | "both" | "insights" | "smalltalk" | "out_of_scope";
export type AnswerStatus = "ok" | "not_found" | "refused" | "deflected" | "clarify" | "error";

export interface Candidate {
  id: string;
  doc_id: string;
  doc_title: string;
  doc_short: string | null;
  doc_type: string;
  doc_date: string | null;
  doc_fictional?: boolean;
  content: string;
  page: number | null;
  section: string | null;
  corpus: "standards" | "internal";
  project_id: string | null;
  thread_id: string | null;
  meta: Record<string, unknown>;
  rrf: number;
  vrank: number | null;
  frank: number | null;
}

export interface Evidence extends Candidate {
  n: number;
  relevance: number | null;
}

export interface Source {
  n: number;
  chunkId: string;
  docId: string;
  title: string;
  docType: string;
  date: string | null;
  page: number | null;
  section: string | null;
  threadId: string | null;
  corpus: "standards" | "internal";
  fictional: boolean;
  quote: string;
  passage: string;
}

export interface Claim {
  id: number;
  text: string;
  evidence: number;
  quote: string;
}

export interface Removed {
  text: string;
  reason: string;
}

export interface Answer {
  status: AnswerStatus;
  route: Route | null;
  routeOverridden: boolean;
  markdown: string;
  claims: Claim[];
  sources: Source[];
  removed: Removed[];
  closest: { title: string; docId: string; page: number | null; snippet: string }[];
  notice?: string;
  degraded: boolean;
  data?: unknown;
  runId: string;
  configVersion: string;
}

export interface StatusEvent {
  node: string;
  label: string;
  ms: number;
}
