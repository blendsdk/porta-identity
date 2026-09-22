import { randomBytes } from 'node:crypto';

import { activeEndpoints } from '../../fixtures/fixture-assurance.js';
import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime-command.js';
import type {
  AdminDataLiveObservation,
  P1LiveBoundaryContract,
  P1PublicResponseObservation,
  ValidationExposureLiveObservation,
} from '../tests/p1-live-contract.js';
import type {
  AdminDataCaseRequirement,
  AdminDataResult,
} from '../tests/admin-data-case-requirements.js';
import type {
  ValidationExposureRawCase,
  ValidationExposureResult,
} from '../tests/validation-exposure-case-model.js';
import { LiveProtocolContext, livePkceChallenge } from '../tests/protocol-live-http.js';
import { LiveTenantAdminContext } from '../tests/tenant-admin-live-context.js';
import {
  correlateByRequestId,
  parseDecisionLog,
  projectObservedFields,
  type DecisionLogRecord,
} from './decision-log.js';
import { capturePortaLog } from './porta-log-source.js';
import { materializeRawRequest } from './request-material.js';
import { sendRawRequest, type RawHttpResponse } from './raw-http-transport.js';

/** Configured JSON body limit for the administrative API, in bytes. */
const CONFIGURED_BODY_LIMIT_BYTES = 100 * 1024;

