import type { ZodObject, ZodRawShape, ZodTypeAny } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodDef = any;

// Simple Zod to JSON Schema converter for Fastify/Swagger
export function zodToJsonSchema(schema: ZodObject<ZodRawShape>): Record<string, unknown> {
  const def = schema._def as AnyZodDef;

  if (def.typeName === 'ZodObject') {
    const shape = def.shape() as Record<string, ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldDef = value._def as AnyZodDef;
      properties[key] = zodFieldToJson(fieldDef);

      if (fieldDef.typeName !== 'ZodOptional') {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object' };
}

function zodFieldToJson(fieldDef: AnyZodDef): Record<string, unknown> {
  const typeName = fieldDef.typeName as string;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return {
        type: 'string',
        enum: fieldDef.values as string[],
      };
    case 'ZodOptional':
      return zodFieldToJson(fieldDef.innerType._def);
    default:
      return { type: 'string' };
  }
}
