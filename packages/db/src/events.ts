import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  type DrawingKind,
  parseDrawingPayload,
} from "@repo/contracts";

interface AppendDrawingEventInput {
  roomId: string;
  authorId: string;
  kind: DrawingKind;
  payload: unknown;
  tempId: string;
}

const MAX_SEQ_RETRIES = 3;

/**
 * Append one drawing event with a per-room monotonic `seq`.
 *
 * Guarantees:
 * - Payload matches `kind` (Zod) before any DB write.
 * - Idempotent on (roomId, tempId): retry returns the existing row.
 * - Ordered via UNIQUE(roomId, seq). Concurrent writers retry on P2002.
 */
export async function appendDrawingEvent(
  db: PrismaClient,
  input: AppendDrawingEventInput,
) {
  const parsed = parseDrawingPayload(input.kind, input.payload);
  if (!parsed.ok) {
    throw new Error(`Invalid payload for ${input.kind}: ${parsed.error}`);
  }

  // Fast-path idempotency: client retry after a timeout/ACK loss.
  const existing = await db.drawingEvent.findUnique({
    where: { roomId_tempId: { roomId: input.roomId, tempId: input.tempId } },
  });
  if (existing) return existing;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt += 1) {
    const max = await db.drawingEvent.aggregate({
      where: { roomId: input.roomId },
      _max: { seq: true },
    });
    const nextSeq = (max._max.seq ?? 0) + 1;

    try {
      return await db.drawingEvent.create({
        data: {
          roomId: input.roomId,
          authorId: input.authorId,
          kind: input.kind,
          payload: parsed.value as Prisma.InputJsonValue,
          seq: nextSeq,
          tempId: input.tempId,
        },
      });
    } catch (err) {
      lastError = err;
      // P2002 = unique violation on (roomId, seq) or (roomId, tempId).
      // Another writer won the race — re-read and retry, or return the
      // idempotent row if tempId collided.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const byTemp = await db.drawingEvent.findUnique({
          where: {
            roomId_tempId: { roomId: input.roomId, tempId: input.tempId },
          },
        });
        if (byTemp) return byTemp;
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to assign drawing seq after retries");
}

/**
 * Reconstruct a board: latest snapshot + all events after it, in seq order.
 * Callers render snapshot.data then apply events sequentially.
 */
export async function loadBoardState(
  db: PrismaClient,
  roomId: string,
  afterSeq = 0,
) {
  const [snapshot, events] = await Promise.all([
    db.roomSnapshot.findFirst({
      where: { roomId, upToSeq: { lte: Number.MAX_SAFE_INTEGER } },
      orderBy: { upToSeq: "desc" },
    }),
    db.drawingEvent.findMany({
      where: { roomId, seq: { gt: afterSeq } },
      orderBy: { seq: "asc" },
      take: 5000,
    }),
  ]);
  return { snapshot, events };
}
