import { isIP } from 'node:net';

import { environmentForManifest } from '../../fixtures/lifecycle-runtime.js';
import {
  createEndpointManifest,
  harnessCertificateIpSans,
} from '../../fixtures/lifecycle-validation.js';

import type {
  CrossSitePreflightRequirement,
  HumanAuthCrossSiteContract,
  HumanAuthCrossSiteObservation,
  HumanAuthCrossSiteRequest,
} from './human-auth-cross-site-contract.js';

const topologyRunId = '00000000-0000-4000-8000-000000000045';

/** Returns the browser site used for exact same-site and cross-site admission. */
function browserSite(url: URL): string {
  if (isIP(url.hostname) !== 0) return url.hostname;
  return url.hostname.split('.').slice(-2).join('.');
}

/** Evaluates one attacker-origin candidate without starting services or a browser. */
function evaluatePreflight(
  requirement: CrossSitePreflightRequirement,
  spaUrl: string,
): HumanAuthCrossSiteObservation['preflights'][number] {
  const attacker = new URL(requirement.attackerUrl);
  const spa = new URL(spaUrl);
  let rejection: string | null = null;
  if (isIP(attacker.hostname) === 4 && attacker.hostname !== '127.0.0.1') {
    rejection = 'attacker-url-is-not-ipv4-loopback';
  } else if (browserSite(attacker) === browserSite(spa)) {
    rejection = 'attacker-url-is-not-distinct-browser-site';
  } else if (attacker.hostname !== '127.0.0.1') {
    rejection = 'attacker-url-is-not-literal-ipv4-loopback';
  } else if (attacker.port !== spa.port) {
    rejection = 'attacker-url-does-not-own-spa-port';
  } else if (attacker.protocol !== 'https:') {
    rejection = 'attacker-url-is-not-https';
  }
  return Object.freeze({
    id: requirement.id,
    accepted: rejection === null,
    servicesStarted: false,
    browserStarted: false,
    rejection,
  });
}

/** Creates the deterministic topology adapter used before the live browser project begins. */
export function createHumanAuthCrossSiteContract(): HumanAuthCrossSiteContract {
  return Object.freeze({
    async observeBoundary(
      request: HumanAuthCrossSiteRequest,
    ): Promise<HumanAuthCrossSiteObservation> {
      const manifest = createEndpointManifest(
        {
          runId: topologyRunId,
          scenarioId: 'human-auth-cross-site',
          worktreePath: process.cwd(),
          environmentName: request.profile,
          candidateBasePort: 41_000,
          collisionRetries: 0,
        },
        0,
      );
      const environment = environmentForManifest(manifest);
      return Object.freeze({
        manifest: Object.freeze({
          portaUrl: manifest.urls.porta,
          spaUrl: manifest.urls.app,
          attackerUrl: manifest.urls.attacker,
          attackerPort: manifest.ports.app,
          spaPort: manifest.ports.app,
        }),
        certificateIpSans: harnessCertificateIpSans,
        preflights: Object.freeze(
          request.preflightCases.map((entry) => evaluatePreflight(entry, manifest.urls.app)),
        ),
        environmentAttackerUrl: environment.HARNESS_ATTACKER_URL ?? '',
      });
    },
  });
}
