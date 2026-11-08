import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setEmailTransport } from '../../../src/auth/index.js';
import type { EmailTransport } from '../../../src/auth/index.js';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import {
  revokeServiceAccount,
  setServiceAccount,
} from '../../../src/service-accounts/index.js';
import {
  createLifecycleFixture,
  lifecycleSecurityFingerprint,
  withRejectedLifecycleAudit,
} from './lifecycle-fixtures.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';

// Dedicated noninteractive accounts never receive welcome, recovery or other lifecycle mail.
describe('service-account lifecycle email delivery', () => {
  let fixture: LifecycleFixture;
  let deliveryCount: number;

  beforeEach(async () => {
    fixture = await createLifecycleFixture();
    deliveryCount = 0;
    // Count calls at the real external boundary without retaining addresses or message content.
    const transport: EmailTransport = {
      send() {
        deliveryCount += 1;
        return Promise.resolve({
          messageId: 'synthetic-lifecycle-delivery',
          accepted: [],
          rejected: [],
        });
      },
    };
    setEmailTransport(transport);
  });

  afterEach(() => {
    setEmailTransport(null);
  });

  it('should send no mail when first provisioning retires the existing client credentials', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
    }, fixture.actor);
    expect(deliveryCount).toBe(0);
  });

  it('should send no mail when explicit restoration reactivates the same permanent owner', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
    }, fixture.actor);
    expect(deliveryCount).toBe(0);
    await revokeServiceAccount(fixture.client.id, fixture.actor);
    await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    await setServiceAccount(fixture.client.id, {
      targets: [fixture.otherTarget],
    }, fixture.actor);
    expect(deliveryCount).toBe(0);
  });

  it('should send no mail and preserve security state when first provisioning cannot persist its audit', async () => {
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(setServiceAccount(fixture.client.id, {
        accountEmail: fixture.accountEmail,
        targets: [fixture.target],
      }, fixture.actor)).rejects.toThrow();
    });
    expect(deliveryCount).toBe(0);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });

  it('should send no mail and preserve revoked ownership when restoration cannot persist its audit', async () => {
    await setServiceAccount(fixture.client.id, {
      accountEmail: fixture.accountEmail,
      targets: [fixture.target],
    }, fixture.actor);
    await revokeServiceAccount(fixture.client.id, fixture.actor);
    await generateAndStore(fixture.client.id, undefined, fixture.actor.id);
    expect(deliveryCount).toBe(0);
    const before = await lifecycleSecurityFingerprint();
    await withRejectedLifecycleAudit(async () => {
      await expect(setServiceAccount(fixture.client.id, {
        targets: [fixture.otherTarget],
      }, fixture.actor)).rejects.toThrow();
    });
    expect(deliveryCount).toBe(0);
    expect(await lifecycleSecurityFingerprint()).toBe(before);
  });
});
