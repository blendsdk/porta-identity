/**
 * Privacy-safe terminal security decision events.
 *
 * This module deliberately accepts only typed, normalized facts. Raw request values and thrown
 * errors have no representation in the event schema, which prevents accidental disclosure at the
 * logging boundary.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Stable event name emitted for covered terminal request decisions. */
export const SECURITY_DECISION_EVENT_NAME = 'security.decision.v1' as const;

/** Closed reasons which may explain a terminal decision. */
export const SECURITY_DECISION_REASON_CODES = [
  'allowed',
  'authentication-required',
  'membership-required',
  'permission-required',
  'resource-not-found',
  'malformed-body',
  'body-too-large',
  'schema-invalid',
  'handler-failed',
  'transport-parse-failed',
  'method-not-allowed',
  'route-not-found',
] as const;

/** Closed terminal reason. */
export type SecurityDecisionReasonCode = (typeof SECURITY_DECISION_REASON_CODES)[number];

/** Domains supported by privacy-preserving protected references. */
export const SECURITY_REFERENCE_DOMAINS = ['actor', 'tenant', 'resource', 'source'] as const;

/** Protected-reference domain. */
export type SecurityReferenceDomain = (typeof SECURITY_REFERENCE_DOMAINS)[number];

const detailSchema = z
  .object({
    resourceType: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .optional(),
    permissions: z
      .array(z.string().regex(/^[a-z][a-z0-9:*_-]{0,149}$/))
      .max(16)
      .optional(),
    validationSchemaId: z
      .string()
      .regex(/^[a-z][a-z0-9.-]{0,63}$/)
      .optional(),
    issueCount: z.number().int().min(1).max(100).optional(),
  })
  .strict();

