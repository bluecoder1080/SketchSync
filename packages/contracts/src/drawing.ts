import { z } from "zod";

export const pointSchema = z.object({
  x: z.number().finite().min(-10000).max(10000),
  y: z.number().finite().min(-10000).max(10000),
});

export type Point = z.infer<typeof pointSchema>;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb");

const strokeWidthSchema = z.number().int().min(1).max(50);

const baseStyleSchema = z.object({
  color: hexColorSchema,
  width: strokeWidthSchema,
});

export const strokePayloadSchema = baseStyleSchema.extend({
  points: z.array(pointSchema).min(2).max(2000),
});

export const linePayloadSchema = baseStyleSchema.extend({
  from: pointSchema,
  to: pointSchema,
});

export const rectPayloadSchema = baseStyleSchema.extend({
  x: z.number().finite().min(-10000).max(10000),
  y: z.number().finite().min(-10000).max(10000),
  w: z.number().finite().min(1).max(10000),
  h: z.number().finite().min(1).max(10000),
  fill: hexColorSchema.optional(),
});

export const circlePayloadSchema = baseStyleSchema.extend({
  cx: z.number().finite().min(-10000).max(10000),
  cy: z.number().finite().min(-10000).max(10000),
  r: z.number().finite().min(1).max(10000),
  fill: hexColorSchema.optional(),
});

export const arrowPayloadSchema = baseStyleSchema.extend({
  from: pointSchema,
  to: pointSchema,
});

export const textPayloadSchema = z.object({
  x: z.number().finite().min(-10000).max(10000),
  y: z.number().finite().min(-10000).max(10000),
  text: z.string().min(1).max(2000),
  fontSize: z.number().int().min(8).max(128),
  color: hexColorSchema,
});

export const erasePayloadSchema = z.object({
  erasedEventIds: z.array(z.string().uuid()).min(1).max(100),
});

export const drawingKindSchema = z.enum([
  "STROKE",
  "LINE",
  "RECT",
  "CIRCLE",
  "ARROW",
  "TEXT",
  "ERASE",
]);

export type DrawingKind = z.infer<typeof drawingKindSchema>;

// Maps each kind to its payload schema so TS narrows correctly.
export const payloadByKind = {
  STROKE: strokePayloadSchema,
  LINE: linePayloadSchema,
  RECT: rectPayloadSchema,
  CIRCLE: circlePayloadSchema,
  ARROW: arrowPayloadSchema,
  TEXT: textPayloadSchema,
  ERASE: erasePayloadSchema,
} as const;

// Client -> server input. seq and timestamps are server-assigned, never trusted.
export const drawingEventInputSchema = z.object({
  roomId: z.string().uuid(),
  kind: drawingKindSchema,
  payload: z.unknown(),
  // Client-generated UUID for idempotent retry. Server echoes it back on ACK.
  tempId: z.string().uuid(),
});

export type DrawingEventInput = z.infer<typeof drawingEventInputSchema>;

// Validates that payload shape matches kind. Returns typed payload on success.
export function parseDrawingPayload(
  kind: DrawingKind,
  payload: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = payloadByKind[kind];
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.message };
}
