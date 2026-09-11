import { readBackgroundTaskTerminals } from "eve/context";
import { z } from "zod";

export interface BackgroundTaskTerminalRecord {
  taskId: string;
  parentTurnId: string;
  childSessionId?: string;
  childTurnId?: string;
  workerName: string;
  status: "completed" | "failed" | "cancelled";
  output?: unknown;
}

const backgroundTaskTerminalSchema = z.object({
  taskId: z.string().min(1),
  terminalTaskId: z.string().min(1),
  parentTurnId: z.string().min(1),
  childSessionId: z.string().min(1).optional(),
  childTurnId: z.string().min(1).optional(),
  workerName: z.string().min(1),
  status: z.enum(["completed", "failed", "cancelled"]),
  output: z.unknown().optional(),
});

/**
 * Trusted typed terminal results for background tasks owned by this root
 * session.
 *
 * Eve's typed projection (`readBackgroundTaskTerminals` from "eve/context")
 * is the only authority for whether a background task settled and what it
 * returned; nothing here parses worker-events prose, notification text, or
 * message history. A valid worker JSON result carried in `output` is
 * evidence the worker reported, not a verified claim about the world.
 */
export function backgroundTaskTerminals(expect?: {
  parentTurnId?: string;
  childSessionId?: string;
}): readonly BackgroundTaskTerminalRecord[] {
  const seen = new Set<string>();
  const records: BackgroundTaskTerminalRecord[] = [];

  for (const raw of readBackgroundTaskTerminals()) {
    const parsed = backgroundTaskTerminalSchema.safeParse(raw);
    if (!parsed.success) continue;
    const entry = parsed.data;

    if (entry.taskId !== entry.terminalTaskId) continue;
    if (
      expect?.parentTurnId !== undefined &&
      entry.parentTurnId !== expect.parentTurnId
    )
      continue;
    if (
      expect?.childSessionId !== undefined &&
      entry.childSessionId !== expect.childSessionId
    )
      continue;
    if (seen.has(entry.taskId)) continue;
    seen.add(entry.taskId);

    records.push({
      taskId: entry.taskId,
      parentTurnId: entry.parentTurnId,
      childSessionId: entry.childSessionId,
      childTurnId: entry.childTurnId,
      workerName: entry.workerName,
      status: entry.status,
      output: entry.output,
    });
  }

  return records;
}