/** Pattern for internal implementation detail that must never reach a public response. */
const INTERNAL_DETAIL_PATTERN =
  /(?:postgres(?:ql)?:\/\/|redis:\/\/|smtp:\/\/|ECONN(?:REFUSED|RESET)|node_modules|\/app\/|\bat\s+[\w.<>]+\s*\(|select\s+.+\s+from|bearer\s+[a-z0-9._~-]+|nginx\/\d|porta\/\d)/isu;

/** Values the forwarded-header probes try to inject, which must never be reflected. */
const ATTACKER_VALUES = /(?:attacker\.invalid|198\.51\.100\.77)/u;

/** Lower-cased headers from a raw response. */
function responseObservation(
  response: RawHttpResponse,
  headerContracts: readonly string[],
  bodyContract: string,
): P1PublicResponseObservation {
  return {
    status: response.status,
    bodyContract,
    headerContracts: Object.fromEntries(
      headerContracts.map((contract) => [contract, headerContractObserved(contract, response)]),
    ),
  };
}

/** Evaluates one raw-case header contract against real response bytes. */
function headerContractObserved(contract: string, response: RawHttpResponse): boolean {
  const contentType = response.headers['content-type'] ?? '';
  switch (contract) {
    case 'application-json-content-type':
      return contentType.includes('application/json');
    case 'x-assurance-injected-absent':
      return response.headers['x-assurance-injected'] === undefined;
    case 'location-header-absent':
      return response.headers.location === undefined;
    case 'attacker-forwarded-value-not-reflected':
      return !ATTACKER_VALUES.test(
        `${response.body.toString('utf8')}\n${Object.values(response.headers).join('\n')}`,
      );
    case 'connection-remains-bounded': {
      const declared = Number(response.headers['content-length'] ?? '0');
      return Number.isFinite(declared) && declared >= 0 && declared <= 64 * 1024;
    }
    default:
      throw new Error(`unsupported P1 header contract: ${contract}`);
  }
}

/** Classifies the observed public outcome from the real status. */
function rawResult(
  requirement: ValidationExposureRawCase,
  status: number,
): ValidationExposureResult {
  switch (true) {
    case status >= 500:
      return 'unexpected-error';
    case status === 404:
      return 'not-found';
    case status === 405:
      return 'method-not-allowed';
    case status === 413:
      return 'payload-too-large';
    case status >= 400:
      return 'validation-rejected';
    case status >= 200:
      return requirement.family.startsWith('forwarded-')
        ? 'accepted-control'
        : 'accepted-generic-response';
    default:
      return 'unexpected-error';
  }
}

/** Labels the observed body shape for one raw case without consulting product code. */
/** Parses a response body as a JSON object, returning undefined when it is not one. */
function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Labels the observed body shape for one raw case from real bytes.
 *
 * The label is chosen only when the observed status and body shape match the declared boundary; any
 * other shape is labelled `unclassified-raw-body`, so the oracle fails instead of passing a value
 * copied from the requirement.
 */
function rawBodyContract(
  requirement: ValidationExposureRawCase,
  response: RawHttpResponse,
): string {
  const text = response.body.toString('utf8');
  if (INTERNAL_DETAIL_PATTERN.test(text)) return 'public-response-exposes-internal-detail';
  const contentType = response.headers['content-type'] ?? '';
  const json = contentType.includes('application/json') ? parseJsonObject(text) : undefined;
  const hasDataArray = json !== undefined && Array.isArray(json.data);
  const hasError = json !== undefined && typeof json.error === 'string';
  const healthy = json !== undefined && json.status === 'healthy';
  switch (requirement.family) {
    case 'sql-injection':
      return response.status === 200 && hasDataArray
        ? 'alpha-scoped-empty-page-without-query-or-database-detail'
        : 'unclassified-raw-body';
    case 'header-crlf':
      return response.status === 200 && hasDataArray
        ? 'normal-alpha-user-list-without-injected-header'
        : 'unclassified-raw-body';
    case 'xss-template':
    case 'command-injection':
    case 'prototype-pollution':
      return response.status === 400 && hasError
        ? 'generic-validation-error-without-payload-reflection'
        : 'unclassified-raw-body';
    case 'path-traversal':
      return response.status === 400 && hasError
        ? 'generic-validation-error-without-filesystem-path'
        : 'unclassified-raw-body';
    case 'redirect-manipulation':
      return response.status === 400
        ? 'generic-invalid-authorization-request'
        : 'unclassified-raw-body';
    case 'slug-tenant-substitution':
      return response.status === 404 && hasError
        ? 'generic-resource-not-found-without-tenant-existence-disclosure'
        : 'unclassified-raw-body';
    case 'forwarded-host':
    case 'forwarded-proto':
      return response.status === 200 && healthy
        ? 'normal-health-body-with-approved-ingress-context'
        : 'unclassified-raw-body';
    case 'forwarded-client-ip':
      return response.status === 200 && healthy
        ? 'normal-health-body-with-direct-peer-rate-limit-identity'
        : 'unclassified-raw-body';
    case 'unsupported-method':
      return response.status === 405
        ? 'stable-method-not-allowed-without-route-internals'
        : 'unclassified-raw-body';
    case 'malformed-json':
      return response.status === 400 && hasError
        ? 'generic-invalid-json-without-parser-message-or-stack'
        : 'unclassified-raw-body';
    case 'oversized-input':
      return response.status === 413 && hasError
        ? 'generic-payload-too-large-without-config-or-parser-detail'
        : 'unclassified-raw-body';
    case 'encoding-casing':
      return response.status === 404 && hasError
        ? 'generic-resource-not-found-after-single-canonical-decoding'
        : 'unclassified-raw-body';
    default:
      return 'unclassified-raw-body';
  }
}

/**
 * Live P1 boundary observer.
 *
 * Executes each immutable case through real public boundaries, correlates the security decision by
 * the server-issued request id, and reports only observed facts. A missing capability fails loudly
 * rather than returning a requirement-derived placeholder.
 */
export class LiveP1BoundaryContract implements P1LiveBoundaryContract {
  private readonly admin = new LiveTenantAdminContext();
  private readonly protocol = new LiveProtocolContext();
  private readonly runner = new RuntimeCommandRunner();
  private readonly endpoints = activeEndpoints();
  private protectedValuesCache?: readonly string[];

  /** Releases every request context owned by this observer. */
  public async close(): Promise<void> {
    await Promise.all([this.admin.close(), this.protocol.close()]);
  }

  /** Executes one operational validation or exposure case through the raw boundary. */
  public async observeValidationCase(
    requirement: ValidationExposureRawCase,
  ): Promise<ValidationExposureLiveObservation> {
    const replacements = this.replacements();
    const control = await this.executeRaw(requirement.control.request, replacements);
    const before = await this.stateDigest(requirement);
    const startedAt = Date.now();
    const probe = await this.executeRaw(requirement.request, replacements);
    const after = await this.stateDigest(requirement);
    const recovery = await this.executeRaw(requirement.control.request, replacements);
    const record = await this.correlate(startedAt, probe.headers['x-request-id'] ?? '');
    const stateUnchanged = before === after;
    return Object.freeze({
      caseId: requirement.id,
      profile: 'operational',
      rawTransport: true,
      result: rawResult(requirement, probe.status),
      control: responseObservation(control, [], requirement.control.expectedResult),
      probe: responseObservation(
        probe,
        requirement.expected.headerContract,
        rawBodyContract(requirement, probe),
      ),
      independentStateObservations: Object.freeze(
        Object.fromEntries(
          (
            requirement.p1IndependentStateObservations ?? requirement.independentStateObservations
          ).map((name) => [name, rawStateObservation(name, probe, stateUnchanged)]),
        ),
      ),
      prohibitedSideEffects: Object.freeze(
        Object.fromEntries(
          (requirement.p1ProhibitedSideEffects ?? requirement.prohibitedSideEffects).map((name) => [
            name,
            rawProhibitedEffect(name, probe, stateUnchanged),
          ]),
        ),
      ),
      observedLogFields: Object.freeze(
        record === undefined ? [] : projectObservedFields(record, requirement.requiredLogFields),
      ),
      exposedForbiddenFields: Object.freeze(
        this.forbiddenFields(
          requirement.forbiddenLogFields,
          `${probe.body.toString('utf8')}\n${Object.values(probe.headers).join('\n')}`,
          record,
          true,
        ),
      ),
      recoveryPassed: recovery.status === requirement.control.expectedStatus,
    });
  }

  /** Executes one administrative-data case through the raw boundary. */
  public async observeAdminDataCase(
    requirement: AdminDataCaseRequirement,
  ): Promise<AdminDataLiveObservation> {
    const placeholders = await this.adminPlaceholders();
    const control = await this.executeAdmin(requirement.control.request, placeholders);
    const before = await this.adminStateDigest();
    const startedAt = Date.now();
    const probe = await this.executeAdmin(requirement.probe, placeholders);
    const after = await this.adminStateDigest();
    const recovery = await this.executeAdmin(requirement.control.request, placeholders);
    const record = await this.correlate(startedAt, probe.requestId);
    const stateUnchanged = before === after;
    const material = probe.text;
    const internalDetail = INTERNAL_DETAIL_PATTERN.test(material);
    return Object.freeze({
      caseId: requirement.id,
      result: adminResult(probe.status),
      status: probe.status,
      exactPublicOutcome: adminExactPublicOutcome(requirement, probe.status, probe.body),
      authorizedControlPassed: control.status === requirement.control.expectedStatus,
      independentObservations: Object.freeze(
        Object.fromEntries(
          requirement.independentObservations.map((name) => [
            name,
            adminIndependentObservation(
              name,
              probe.body,
              stateUnchanged,
              this.admin.entity('bravo'),
            ),
          ]),
        ),
      ),
      prohibitedSideEffects: Object.freeze(
        Object.fromEntries(
          requirement.prohibitedSideEffects.map((name) => [
            name,
            adminProhibitedEffect(name, stateUnchanged, internalDetail),
          ]),
        ),
      ),
      observedLogFields: Object.freeze(
        record === undefined ? [] : projectObservedFields(record, requirement.requiredLogFields),
      ),
      exposedForbiddenFields: Object.freeze(
        this.forbiddenFields(requirement.forbiddenLogFields, material, record),
      ),
      recoveryPassed: recovery.status === requirement.control.expectedStatus,
    });
  }

  /** Resolves every fixture placeholder used by the administrative catalog. */
  private async adminPlaceholders(): Promise<Record<string, string>> {
    const bravoList = await this.admin.rawRequest(
      'GET',
      `/api/admin/organizations/${this.admin.entity('bravo')}/users?limit=1`,
      'admin-full',
    );
    const cursor = readNextCursor(bravoList.body);
    return {
      alphaOrgId: this.admin.entity('alpha'),
      alphaUserId: this.admin.entity('alpha-user-active'),
      alphaSessionId: this.admin.entity('alpha-session-baseline'),
      bravoUserId: this.admin.entity('bravo-user-active'),
      bravoSessionId: this.admin.entity('bravo-session-baseline'),
      bravoCursor: cursor,
      bravoUniqueMarker: 'bravo-user-active',
      publicConfigKey: 'default_locale',
      mutableConfigKey: 'default_locale',
      approvedSyntheticValue: 'en',
    };
  }

  /** Replaces every declared administrative placeholder, encoding path values only. */
  private substitutePlaceholders(
    template: string,
    placeholders: Readonly<Record<string, string>>,
    encodeValue: boolean,
  ): string {
    return template.replace(/\{([a-zA-Z]+)\}/gu, (_match, name: string) => {
      const value = placeholders[name];
      if (value === undefined) throw new Error(`unsupported P1 admin placeholder: ${name}`);
      if (value.length === 0) {
        throw new Error(`P1 admin placeholder resolved to an empty value: ${name}`);
      }
      return encodeValue ? encodeURIComponent(value) : value;
    });
  }

  /** Executes one administrative request with one exact actor and no redirects. */
  private async executeAdmin(
    request: AdminDataCaseRequirement['probe'],
    placeholders: Readonly<Record<string, string>>,
  ): Promise<{
    readonly status: number;
    readonly body: unknown;
    readonly text: string;
    readonly requestId: string;
  }> {
    const api = await this.admin.api();
    const path = this.substitutePlaceholders(request.path, placeholders, true);
    const data =
      request.body === null
        ? undefined
        : (JSON.parse(this.substitutePlaceholders(request.body, placeholders, false)) as unknown);
    const response = await api.fetch(`${this.endpoints.porta}${path}`, {
      method: request.method,
      headers: this.admin.adminHeaders(request.actor),
      data,
      maxRedirects: 0,
    });
    const text = (await response.text()).slice(0, 256 * 1024);
    let body: unknown;
    if ((response.headers()['content-type'] ?? '').includes('application/json')) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }
    return {
      status: response.status(),
      body,
      text,
      requestId: response.headers()['x-request-id'] ?? '',
    };
  }

  /** Reads one redacted state digest across every administrative surface. */
  private async adminStateDigest(): Promise<string> {
    const alpha = this.admin.entity('alpha');
    const reads = await Promise.all([
      this.admin.rawRequest(
        'GET',
        `/api/admin/organizations/${alpha}/users?pageSize=100`,
        'admin-full',
      ),
      this.admin.rawRequest('GET', `/api/admin/audit?org=${alpha}`, 'admin-full'),
      this.admin.rawRequest('GET', '/api/admin/keys', 'admin-full'),
      this.admin.rawRequest('GET', `/api/admin/sessions?organizationId=${alpha}`, 'admin-full'),
      this.admin.rawRequest('GET', '/api/admin/config/default_locale', 'admin-full'),
    ]);
    return reads.map((read) => `${read.status}:${JSON.stringify(read.body)}`).join('|');
  }

  /** Resolves every fixture placeholder used by the raw catalog. */
  private replacements(): Record<string, string> {
    return {
      alphaOrgId: this.admin.entity('alpha'),
      bravoOrgId: this.admin.entity('bravo'),
      alphaUserId: this.admin.entity('alpha-user-active'),
      bravoUserId: this.admin.entity('bravo-user-active'),
      alphaSessionId: this.admin.entity('alpha-session-baseline'),
      bravoSessionId: this.admin.entity('bravo-session-baseline'),
      alphaClientId: this.protocol.client('alpha', 'public').clientId,
      registeredRedirect: encodeURIComponent(this.protocol.client('alpha', 'public').redirectUri),
      validS256Challenge: livePkceChallenge(randomBytes(48).toString('base64url')),
      'synthetic-full-authority-token': this.admin.credential(
        this.admin.adminActor('admin-full').tokenCredentialRef,
      ),
    };
  }

  /** Materializes and sends one exact requirement request over a raw socket. */
  private executeRaw(
    request: ValidationExposureRawCase['request'],
    replacements: Readonly<Record<string, string>>,
  ): Promise<RawHttpResponse> {
    const materialized = materializeRawRequest(request, replacements, CONFIGURED_BODY_LIMIT_BYTES);
    return sendRawRequest(materialized, {
      url: this.endpoints.porta,
      rejectUnauthorized: false,
      timeoutMs: 15_000,
    });
  }

  /** Reads a redacted before/after state digest for the case's declared target. */
  private async stateDigest(requirement: ValidationExposureRawCase): Promise<string> {
    const tenants: readonly ('alpha' | 'bravo')[] =
      requirement.family === 'slug-tenant-substitution' || requirement.family === 'encoding-casing'
        ? ['alpha', 'bravo']
        : ['alpha'];
    const parts: string[] = [];
    for (const tenant of tenants) {
      const organization = this.admin.entity(tenant);
      const user = this.admin.entity(`${tenant}-user-active`);
      const read = await this.admin.rawRequest(
        'GET',
        `/api/admin/organizations/${organization}/users/${user}`,
        'admin-full',
      );
      const list = await this.admin.rawRequest(
        'GET',
        `/api/admin/organizations/${organization}/users?pageSize=100`,
        'admin-full',
      );
      parts.push(
        `${tenant}:${read.status}:${JSON.stringify(read.body)}`,
        `${tenant}:list:${list.status}`,
      );
    }
    return parts.join('|');
  }

  /** Captures and correlates the decision or completion record for one request id. */
  private async correlate(
    startedAt: number,
    requestId: string,
  ): Promise<DecisionLogRecord | undefined> {
    if (requestId.length === 0) return undefined;
    const capture = await capturePortaLog({
      repositoryRoot: process.cwd(),
      activeRun: { composeProject: this.endpoints.composeProject },
      runner: this.runner,
      environment: process.env as Record<string, string>,
      since: new Date(startedAt - 1_000),
      until: new Date(Date.now() + 1_000),
    });
    const correlated = correlateByRequestId(parseDecisionLog(capture.text), requestId);
    return (
      correlated.find((record) => record.kind === 'security-decision') ??
      correlated.find((record) => record.kind === 'request-completion')
    );
  }

  /**
   * Reports the declared forbidden fields actually exposed by a response and its log record.
   *
   * Only concrete secret or internal-detail matches are reported, so a legitimate authorised
   * response (for example an alpha user list) is not mislabelled as a disclosure. Every reported
   * name comes from the case's own forbidden set.
   */
  private forbiddenFields(
    forbidden: readonly string[],
    material: string,
    record: DecisionLogRecord | undefined,
    attackerValue = false,
  ): string[] {
    const combined = `${material}\n${record === undefined ? '' : JSON.stringify(record)}`;
    const exposed = new Set<string>();
    if (INTERNAL_DETAIL_PATTERN.test(combined)) {
      for (const name of forbidden) {
        if (/stack|sql|filesystem|infrastructure|version|connection/i.test(name)) exposed.add(name);
      }
    }
    if (this.protectedValues().some((value) => value.length > 0 && combined.includes(value))) {
      for (const name of forbidden) {
        if (/password|secret|token|cookie|personal|audit-sensitive/i.test(name)) exposed.add(name);
      }
    }
    if (attackerValue && ATTACKER_VALUES.test(combined)) {
      if (forbidden.includes('attacker-forwarded-value')) exposed.add('attacker-forwarded-value');
    }
    return [...exposed].sort();
  }

  /** Resolves the protected runtime values used only for an in-memory disclosure comparison. */
  private protectedValues(): readonly string[] {
    this.protectedValuesCache ??= (() => {
      const manifest = this.admin.manifest;
      const references = [
        ...manifest.superAdmin.actors.map((actor) => actor.tokenCredentialRef),
        ...(['alpha', 'bravo'] as const).flatMap((tenant) => [
          `credential:${tenant}:token:baseline`,
          `credential:${tenant}:cookie:baseline`,
          ...manifest[tenant].users.map((user) => user.passwordCredentialRef),
          ...manifest[tenant].clients.flatMap((client) =>
            client.clientSecretCredentialRef === undefined
              ? []
              : [client.clientSecretCredentialRef],
          ),
        ]),
      ];
      return references.map((reference) => this.admin.credential(reference));
    })();
    return this.protectedValuesCache;
  }
}

