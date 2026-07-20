export const REVIEW_PROMPT_SESSION_THRESHOLD = 5;

export interface ReviewPromptState {
  eligibleSessions: number;
  prompted: boolean;
}

export interface ReviewPromptDecision {
  shouldPrompt: boolean;
  state: ReviewPromptState;
}

/** Record one successfully rendered preview session and decide whether to show the one-time prompt. */
export function recordEligibleReviewSession(value: unknown): ReviewPromptDecision {
  const previous = normalizeReviewPromptState(value);
  if (previous.prompted) {
    return { shouldPrompt: false, state: previous };
  }
  const eligibleSessions = Math.min(
    REVIEW_PROMPT_SESSION_THRESHOLD,
    previous.eligibleSessions + 1,
  );
  const shouldPrompt = eligibleSessions >= REVIEW_PROMPT_SESSION_THRESHOLD;
  return {
    shouldPrompt,
    state: {
      eligibleSessions,
      prompted: shouldPrompt,
    },
  };
}

export function normalizeReviewPromptState(value: unknown): ReviewPromptState {
  if (!isRecord(value)) {
    return { eligibleSessions: 0, prompted: false };
  }
  const eligibleSessions = typeof value.eligibleSessions === 'number'
    && Number.isFinite(value.eligibleSessions)
    ? Math.max(0, Math.min(REVIEW_PROMPT_SESSION_THRESHOLD, Math.trunc(value.eligibleSessions)))
    : 0;
  return {
    eligibleSessions,
    prompted: value.prompted === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
