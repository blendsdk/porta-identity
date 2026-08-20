import { exitPrecedence, exitTaxonomy } from '../commands.js';
import type { CommandTerminalEvent, ReducedCommandOutcome } from './model.js';

/** Selects one terminal outcome using the documented non-numeric precedence. */
export function reduceCommandTerminalEvents(
  events: readonly CommandTerminalEvent[],
): ReducedCommandOutcome {
  if (events.length === 0) {
    return { exitCode: 0, classification: 'success', stage: 'complete' };
  }
  for (const exitCode of exitPrecedence) {
    const event = events.find((candidate) => candidate.exitCode === exitCode);
    if (event !== undefined) {
      return {
        exitCode,
        classification: exitTaxonomy[exitCode],
        stage: event.stage,
      };
    }
  }
  throw new Error('terminal event has no registered precedence');
}
