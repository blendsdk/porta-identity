/**
 * Public SDK contract for the human-only client service-account subresource.
 *
 * These tests pin three things independently of any server implementation:
 *
 * 1. the exact method, encoded path, and body the SDK sends through the
 *    existing admin transport;
 * 2. the complete binding shape the SDK accepts and unwraps;
 * 3. the failures the SDK must surface before a request can leave the
 *    process, including malformed responses and dot-segment identifiers.
 *
 * The server-side route, policy validation, and authorization rules have
 * their own oracles. This file only observes the SDK boundary.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientsDomain } from '../../src/domains/clients.js';
import { PortaError } from '../../src/errors/index.js';
import { createNodeTransport } from '../../src/node.js';
import type { TransportRequest, TransportResponse } from '../../src/transport/types.js';

type RequestMock = (request: TransportRequest) => Promise<TransportResponse>;

const CLIENT_ID = '5f0c6f3a-8c11-4f4d-9f7d-6e3f0f2a1b10';
const BINDING_ID = 'b0a1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d';
const SERVICE_ACCOUNT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ORGANIZATION_ID = '11111111-2222-4333-8444-555555555555';
const SECOND_ORGANIZATION_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const APPLICATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ROLE_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const CLAIM_DEFINITION_ID = 'cccccccc-dddd-4eee-8fff-000000000000';
const CREATED_AT = '2026-10-01T09:00:00.000Z';
const UPDATED_AT = '2026-10-02T10:30:00.000Z';

const targets = [
  {
    organizationId: ORGANIZATION_ID,
    allowedRoles: [{ applicationId: APPLICATION_ID, roleId: ROLE_ID }],
    allowedClaimDefinitions: [
      { applicationId: APPLICATION_ID, claimDefinitionId: CLAIM_DEFINITION_ID },
    ],
  },
  {
    organizationId: SECOND_ORGANIZATION_ID,
    allowedRoles: [],
    allowedClaimDefinitions: [],
  },
];

const binding = {
  id: BINDING_ID,
  clientId: CLIENT_ID,
  serviceAccountId: SERVICE_ACCOUNT_ID,
  accountEmail: 'service-account@example.test',
  status: 'active' as const,
  targets,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const input = {
  accountEmail: 'service-account@example.test',
  targets,
};

const bindingStatuses: Array<'active' | 'revoked'> = ['active', 'revoked'];

/** Build a transport whose single request resolves the supplied response. */
function mockTransport(response: Partial<TransportResponse> = {}) {
  const request = vi.fn<RequestMock>().mockResolvedValue({
    status: 200,
    headers: {},
    body: undefined,
    ...response,
  });
  const transport = { request };
  return { request, transport };
}

/** Return the only request sent through a fixture transport. */
function onlyRequest(request: ReturnType<typeof mockTransport>['request']): TransportRequest {
  expect(request).toHaveBeenCalledTimes(1);
  const sent = request.mock.calls[0]?.[0];
  if (!sent) throw new Error('Expected exactly one transport request.');
  return sent;
}

/** Copy a fixture and remove one field, leaving a genuinely incomplete payload. */
function withoutField(source: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...source };
  delete copy[field];
  return copy;
}