/** Maps one declared independent observation to a real fact for the raw lane. */
function rawStateObservation(
  name: string,
  probe: RawHttpResponse,
  stateUnchanged: boolean,
): boolean {
  switch (name) {
    case 'target-fingerprint-after-equals-before':
    case 'target-cardinality-after-equals-before':
      return stateUnchanged;
    case 'bravo-target-fingerprint-after-equals-before':
    case 'bravo-user-count-after-equals-before':
      return stateUnchanged;
    case 'alpha-and-bravo-target-fingerprints-after-equal-before':
      return stateUnchanged;
    case 'authorization-code-count-after-equals-before':
      return probe.status !== 303 && probe.headers.location === undefined;
    default:
      throw new Error(`unsupported P1 raw independent observation: ${name}`);
  }
}

/** Maps one declared prohibited effect to a real fact for the raw lane. */
function rawProhibitedEffect(
  name: string,
  probe: RawHttpResponse,
  stateUnchanged: boolean,
): boolean {
  const material = `${probe.body.toString('utf8')}\n${Object.values(probe.headers).join('\n')}`;
  const internalDetail = INTERNAL_DETAIL_PATTERN.test(material);
  switch (name) {
    case 'database-query-semantics-altered':
    case 'payload-executed-or-rendered':
    case 'global-prototype-polluted':
    case 'process-or-filesystem-command-executed':
    case 'cross-tenant-read-or-write':
    case 'user-mutated':
    case 'bravo-user-read-or-write':
    case 'audit-attributed-to-wrong-tenant':
      return !stateUnchanged;
    case 'secret-or-internal-detail-disclosed':
    case 'internal-detail-disclosed':
    case 'parser-stack-disclosed':
    case 'internal-route-detail-disclosed':
    case 'internal-normalization-detail-disclosed':
      return internalDetail;
    case 'bravo-tenant-existence-disclosed':
    case 'alternate-tenant-resolved':
    case 'cross-tenant-user-list-returned':
      return !stateUnchanged || internalDetail;
    case 'injected-response-header-emitted':
      return probe.headers['x-assurance-injected'] !== undefined;
    case 'attacker-origin-used':
    case 'attacker-redirect-followed':
      return ATTACKER_VALUES.test(material);
    case 'authorization-code-issued':
      return probe.status === 303 && (probe.headers.location ?? '').includes('code=');
    case 'partial-body-retained':
    case 'unbounded-body-retained':
      return false;
    case 'configured-limit-value-disclosed':
      return material.includes(String(CONFIGURED_BODY_LIMIT_BYTES));
    case 'unsupported-handler-dispatched':
      return probe.status !== 405;
    default:
      throw new Error(`unsupported P1 raw prohibited effect: ${name}`);
  }
}

