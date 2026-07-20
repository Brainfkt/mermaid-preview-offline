import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeReviewPromptState,
  recordEligibleReviewSession,
  REVIEW_PROMPT_SESSION_THRESHOLD,
} from '../src/reviewPrompt';

void test('the Marketplace review prompt appears once after five successful preview sessions', () => {
  let state: unknown;
  for (let index = 1; index <= REVIEW_PROMPT_SESSION_THRESHOLD; index += 1) {
    const decision = recordEligibleReviewSession(state);
    assert.equal(decision.shouldPrompt, index === REVIEW_PROMPT_SESSION_THRESHOLD);
    state = decision.state;
  }
  const later = recordEligibleReviewSession(state);
  assert.equal(later.shouldPrompt, false);
  assert.deepEqual(later.state, {
    eligibleSessions: REVIEW_PROMPT_SESSION_THRESHOLD,
    prompted: true,
  });
});

void test('invalid persisted review state is normalized without prompting early', () => {
  assert.deepEqual(normalizeReviewPromptState({ eligibleSessions: -9, prompted: 'yes' }), {
    eligibleSessions: 0,
    prompted: false,
  });
  assert.deepEqual(normalizeReviewPromptState(undefined), {
    eligibleSessions: 0,
    prompted: false,
  });
});
