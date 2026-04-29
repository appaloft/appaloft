export type ErrorKnowledgeResponsibility = "user" | "operator" | "system" | "provider" | "appaloft";

export type ErrorKnowledgeActionability =
  | "fix-input"
  | "wait-retry"
  | "run-diagnostic"
  | "auto-recoverable"
  | "report-bug"
  | "no-user-action";

export type ErrorKnowledgeLinkRel =
  | "human-doc"
  | "llm-guide"
  | "runbook"
  | "spec"
  | "source-symbol"
  | "support";

export interface ErrorKnowledgeLink {
  readonly rel: ErrorKnowledgeLinkRel;
  readonly href: string;
  readonly mediaType?: string;
  readonly title?: string;
}

export type ErrorKnowledgeRemedyKind =
  | "retry"
  | "command"
  | "workflow-action"
  | "diagnostic"
  | "none";

export interface ErrorKnowledgeRemedy {
  readonly kind: ErrorKnowledgeRemedyKind;
  readonly label: string;
  readonly safeByDefault: boolean;
  readonly command?: readonly string[];
}

export interface ErrorKnowledge {
  readonly responsibility: ErrorKnowledgeResponsibility;
  readonly actionability: ErrorKnowledgeActionability;
  readonly operation?: string;
  readonly links?: readonly ErrorKnowledgeLink[];
  readonly remedies?: readonly ErrorKnowledgeRemedy[];
}

export interface ErrorKnowledgeLookupInput {
  readonly code: string;
  readonly phase?: string;
}

export function errorKnowledgeKey(input: ErrorKnowledgeLookupInput): string {
  return input.phase ? `${input.code}.${input.phase}` : input.code;
}