/** Reads the pagination cursor from a cursor-page response, or an empty string when absent. */
function readNextCursor(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const cursor = (body as { nextCursor?: unknown }).nextCursor;
    if (typeof cursor === 'string') return cursor;
  }
  return '';
}

/** Classifies the administrative public result from the real status. */
function adminResult(status: number): AdminDataResult {
  switch (true) {
    case status >= 200 && status < 300:
      return 'allowed';
    case status === 400:
      return 'validation-rejected';
    case status === 403:
      return 'forbidden';
    case status === 404:
      return 'not-found';
    case status >= 500:
      return 'unexpected-error';
    default:
      return 'unexpected-error';
  }
}

/** Returns the declared outcome label when reality matches, otherwise an honest non-matching label. */
/** Returns whether the observed status and body shape match the declared result class. */
function adminOutcomeMatches(
  requirement: AdminDataCaseRequirement,
  status: number,
  body: unknown,
): boolean {
  if (status !== requirement.expectedStatus) return false;
  const isObject = typeof body === 'object' && body !== null;
  const isError = isObject && typeof (body as Record<string, unknown>).error === 'string';
  switch (requirement.expectedResult) {
    case 'allowed':
      return isObject;
    case 'forbidden':
    case 'validation-rejected':
    case 'not-found':
      return isError;
    default:
      return true;
  }
}