/** Strict runtime schema for a terminal security decision event. */
export const securityDecisionEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventName: z.literal(SECURITY_DECISION_EVENT_NAME),
    occurredAt: z.string().datetime({ offset: true }),
    requestId: z.string().uuid(),
    surface: z.enum(['admin-api', 'public-auth', 'transport']),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'UNKNOWN']),
    routeTemplate: z
      .string()
      .min(1)
      .max(180)
      .regex(/^\/[A-Za-z0-9:_/*.-]+$/)
      .refine((value) => !value.includes('..') && !value.includes('//')),
    statusCode: z.number().int().min(100).max(599),
    outcome: z.enum(['allow', 'deny', 'error']),
    decisionPoint: z.enum([
      'transport',
      'validation',
      'authentication',
      'membership',
      'permission',
      'resource',
      'handler',
    ]),
    reasonCode: z.enum(SECURITY_DECISION_REASON_CODES),
    referenceKeyId: z
      .string()
      .regex(/^sha256:[a-f0-9]{16}$/)
      .optional(),
    actorRef: z
      .string()
      .regex(/^hmac-sha256:[a-f0-9]{64}$/)
      .optional(),
    tenantRef: z
      .string()
      .regex(/^hmac-sha256:[a-f0-9]{64}$/)
      .optional(),
    resourceRef: z
      .string()
      .regex(/^hmac-sha256:[a-f0-9]{64}$/)
      .optional(),
    sourceRef: z
      .string()
      .regex(/^hmac-sha256:[a-f0-9]{64}$/)
      .optional(),
    detail: detailSchema.optional(),
  })
  .strict()
  .superRefine((event, context) => {
    const references = [event.actorRef, event.tenantRef, event.resourceRef, event.sourceRef];
    const hasReference = references.some((reference) => reference !== undefined);
    if (hasReference !== (event.referenceKeyId !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['referenceKeyId'],
        message: 'Protected references and their key identifier must appear together',
      });
    }

    const expectedOutcome =
      event.statusCode >= 500 ? 'error' : event.statusCode >= 400 ? 'deny' : 'allow';
    if (event.outcome !== expectedOutcome) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'Terminal outcome must match the final HTTP status class',
      });
    }
    if ((event.reasonCode === 'allowed') !== (event.outcome === 'allow')) {
      context.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message: 'The allowed reason is valid only for an allowed outcome',
      });
    }
    if ((event.reasonCode === 'handler-failed') !== (event.outcome === 'error')) {
      context.addIssue({
        code: 'custom',
        path: ['reasonCode'],
        message: 'The handler-failed reason is valid only for an error outcome',
      });
    }

    const requiredDecisionPoints: Partial<
      Record<
        SecurityDecisionReasonCode,
        | 'transport'
        | 'validation'
        | 'authentication'
        | 'membership'
        | 'permission'
        | 'resource'
        | 'handler'
      >
    > = {
      allowed: 'handler',
      'authentication-required': 'authentication',
      'membership-required': 'membership',
      'permission-required': 'permission',
      'resource-not-found': 'resource',
      'route-not-found': 'resource',
      'malformed-body': 'validation',
      'body-too-large': 'validation',
      'schema-invalid': 'validation',
      'method-not-allowed': 'validation',
      'handler-failed': 'handler',
      'transport-parse-failed': 'transport',
    };
    const requiredDecisionPoint = requiredDecisionPoints[event.reasonCode];
    if (requiredDecisionPoint !== undefined && event.decisionPoint !== requiredDecisionPoint) {
      context.addIssue({
        code: 'custom',
        path: ['decisionPoint'],
        message: 'Terminal reason must match the boundary which made the decision',
      });
    }
  });

/** Validated terminal event. */
export type SecurityDecisionEvent = z.infer<typeof securityDecisionEventSchema>;

/** Typed facts accepted when constructing a terminal event. */
export interface SecurityDecisionEventInput {
  /** Server-created correlation identifier. */
  readonly requestId: string;
  /** Closed public surface. */
  readonly surface: SecurityDecisionEvent['surface'];
  /** Closed HTTP method. */
  readonly method: SecurityDecisionEvent['method'];
  /** Registered normalized route template. */
  readonly routeTemplate: string;
  /** Final public status. */
  readonly statusCode: number;
  /** Final decision outcome. */
  readonly outcome: SecurityDecisionEvent['outcome'];
  /** Boundary which made the decision. */
  readonly decisionPoint: SecurityDecisionEvent['decisionPoint'];
  /** Closed reason code. */
  readonly reasonCode: SecurityDecisionReasonCode;
  /** Optional closed detail. */
  readonly detail?: SecurityDecisionEvent['detail'];
  /** Optional pre-derived protected references. */
  readonly references?: Readonly<Partial<Record<SecurityReferenceDomain, string>>>;
  /** Required when protected references are present. */
  readonly referenceKeyId?: string;
  /** Injectable clock for deterministic testing. */
  readonly occurredAt?: Date;
}

/** Create and validate one strict terminal event from normalized typed facts. */
export function createSecurityDecisionEvent(
  input: SecurityDecisionEventInput,
): SecurityDecisionEvent {
  return securityDecisionEventSchema.parse({
    schemaVersion: 1,
    eventName: SECURITY_DECISION_EVENT_NAME,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    requestId: input.requestId,
    surface: input.surface,
    method: input.method,
    routeTemplate: input.routeTemplate,
    statusCode: input.statusCode,
    outcome: input.outcome,
    decisionPoint: input.decisionPoint,
    reasonCode: input.reasonCode,
    ...(input.referenceKeyId === undefined ? {} : { referenceKeyId: input.referenceKeyId }),
    ...(input.references?.actor === undefined ? {} : { actorRef: input.references.actor }),
    ...(input.references?.tenant === undefined ? {} : { tenantRef: input.references.tenant }),
    ...(input.references?.resource === undefined ? {} : { resourceRef: input.references.resource }),
    ...(input.references?.source === undefined ? {} : { sourceRef: input.references.source }),
    ...(input.detail === undefined ? {} : { detail: input.detail }),
  });
}

/** One derived key from the active or retained cookie-key ring. */
interface DerivedReferenceKey {
  readonly id: string;
  readonly material: Buffer;
}

/**
 * Derive and verify domain-separated protected references.
 *
 * The first source key creates references. Retained keys are verification-only, matching the
 * cookie-key rotation contract without storing or logging the source identifiers.
 */
export class SecurityReferenceProtector {
  readonly #keys: readonly string[];

  /** Create a protector from the ordered cookie-key ring. */
  public constructor(cookieKeys: readonly string[]) {
    if (cookieKeys.length === 0 || cookieKeys.some((key) => key.length < 16)) {
      throw new Error('A valid protected-reference key ring is required');
    }
    this.#keys = [...cookieKeys];
  }

  /** Public identifier for the active derived key. */
  public get activeKeyId(): string {
    return this.#derive(this.#keys[0], 'actor').id;
  }

  /** Derive one protected reference with the active key. */
  public protect(domain: SecurityReferenceDomain, rawIdentifier: string): string {
    if (rawIdentifier.length === 0 || rawIdentifier.length > 512) {
      throw new Error('Protected-reference input is outside the accepted bound');
    }
    const key = this.#derive(this.#keys[0], domain);
    return `hmac-sha256:${createHmac('sha256', key.material).update(rawIdentifier).digest('hex')}`;
  }

  /** Verify a reference against one named active or retained derived key. */
  public verify(
    domain: SecurityReferenceDomain,
    rawIdentifier: string,
    reference: string,
    keyId: string,
  ): boolean {
    if (!/^hmac-sha256:[a-f0-9]{64}$/.test(reference)) return false;
    const presented = Buffer.from(reference.slice('hmac-sha256:'.length), 'hex');
    for (const sourceKey of this.#keys) {
      const derived = this.#derive(sourceKey, domain);
      if (derived.id !== keyId) continue;
      const expected = createHmac('sha256', derived.material).update(rawIdentifier).digest();
      return expected.length === presented.length && timingSafeEqual(expected, presented);
    }
    return false;
  }

  /** Derive one domain-specific HMAC key and non-secret identifier. */
  #derive(sourceKey: string, domain: SecurityReferenceDomain): DerivedReferenceKey {
    const source = Buffer.from(sourceKey, 'utf8');
    const material = Buffer.from(
      hkdfSync(
        'sha256',
        source,
        Buffer.from('porta/security-decision/v1', 'utf8'),
        Buffer.from(`porta/security-decision/v1/${domain}`, 'utf8'),
        32,
      ),
    );
    const identifierMaterial = Buffer.from(
      hkdfSync(
        'sha256',
        source,
        Buffer.from('porta/security-decision/v1', 'utf8'),
        Buffer.from('porta/security-decision/v1/key-id', 'utf8'),
        32,
      ),
    );
    return {
      id: `sha256:${createHash('sha256').update(identifierMaterial).digest('hex').slice(0, 16)}`,
      material,
    };
  }
}
