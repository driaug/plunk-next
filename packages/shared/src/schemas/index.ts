import {z} from 'zod';

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.date()]);
type Literal = z.infer<typeof literalSchema>;
type Json = Literal | {[key: string]: Json} | Json[];
const jsonSchema: z.ZodType<Json> = z.lazy(() => z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]));

export const UtilitySchemas = {
  id: z.object({
    id: z.string().uuid(),
  }),
  email: z.object({
    email: z.string().email(),
  }),
  pagination: z.object({
    page: z
      .union([z.number(), z.string()])
      .transform(value => parseInt(value as string, 10))
      .nullish()
      .transform(value => value ?? 1),
    limit: z
      .union([z.number(), z.string()])
      .transform(value => parseInt(value as string, 10))
      .nullish()
      .transform(value => value ?? 20),
    sort: z.enum(['alphabetical', 'latest']).default('latest'),
  }),
  query: z.object({
    query: z.string().min(3),
    filters: z
      .union([z.array(z.string()), z.string()])
      .transform(value => (Array.isArray(value) ? value : value.split('_').filter(Boolean)))
      .optional()
      .default([]),
  }),
} as const;

export const AuthenticationSchemas = {
  login: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
  signup: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
  resetPassword: z.object({
    email: z.string().email(),
  }),
} as const;

export const ProjectSchemas = {
  create: z.object({
    name: z.string().min(1).max(100),
  }),
  update: z.object({
    name: z.string().min(1).max(100).optional(),
  }),
} as const;

export const ContactSchemas = {
  create: z.object({
    email: z.string().email(),
    subscribed: z.boolean().default(true),
    data: jsonSchema.optional(),
  }),
};

export const SegmentSchemas = {
  filter: z.object({
    field: z.string().min(1),
    operator: z.enum([
      'equals',
      'notEquals',
      'contains',
      'notContains',
      'greaterThan',
      'lessThan',
      'greaterThanOrEqual',
      'lessThanOrEqual',
      'exists',
      'notExists',
      'within',
    ]),
    value: z.any().optional(),
    unit: z.enum(['days', 'hours', 'minutes']).optional(),
  }),
  create: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    filters: z.array(
      z.object({
        field: z.string().min(1),
        operator: z.enum([
          'equals',
          'notEquals',
          'contains',
          'notContains',
          'greaterThan',
          'lessThan',
          'greaterThanOrEqual',
          'lessThanOrEqual',
          'exists',
          'notExists',
          'within',
        ]),
        value: z.any().optional(),
        unit: z.enum(['days', 'hours', 'minutes']).optional(),
      }),
    ),
    trackMembership: z.boolean().default(false),
  }),
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    filters: z
      .array(
        z.object({
          field: z.string().min(1),
          operator: z.enum([
            'equals',
            'notEquals',
            'contains',
            'notContains',
            'greaterThan',
            'lessThan',
            'greaterThanOrEqual',
            'lessThanOrEqual',
            'exists',
            'notExists',
            'within',
          ]),
          value: z.any().optional(),
          unit: z.enum(['days', 'hours', 'minutes']).optional(),
        }),
      )
      .optional(),
    trackMembership: z.boolean().optional(),
  }),
};

export const TemplateSchemas = {
  create: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    subject: z.string().min(1),
    body: z.string().min(1),
    from: z.string().email(),
    replyTo: z.string().email().optional(),
    type: z.enum(['TRANSACTIONAL', 'MARKETING']).default('MARKETING'),
  }),
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    subject: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    from: z.string().email().optional(),
    replyTo: z.string().email().optional(),
    type: z.enum(['TRANSACTIONAL', 'MARKETING']).optional(),
  }),
};

export const WorkflowSchemas = {
  create: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    triggerType: z.enum(['EVENT', 'MANUAL', 'SCHEDULE']),
    triggerConfig: jsonSchema.optional(),
    enabled: z.boolean().default(false),
  }),
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    triggerType: z.enum(['EVENT', 'MANUAL', 'SCHEDULE']).optional(),
    triggerConfig: jsonSchema.optional(),
    enabled: z.boolean().optional(),
  }),
  addStep: z.object({
    type: z.enum([
      'TRIGGER',
      'SEND_EMAIL',
      'DELAY',
      'WAIT_FOR_EVENT',
      'CONDITION',
      'EXIT',
      'WEBHOOK',
      'UPDATE_CONTACT',
    ]),
    name: z.string().min(1).max(100),
    position: jsonSchema,
    config: jsonSchema,
    templateId: z.string().uuid().optional(),
  }),
  updateStep: z.object({
    name: z.string().min(1).max(100).optional(),
    position: jsonSchema.optional(),
    config: jsonSchema.optional(),
    templateId: z.string().uuid().optional().nullable(),
  }),
  createTransition: z.object({
    fromStepId: z.string().uuid(),
    toStepId: z.string().uuid(),
    condition: jsonSchema.optional(),
    priority: z.number().int().min(0).default(0),
  }),
  startExecution: z.object({
    contactId: z.string().uuid(),
    context: jsonSchema.optional(),
  }),
};

export const DomainSchemas = {
  create: z.object({
    projectId: z.string().uuid(),
    domain: z
      .string()
      .min(3)
      .max(253)
      .refine(
        value => {
          // Basic domain validation regex
          const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
          return domainRegex.test(value);
        },
        {
          message: 'Invalid domain format',
        },
      ),
  }),
  projectId: z.object({
    projectId: z.string().uuid(),
  }),
};