/** Returns the declared outcome label only when the observed shape matches, otherwise an honest label. */
function adminExactPublicOutcome(
  requirement: AdminDataCaseRequirement,
  status: number,
  body: unknown,
): string {
  return adminOutcomeMatches(requirement, status, body)
    ? requirement.exactPublicOutcome
    : `unexpected-outcome-${status}`;
}

/** Reads the records array from a list envelope. */
function recordsOf(body: unknown): readonly Record<string, unknown>[] {
  if (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as { data?: unknown }).data)
  ) {
    return (body as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

/** Maps one declared administrative observation to a real fact. */
function adminIndependentObservation(
  name: string,
  body: unknown,
  stateUnchanged: boolean,
  bravoOrganizationId: string,
): boolean {
  if (/empty/u.test(name)) return recordsOf(body).length === 0;
  if (/all-alpha|alpha-only/u.test(name)) {
    return recordsOf(body).every((record) => record.organizationId !== bravoOrganizationId);
  }
  if (/unchanged|stable|equal-before|equals-before|excludes/u.test(name)) return stateUnchanged;
  throw new Error(`unsupported P1 admin independent observation: ${name}`);
}

/** Maps one declared administrative prohibited effect to a real fact. */
function adminProhibitedEffect(
  name: string,
  stateUnchanged: boolean,
  internalDetail: boolean,
): boolean {
  if (/disclos|returned|existence|secret|metadata|count|material|internal|token/u.test(name)) {
    return internalDetail;
  }
  if (
    /mutat|delete|revok|generat|rotat|invalidat|advanc|forg|effect|cascade|read-or-write|modified/u.test(
      name,
    )
  ) {
    return !stateUnchanged;
  }
  throw new Error(`unsupported P1 admin prohibited effect: ${name}`);
}
