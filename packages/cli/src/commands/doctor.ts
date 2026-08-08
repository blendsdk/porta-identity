/**
 * CLI doctor command — diagnostic checks for the CLI environment.
 *
 * Runs a series of checks to verify the CLI setup is correct:
 *   1. Node.js version (>= 22.0.0 required)
 *   2. Credentials file exists and is readable
 *   3. Token validity (not expired)
 *   4. Server reachability (health endpoint)
 *   5. Admin metadata endpoint accessible
 *
 * Useful for troubleshooting authentication or connectivity issues.
 *
 * Usage:
 *   porta doctor          # Run all diagnostic checks
 *   porta doctor --json   # JSON output (machine-readable)
 *
 * @module commands/doctor
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import {
  loadCredentials,
  isTokenExpired,
  getCredentialsPath,
  hasCredentials,
} from '../credential-store.js';
import { fetchHealthStatus, fetchAdminMetadata } from '../auth/metadata.js';
import { printJson, success, warn, error as printError } from '../output.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a single diagnostic check */
interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

// ---------------------------------------------------------------------------
// Diagnostic Checks
// ---------------------------------------------------------------------------

/**
 * Check Node.js version meets the minimum requirement.
 */
function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  if (major >= 22) {
    return { name: 'Node.js version', status: 'pass', message: `${version} (>= 22 required)` };
  }
  return {
    name: 'Node.js version',
    status: 'fail',
    message: `${version} — Node.js >= 22.0.0 is required`,
  };
}

/**
 * Check credential file existence and validity.
 */
function checkCredentials(): CheckResult {
  const path = getCredentialsPath();

  if (!hasCredentials()) {
    return {
      name: 'Credentials',
      status: 'warn',
      message: `Not found at ${path}. Run "porta login" to authenticate.`,
    };
  }

  const creds = loadCredentials();
  if (!creds) {
    return {
      name: 'Credentials',
      status: 'fail',
      message: `File exists at ${path} but cannot be parsed. Try "porta logout" then "porta login".`,
    };
  }

  return {
    name: 'Credentials',
    status: 'pass',
    message: `Found at ${path} (user: ${creds.userInfo.email || creds.userInfo.sub})`,
  };
}

/**
 * Check token expiry status.
 */
function checkTokenExpiry(): CheckResult {
  const creds = loadCredentials();
  if (!creds) {
    return { name: 'Token validity', status: 'warn', message: 'No credentials — skipped' };
  }

  if (isTokenExpired(creds)) {
    return {
      name: 'Token validity',
      status: 'warn',
      message: `Expired at ${creds.expiresAt}. Run "porta login" to re-authenticate.`,
    };
  }

  return {
    name: 'Token validity',
    status: 'pass',
    message: `Valid until ${creds.expiresAt}`,
  };
}

/**
 * Check server reachability via health endpoint.
 */
async function checkServerHealth(serverUrl: string | undefined): Promise<CheckResult> {
  if (!serverUrl) {
    return {
      name: 'Server health',
      status: 'warn',
      message: 'No server configured — skipped',
    };
  }

  const health = await fetchHealthStatus(serverUrl);
  if (!health) {
    return {
      name: 'Server health',
      status: 'fail',
      message: `Cannot reach ${serverUrl}/health`,
    };
  }

  if (health.status === 'ok') {
    const services = health.services
      ? Object.entries(health.services)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : '';
    return {
      name: 'Server health',
      status: 'pass',
      message: `${serverUrl} — OK${services ? ` (${services})` : ''}`,
    };
  }

  return {
    name: 'Server health',
    status: 'warn',
    message: `${serverUrl} — status: ${health.status}`,
  };
}

/**
 * Check admin metadata endpoint accessibility.
 */
async function checkMetadata(serverUrl: string | undefined): Promise<CheckResult> {
  if (!serverUrl) {
    return {
      name: 'Admin metadata',
      status: 'warn',
      message: 'No server configured — skipped',
    };
  }

  try {
    const metadata = await fetchAdminMetadata(serverUrl);
    return {
      name: 'Admin metadata',
      status: 'pass',
      message: `Org: ${metadata.orgSlug}, Client: ${metadata.clientId.slice(0, 8)}...`,
    };
  } catch (err) {
    return {
      name: 'Admin metadata',
      status: 'fail',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Command Definition
// ---------------------------------------------------------------------------

/**
 * The doctor command module — runs diagnostic checks.
 */
export const doctorCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'doctor',
  describe: 'Run diagnostic checks on CLI configuration',

  handler: async (argv) => {
    // Handle --insecure flag before any HTTP calls
    if (argv.insecure) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    // Resolve server URL for network checks
    const creds = loadCredentials();
    const serverUrl = argv.server || process.env.PORTA_SERVER || creds?.server;

    // Run all checks
    const results: CheckResult[] = [
      checkNodeVersion(),
      checkCredentials(),
      checkTokenExpiry(),
      await checkServerHealth(serverUrl),
      await checkMetadata(serverUrl),
    ];

    // Output
    if (argv.json) {
      printJson(results);
    } else {
      console.log('\nPorta CLI Diagnostics\n');

      for (const check of results) {
        const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
        console.log(`  ${icon} ${check.name}: ${check.message}`);
      }

      console.log('');

      const failures = results.filter((r) => r.status === 'fail');
      const warnings = results.filter((r) => r.status === 'warn');

      if (failures.length > 0) {
        printError(`${failures.length} check(s) failed`);
      } else if (warnings.length > 0) {
        warn(`All checks passed with ${warnings.length} warning(s)`);
      } else {
        success('All checks passed');
      }
    }

    // Exit with failure if any check failed
    const hasFailure = results.some((r) => r.status === 'fail');
    process.exit(hasFailure ? 1 : 0);
  },
};
