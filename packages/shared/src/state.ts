import type { ProjectStatus, StageName } from "./schemas/project";

/**
 * Project state machine (Module 26: project state transitions).
 * ERROR is reachable from anywhere; a project can be re-run from ERROR or COMPLETE.
 */
const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  UPLOADED: ["ANALYZING", "READY_FOR_SCRIPT", "ERROR"],
  ANALYZING: ["ANALYZING", "NEEDS_REVIEW", "READY_FOR_SCRIPT", "ERROR"],
  NEEDS_REVIEW: ["NEEDS_REVIEW", "READY_FOR_SCRIPT", "ANALYZING", "ERROR"],
  READY_FOR_SCRIPT: ["READY_FOR_SCRIPT", "GENERATING_VOICE", "NEEDS_REVIEW", "ANALYZING", "ERROR"],
  GENERATING_VOICE: ["READY_TO_RENDER", "READY_FOR_SCRIPT", "ERROR"],
  READY_TO_RENDER: ["RENDERING", "READY_FOR_SCRIPT", "GENERATING_VOICE", "NEEDS_REVIEW", "ANALYZING", "ERROR"],
  RENDERING: ["COMPLETE", "READY_TO_RENDER", "ERROR"],
  COMPLETE: ["ANALYZING", "NEEDS_REVIEW", "READY_FOR_SCRIPT", "GENERATING_VOICE", "READY_TO_RENDER", "RENDERING", "COMPLETE", "ERROR"],
  ERROR: ["ANALYZING", "NEEDS_REVIEW", "READY_FOR_SCRIPT", "GENERATING_VOICE", "READY_TO_RENDER", "RENDERING", "ERROR"],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ProjectStatus,
    public readonly to: ProjectStatus,
  ) {
    super(`Invalid project status transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Status a project should be in while a given stage runs. */
export function statusForStage(stage: StageName): ProjectStatus {
  switch (stage) {
    case "ingest":
    case "transcribe":
    case "analyze_frames":
    case "detect_actions":
    case "extract_tutorial":
      return "ANALYZING";
    case "reconstruct_screens":
    case "write_script":
      return "READY_FOR_SCRIPT";
    case "voice":
    case "subtitles":
      return "GENERATING_VOICE";
    case "plan_render":
    case "guide":
    case "seo":
      return "READY_TO_RENDER";
    case "render":
      return "RENDERING";
  }
}
