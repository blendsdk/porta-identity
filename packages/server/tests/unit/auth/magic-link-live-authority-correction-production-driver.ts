import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProductionMagicLinkTenantBindingDriver } from './magic-link-tenant-binding-production-driver.js';
import type { MagicLinkPublicBoundary } from './magic-link-tenant-binding-production-driver.js';
import type {
  LiveInteractionAuthorityState,
  MagicLinkLiveAuthorityCorrectionDriver,
  MagicLinkLiveAuthorityFixture,
  MagicLinkLiveAuthorityObservation,
  MagicLinkLiveAuthorityOutcome,
} from './magic-link-live-authority-correction-contract.js';

const LOG_PROBE_PATH = fileURLToPath(
  new URL('./magic-link-operational-log-probe.ts', import.meta.url),
);
const MAX_LOG_BYTES = 64 * 1024;

/**
 * Execute the production logger child and retain only its bounded serialized output.
 *
 * @param fixture - Protected canaries which the logger must redact.
 * @returns Bounded serialized production log records.
 */
async function captureOperationalOutput(
  fixture: MagicLinkLiveAuthorityFixture,
): Promise<readonly string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', LOG_PROBE_PATH], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        PORTA_PROBE_ARTIFACT: fixture.artifact,
        PORTA_PROBE_INTERACTION: fixture.interactionUid,
        PORTA_PROBE_EMAIL: fixture.email,
        PORTA_PROBE_USER: fixture.userId,
        PORTA_PROBE_ORGANIZATION: fixture.organizationId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output) > MAX_LOG_BYTES) child.kill('SIGTERM');
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0 || Buffer.byteLength(output) > MAX_LOG_BYTES) {
        reject(new Error('Production logger probe did not complete safely'));
        return;
      }
      resolve(output.split(/\r?\n/u).filter((line) => line.length > 0));
    });
  });
}

/**
 * Convert the retained authority fixture into the correction specification's stable shape.
 *
 * @param fixture - Service-backed tenant, account, and artifact authority.
 * @returns Stable observation fixture consumed by the immutable specification.
 */
function mapFixture(
  fixture: Awaited<ReturnType<ProductionMagicLinkTenantBindingDriver['reset']>>,
): MagicLinkLiveAuthorityFixture {
  return {
    organizationId: fixture.organizationId,
    foreignOrganizationId: fixture.foreignOrganizationId,
    userId: fixture.userId,
    email: fixture.email,
    artifact: fixture.tokenValue,
    interactionUid: fixture.interactionUid,
  };
}

/** Service-backed correction driver reusing the retained public-action test harness. */
export class ProductionMagicLinkLiveAuthorityCorrectionDriver implements MagicLinkLiveAuthorityCorrectionDriver {
  private readonly authority: ProductionMagicLinkTenantBindingDriver;
  private fixture: MagicLinkLiveAuthorityFixture | null = null;
  private operationalOutput: readonly string[] = [];
  private standalone = false;

  /** Create a correction driver over one real Koa/provider boundary. */
  public constructor(publicBoundary: MagicLinkPublicBoundary) {
    this.authority = new ProductionMagicLinkTenantBindingDriver(publicBoundary);
  }

  /** Arrange one interaction-bound artifact with matching current client authority. */
  public async resetBound(): Promise<MagicLinkLiveAuthorityFixture> {
    this.operationalOutput = [];
    this.standalone = false;
    this.fixture = mapFixture(await this.authority.reset({ mode: 'interaction-bound' }));
    return this.fixture;
  }

  /** Replace the provider-owned interaction mapping without changing persisted token authority. */
  public async setLiveAuthority(state: LiveInteractionAuthorityState): Promise<void> {
    await this.authority.setLiveAuthority(state);
  }

  /** Present the current artifact through the real public callback handler. */
  public async present(input?: {
    readonly socketPeer?: string;
  }): Promise<MagicLinkLiveAuthorityOutcome> {
    const fixture = this.requireFixture();
    const outcome = await this.authority.present({
      routeOrganizationId: fixture.organizationId,
      ...(!this.standalone ? { interactionUid: fixture.interactionUid } : {}),
      ...(input?.socketPeer === undefined ? {} : { socketPeer: input.socketPeer }),
    });
    return {
      accepted: outcome.accepted,
      responseShape: outcome.responseShape,
      genericFailure: outcome.genericError,
    };
  }

  /** Arrange one absent artifact while retaining its protected callback identity. */
  public async resetCallbackLimit(): Promise<MagicLinkLiveAuthorityFixture> {
    const fixture = await this.resetBound();
    await this.authority.removeArtifact();
    return fixture;
  }

  /** Activate the previously absent artifact after callback attempts have consumed the budget. */
  public async activateCallbackArtifact(): Promise<void> {
    await this.authority.activateArtifact();
  }

  /** Force the route-owned callback limiter to fail before artifact lookup. */
  public async disableCallbackLimiter(): Promise<void> {
    this.authority.setCallbackLimiterUnavailable(true);
  }

  /** Deliver a standalone artifact with the production worker and intended mailbox. */
  public async deliverStandalone(): Promise<MagicLinkLiveAuthorityFixture> {
    this.operationalOutput = [];
    const delivered = await this.authority.deliverStandaloneArtifact();
    this.standalone = true;
    this.fixture = mapFixture(delivered);
    return this.fixture;
  }

  /** Serialize real production request and logger boundaries with protected probe values. */
  public async exerciseOperationalFailures(): Promise<void> {
    this.operationalOutput = await captureOperationalOutput(this.requireFixture());
  }

  /** Read durable, Redis, mailbox, and serialized logger state independently. */
  public async observe(): Promise<MagicLinkLiveAuthorityObservation> {
    this.requireFixture();
    const state = await this.authority.observe();
    const continuationWrites = state.continuationWrites;
    return {
      artifactConsumptions: state.artifactConsumptionCount,
      accountMutations: state.userMutations,
      successfulAuditEvents: state.successfulAuditEvents,
      continuationWrites,
      intendedDeliveries: state.emailMutations,
      deliveredUrl: this.authority.readDeliveredUrl(),
      operationalOutput: [...state.operationalOutput, ...this.operationalOutput],
    };
  }

  /** Return the arranged fixture or fail before touching shared services. */
  private requireFixture(): MagicLinkLiveAuthorityFixture {
    if (!this.fixture) throw new Error('Magic-link correction fixture is not initialized');
    return this.fixture;
  }
}
