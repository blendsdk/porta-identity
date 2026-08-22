/**
 * Service-backed collection point for the immutable enumeration-resistance specification.
 *
 * The integration project owns PostgreSQL, Redis, and MailHog setup before this module imports the
 * requirements-only oracle. The same oracle remains structure-only in the service-free unit lane.
 */
import '../../unit/security/enumeration-resistance.spec.test.js';