/** Build a JSON response for the real Node transport wire assertions. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('service-account binding reads', () => {
  it.each(bindingStatuses)(
    'should GET and unwrap a complete %s binding',
    async (status) => {
      const returned = { ...binding, status };
      const { request, transport } = mockTransport({ body: { data: returned } });
      const clients = createClientsDomain(transport);

      const result = await clients.getServiceAccount(CLIENT_ID);

      expect(result).toEqual(returned);
      expect(result).not.toHaveProperty('data');

      const sent = onlyRequest(request);
      expect(sent).toEqual(
        expect.objectContaining({
          method: 'GET',
          path: `/clients/${CLIENT_ID}/service-account`,
        }),
      );
      expect(sent.body).toBeUndefined();
      expect(sent.params).toBeUndefined();
    },
  );

  it.each([
    'client/id?mode=admin#fragment',
    'client id with spaces',
    'client%2Fid',
    'client.ümlaut',
  ])('should encode the complete read identifier %s into one path segment', async (identifier) => {
    const { request, transport } = mockTransport({ body: { data: binding } });
    const clients = createClientsDomain(transport);

    await clients.getServiceAccount(identifier);

    expect(onlyRequest(request).path).toBe(
      `/clients/${encodeURIComponent(identifier)}/service-account`,
    );
  });
});

describe('service-account binding writes', () => {
  it('should PUT the optional email and exact targets, then unwrap the binding', async () => {
    const { request, transport } = mockTransport({
      status: 201,
      body: { data: binding },
    });
    const clients = createClientsDomain(transport);

    const result = await clients.setServiceAccount(CLIENT_ID, input);

    expect(result).toEqual(binding);

    const sent = onlyRequest(request);
    expect(sent).toEqual(
      expect.objectContaining({
        method: 'PUT',
        path: `/clients/${CLIENT_ID}/service-account`,
        body: input,
      }),
    );
    expect(sent.body).toStrictEqual(input);
    expect(sent.params).toBeUndefined();
  });

  it('should omit an absent email instead of inventing one', async () => {
    const { request, transport } = mockTransport({ body: { data: binding } });
    const clients = createClientsDomain(transport);
    const replacement = { targets };

    await clients.setServiceAccount(CLIENT_ID, replacement);

    const sent = onlyRequest(request);
    expect(sent.body).toEqual({ targets });
    expect(JSON.stringify(sent.body)).toBe(JSON.stringify({ targets }));
  });

  it.each([
    'client/id?mode=admin#fragment',
    'client id with spaces',
    'client%2Fid',
  ])('should encode the complete write identifier %s into one path segment', async (identifier) => {
    const { request, transport } = mockTransport({ body: { data: binding } });
    const clients = createClientsDomain(transport);

    await clients.setServiceAccount(identifier, input);

    expect(onlyRequest(request).path).toBe(
      `/clients/${encodeURIComponent(identifier)}/service-account`,
    );
  });
});

const dotSegmentOperations: Array<['read' | 'write' | 'revoke', '.' | '..']> = [
  ['read', '.'],
  ['read', '..'],
  ['write', '.'],
  ['write', '..'],
  ['revoke', '.'],
  ['revoke', '..'],
];

describe('service-account identifier safety', () => {
  it.each(dotSegmentOperations)(
    'should reject the %s dot-segment identifier %s before dispatch',
    async (operation, identifier) => {
      const { request, transport } = mockTransport();
      const clients = createClientsDomain(transport);

      const completion =
        operation === 'read'
          ? clients.getServiceAccount(identifier)
          : operation === 'write'
            ? clients.setServiceAccount(identifier, input)
            : clients.revokeServiceAccount(identifier);

      await expect(completion).rejects.toBeInstanceOf(PortaError);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('should not dispatch a normalizing dot segment through the real transport', async () => {
    const fetchRequest = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchRequest);
    const transport = createNodeTransport({
      baseUrl: 'https://porta.example.test',
      auth: { getToken: async () => 'test-only-placeholder' },
    });
    const clients = createClientsDomain(transport);

    await expect(clients.getServiceAccount('..')).rejects.toBeInstanceOf(PortaError);

    expect(fetchRequest).not.toHaveBeenCalled();
  });
});

const malformedBindingResponses: Array<[string, unknown]> = [
  ['a missing data envelope', binding],
  ['a null data payload', { data: null }],
  ['a scalar data payload', { data: 'active' }],
  ['an array data payload', { data: [] }],
  ['a missing binding id', { data: withoutField(binding, 'id') }],
  ['a numeric binding id', { data: { ...binding, id: 42 } }],
  ['a missing client reference', { data: withoutField(binding, 'clientId') }],
  ['a missing service-account reference', { data: withoutField(binding, 'serviceAccountId') }],
  ['a missing account email', { data: withoutField(binding, 'accountEmail') }],
  ['a null account email', { data: { ...binding, accountEmail: null } }],
  ['a missing status', { data: withoutField(binding, 'status') }],
  ['an unknown status', { data: { ...binding, status: 'disabled' } }],
  ['a missing target collection', { data: withoutField(binding, 'targets') }],
  ['a non-array target collection', { data: { ...binding, targets: {} } }],
  ['a null target', { data: { ...binding, targets: [null] } }],
  [
    'a valid target followed by an invalid target',
    {
      data: {
        ...binding,
        targets: [targets[0], withoutField(targets[1], 'organizationId')],
      },
    },
  ],
  [
    'a target without an organization',
    { data: { ...binding, targets: [withoutField(targets[0], 'organizationId')] } },
  ],
  [
    'a target without allowed roles',
    { data: { ...binding, targets: [withoutField(targets[0], 'allowedRoles')] } },
  ],
  [
    'a target without allowed claims',
    { data: { ...binding, targets: [withoutField(targets[0], 'allowedClaimDefinitions')] } },
  ],
  [
    'a non-array role collection',
    { data: { ...binding, targets: [{ ...targets[0], allowedRoles: 'none' }] } },
  ],
  [
    'a null role assignment',
    { data: { ...binding, targets: [{ ...targets[0], allowedRoles: [null] }] } },
  ],
  [
    'a null claim assignment',
    { data: { ...binding, targets: [{ ...targets[0], allowedClaimDefinitions: [null] }] } },
  ],
  [
    'a valid role followed by an invalid role',
    {
      data: {
        ...binding,
        targets: [
          {
            ...targets[0],
            allowedRoles: [targets[0].allowedRoles[0], { applicationId: APPLICATION_ID }],
          },
        ],
      },
    },
  ],
  [
    'a role assignment without an application',
    {
      data: {
        ...binding,
        targets: [{ ...targets[0], allowedRoles: [{ roleId: ROLE_ID }] }],
      },
    },
  ],
  [
    'a role assignment without a role',
    {
      data: {
        ...binding,
        targets: [{ ...targets[0], allowedRoles: [{ applicationId: APPLICATION_ID }] }],
      },
    },
  ],
  [
    'a claim assignment without an application',
    {
      data: {
        ...binding,
        targets: [
          {
            ...targets[0],
            allowedClaimDefinitions: [{ claimDefinitionId: CLAIM_DEFINITION_ID }],
          },
        ],
      },
    },
  ],
  [
    'a claim assignment without a claim definition',
    {
      data: {
        ...binding,
        targets: [
          {
            ...targets[0],
            allowedClaimDefinitions: [{ applicationId: APPLICATION_ID }],
          },
        ],
      },
    },
  ],
  ['a non-string creation time', { data: { ...binding, createdAt: 0 } }],
  ['a missing update time', { data: withoutField(binding, 'updatedAt') }],
];

const malformedWriteResponses: Array<[string, unknown]> = [
  ['a missing binding id', { data: withoutField(binding, 'id') }],
  [
    'a malformed target',
    {
      data: {
        ...binding,
        targets: [{ ...targets[0], allowedRoles: [{}] }],
      },
    },
  ],
  ['a missing data envelope', binding],
];

describe('service-account binding response validation', () => {
  it.each(malformedBindingResponses)(
    'should reject a successful read containing %s',
    async (_description, body) => {
      const { request, transport } = mockTransport({ body });
      const clients = createClientsDomain(transport);

      await expect(clients.getServiceAccount(CLIENT_ID)).rejects.toThrow(
        'Porta API returned an invalid response.',
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(malformedWriteResponses)(
    'should reject a successful write containing %s',
    async (_description, body) => {
      const { request, transport } = mockTransport({ status: 201, body });
      const clients = createClientsDomain(transport);

      await expect(clients.setServiceAccount(CLIENT_ID, input)).rejects.toThrow(
        'Porta API returned an invalid response.',
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
});

describe('service-account binding revocation', () => {
  it('should send exactly one bodyless DELETE and resolve undefined for 204', async () => {
    const { request, transport } = mockTransport({ status: 204 });
    const clients = createClientsDomain(transport);

    await expect(clients.revokeServiceAccount(CLIENT_ID)).resolves.toBeUndefined();

    const sent = onlyRequest(request);
    expect(sent).toEqual(
      expect.objectContaining({
        method: 'DELETE',
        path: `/clients/${CLIENT_ID}/service-account`,
      }),
    );
    expect(sent.body).toBeUndefined();
    expect(sent.params).toBeUndefined();
  });

  it('should not inspect the body of an empty 204 response', async () => {
    const response = {
      status: 204,
      headers: {},
      get body(): never {
        throw new Error('A 204 revocation response must not be unwrapped.');
      },
    } satisfies TransportResponse;
    const request = vi.fn<RequestMock>().mockResolvedValue(response);
    const clients = createClientsDomain({ request });

    await expect(clients.revokeServiceAccount(CLIENT_ID)).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('should encode the complete revoke identifier into one path segment', async () => {
    const identifier = 'client/id?mode=admin#fragment';
    const { request, transport } = mockTransport({ status: 204 });
    const clients = createClientsDomain(transport);

    await clients.revokeServiceAccount(identifier);

    expect(onlyRequest(request).path).toBe(
      `/clients/${encodeURIComponent(identifier)}/service-account`,
    );
  });
});

describe('service-account wire contract', () => {
  it('should use the existing admin-prefixed transport and exact HTTP headers', async () => {
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: binding }))
      .mockResolvedValueOnce(jsonResponse({ data: binding }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchRequest);
    const transport = createNodeTransport({
      baseUrl: 'https://porta.example.test',
      auth: { getToken: async () => 'test-only-placeholder' },
    });
    const clients = createClientsDomain(transport);

    await clients.getServiceAccount(CLIENT_ID);
    await clients.setServiceAccount(CLIENT_ID, input);
    await clients.revokeServiceAccount(CLIENT_ID);

    expect(fetchRequest).toHaveBeenCalledTimes(3);

    const [getUrl, getInit] = fetchRequest.mock.calls[0] ?? [];
    expect(getUrl).toBe(
      `https://porta.example.test/api/admin/clients/${CLIENT_ID}/service-account`,
    );
    expect(getInit?.method).toBe('GET');
    expect(getInit?.body).toBeUndefined();
    const getHeaders = new Headers(getInit?.headers);
    expect(getHeaders.get('accept')).toBe('application/json');
    expect(getHeaders.get('authorization')).toBe('Bearer test-only-placeholder');
    expect(getHeaders.get('content-type')).toBeNull();
    expect(getHeaders.get('if-match')).toBeNull();
    expect(getHeaders.get('x-porta-sdk-version')).toBeTruthy();

    const [putUrl, putInit] = fetchRequest.mock.calls[1] ?? [];
    expect(putUrl).toBe(
      `https://porta.example.test/api/admin/clients/${CLIENT_ID}/service-account`,
    );
    expect(putInit?.method).toBe('PUT');
    expect(JSON.parse(String(putInit?.body))).toEqual(input);
    const putHeaders = new Headers(putInit?.headers);
    expect(putHeaders.get('accept')).toBe('application/json');
    expect(putHeaders.get('authorization')).toBe('Bearer test-only-placeholder');
    expect(putHeaders.get('content-type')).toBe('application/json');
    expect(putHeaders.get('if-match')).toBeNull();

    const [deleteUrl, deleteInit] = fetchRequest.mock.calls[2] ?? [];
    expect(deleteUrl).toBe(
      `https://porta.example.test/api/admin/clients/${CLIENT_ID}/service-account`,
    );
    expect(deleteInit?.method).toBe('DELETE');
    expect(deleteInit?.body).toBeUndefined();
    const deleteHeaders = new Headers(deleteInit?.headers);
    expect(deleteHeaders.get('authorization')).toBe('Bearer test-only-placeholder');
    expect(deleteHeaders.get('content-type')).toBeNull();
    expect(deleteHeaders.get('if-match')).toBeNull();
  });

  it('should keep a hostile identifier inside one encoded admin path segment', async () => {
    const identifier = 'client/id?mode=admin#fragment';
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: binding }));
    vi.stubGlobal('fetch', fetchRequest);
    const transport = createNodeTransport({
      baseUrl: 'https://porta.example.test',
      auth: { getToken: async () => 'test-only-placeholder' },
    });
    const clients = createClientsDomain(transport);

    await clients.getServiceAccount(identifier);

    expect(fetchRequest).toHaveBeenCalledTimes(1);
    const [url] = fetchRequest.mock.calls[0] ?? [];
    const destination = new URL(String(url));
    expect(destination.pathname).toBe(
      `/api/admin/clients/${encodeURIComponent(identifier)}/service-account`,
    );
    expect(destination.search).toBe('');
    expect(destination.hash).toBe('');
  });
});


