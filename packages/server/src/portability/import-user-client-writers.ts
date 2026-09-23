/** Transaction-bound user, relationship, client, and credential import writes. */

import { createHash, randomUUID } from 'node:crypto';
import { generateSecret, hashSecret } from '../clients/crypto.js';
import { getPool } from '../lib/database.js';
import type {
  PortabilityClient,
  PortabilityCredential,
  PortabilityJsonValue,
  PortabilityUser,
} from './types.js';

/**
 * Add six UTC calendar months while clamping month-end to the target month's last day.
 *
 * @param now - Credential creation time
 * @returns Exact UTC credential expiry time
 */
function importedSecretExpiry(now: Date): Date {
  const targetMonth = now.getUTCMonth() + 6;
  const targetYear = now.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

/**
 * Insert or update one portable user without touching credentials or automatic lock fields.
 *
 * @param record - Strict portable user fields
 * @param organizationId - Resolved parent organization identifier
 * @param destinationId - Existing identifier for update, or null for create
 * @returns Authoritative destination user identifier
 */
export async function writePortabilityUser(
  record: PortabilityUser,
  organizationId: string,
  destinationId: string | null,
): Promise<string> {
  const authoritativeId = destinationId ?? randomUUID();
  const profileValues = [
    record.email_verified,
    record.given_name,
    record.family_name,
    record.middle_name,
    record.nickname,
    record.preferred_username,
    record.profile_url,
    record.picture_url,
    record.website_url,
    record.gender,
    record.birthdate,
    record.zoneinfo,
    record.locale,
    record.phone_number,
    record.phone_number_verified,
    record.address_street,
    record.address_locality,
    record.address_region,
    record.address_postal_code,
    record.address_country,
    record.status,
  ];
  const result =
    destinationId === null
      ? await getPool().query<{ id: string }>(
          `INSERT INTO users
           (id, organization_id, email, email_verified, given_name, family_name, middle_name,
            nickname, preferred_username, profile_url, picture_url, website_url, gender,
            birthdate, zoneinfo, locale, phone_number, phone_number_verified, address_street,
            address_locality, address_region, address_postal_code, address_country, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING id`,
          [authoritativeId, organizationId, record.email, ...profileValues],
        )
      : await getPool().query<{ id: string }>(
          `UPDATE users SET email_verified = $1, given_name = $2, family_name = $3,
                middle_name = $4, nickname = $5, preferred_username = $6, profile_url = $7,
                picture_url = $8, website_url = $9, gender = $10, birthdate = $11,
                zoneinfo = $12, locale = $13, phone_number = $14,
                phone_number_verified = $15, address_street = $16, address_locality = $17,
                address_region = $18, address_postal_code = $19, address_country = $20,
                status = CASE WHEN status = 'locked' AND $21 = 'active' THEN status ELSE $21 END,
                updated_at = NOW() WHERE id = $22 RETURNING id`,
          [...profileValues, destinationId],
        );
  return result.rows[0]?.id ?? authoritativeId;
}

/**
 * Add one listed user-role assignment without changing destination-only assignments.
 *
 * @param userId - Resolved destination user identifier
 * @param roleId - Resolved destination role identifier
 */
export async function writePortabilityUserRole(userId: string, roleId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     VALUES ($1, $2, NULL) ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId],
  );
}

/**
 * Insert or update one listed custom-claim value.
 *
 * @param userId - Resolved destination user identifier
 * @param claimId - Resolved destination claim-definition identifier
 * @param value - Portable JSON claim value
 */
export async function writePortabilityUserClaimValue(
  userId: string,
  claimId: string,
  value: PortabilityJsonValue,
): Promise<void> {
  await getPool().query(
    `INSERT INTO custom_claim_values (user_id, claim_id, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, claim_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, claimId, JSON.stringify(value)],
  );
}

/**
 * Insert or update one OIDC client and create one credential only for a new confidential client.
 *
 * @param record - Strict portable client fields
 * @param organizationId - Resolved owner organization identifier
 * @param applicationId - Resolved owner application identifier
 * @param destinationId - Existing identifier for update, or null for create
 * @returns Destination identifier and optional one-time credential
 */
export async function writePortabilityClient(
  record: PortabilityClient,
  organizationId: string,
  applicationId: string,
  destinationId: string | null,
): Promise<{ readonly id: string; readonly credential?: PortabilityCredential }> {
  const authoritativeId = destinationId ?? randomUUID();
  const mutableValues = [
    record.name,
    record.status,
    record.grant_types,
    record.response_types,
    record.scope,
    record.login_methods,
    record.token_endpoint_auth_method,
    record.redirect_uris,
    record.post_logout_redirect_uris,
    record.allowed_origins,
    record.require_pkce,
  ];
  if (destinationId === null) {
    await getPool().query(
      `INSERT INTO clients
         (id, client_id, organization_id, application_id, client_name, client_type,
          application_type, status, grant_types, response_types, scope, login_methods,
          token_endpoint_auth_method, redirect_uris, post_logout_redirect_uris,
          allowed_origins, require_pkce)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        authoritativeId,
        record.client_id,
        organizationId,
        applicationId,
        record.name,
        record.client_type,
        record.application_type,
        record.status,
        record.grant_types,
        record.response_types,
        record.scope,
        record.login_methods,
        record.token_endpoint_auth_method,
        record.redirect_uris,
        record.post_logout_redirect_uris,
        record.allowed_origins,
        record.require_pkce,
      ],
    );
  } else {
    await getPool().query(
      `UPDATE clients SET client_name = $1, status = $2, grant_types = $3,
              response_types = $4, scope = $5, login_methods = $6,
              token_endpoint_auth_method = $7, redirect_uris = $8,
              post_logout_redirect_uris = $9, allowed_origins = $10, require_pkce = $11,
              updated_at = NOW() WHERE id = $12`,
      [...mutableValues, destinationId],
    );
  }

  if (destinationId !== null || record.client_type !== 'confidential') {
    return { id: authoritativeId };
  }
  const secret = generateSecret();
  const secretHash = await hashSecret(secret);
  const secretSha256 = createHash('sha256').update(secret).digest('hex');
  const expiresAt = importedSecretExpiry(new Date());
  await getPool().query(
    `INSERT INTO client_secrets
       (client_id, secret_hash, secret_sha256, label, expires_at)
     VALUES ($1, $2, $3, 'Imported', $4)`,
    [authoritativeId, secretHash, secretSha256, expiresAt],
  );
  return {
    id: authoritativeId,
    credential: {
      client_id: record.client_id,
      label: 'Imported',
      secret,
      expires_at: expiresAt.toISOString(),
    },
  };
}
