import { rmSync } from 'node:fs';

import { activeEndpoints } from '../../fixtures/fixture-assurance.js';
import type { PackedSurfaceResult, PreparedPackedConsumer } from './model.js';
import {
  executePackedProtocolCliLogin,
  type PackedProtocolLoginSession,
} from './protocol-cli-login.js';
import { executePackedProtocolSdkRefresh } from './protocol-sdk-refresh.js';
import type {
  PackedProtocolCliLoginEvidence,
  PackedProtocolJourneyDriver,
  PackedProtocolSdkRefreshEvidence,
} from './protocol.js';

/** Live packed protocol driver bound to one active lifecycle-owned stack and consumer. */
export class PackedProtocolLiveDriver implements PackedProtocolJourneyDriver {
  private readonly endpoints = activeEndpoints();
  private loginSession: PackedProtocolLoginSession | undefined;

  /** Creates a driver for one already prepared local consumer. */
  public constructor(
    private readonly consumer: PreparedPackedConsumer,
    private readonly surfaces: PackedSurfaceResult,
  ) {}

  /** Runs the actual packed CLI with browser-assisted manual callback completion. */
  public async loginWithCli(): Promise<PackedProtocolCliLoginEvidence> {
    if (this.loginSession !== undefined) throw new Error('packed CLI login already ran');
    this.loginSession = await executePackedProtocolCliLogin(
      this.consumer,
      this.surfaces,
      this.endpoints,
    );
    return this.loginSession.evidence;
  }

  /** Refreshes through the installed SDK and independently retries the consumed token. */
  public async refreshWithSdk(): Promise<PackedProtocolSdkRefreshEvidence> {
    if (this.loginSession === undefined) throw new Error('packed CLI login must run first');
    return executePackedProtocolSdkRefresh(this.consumer, this.endpoints, this.loginSession);
  }

  /** Removes the owner-only credential copy retained between the two public-client journeys. */
  public dispose(): void {
    if (this.loginSession !== undefined) {
      rmSync(this.loginSession.credentialsPath, { force: true });
      this.loginSession = undefined;
    }
  }
}

/** Creates the live driver without exposing its retained secret-bearing session. */
export function createPackedProtocolLiveDriver(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
): PackedProtocolLiveDriver {
  return new PackedProtocolLiveDriver(consumer, surfaces);
}
