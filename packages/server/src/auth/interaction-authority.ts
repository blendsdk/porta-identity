/** Live OIDC interaction authority used by delayed recovery work and public callbacks. */

import { z } from 'zod';

const interactionUidSchema = z.string().min(1).max(128);
const clientIdSchema = z.string().min(1).max(255);

/** Minimal interaction record returned by the provider-owned model. */
export interface ProviderInteractionRecord {
  /** Exact public interaction identifier. */
  readonly uid: string;
  /** Protocol parameters persisted by the provider. */
  readonly params: Record<string, unknown>;
}

/** Minimal provider model needed to resolve current interaction authority. */
export interface InteractionAuthorityProvider {
  /** Provider-owned short-lived interaction model. */
  readonly Interaction: {
    /** Find one unexpired interaction by its exact identifier. */
    find(uid: string): Promise<ProviderInteractionRecord | undefined>;
  };
}

/** Validated live interaction and client identity. */
export interface LiveInteractionAuthority {
  /** Exact identifier resolved by the provider. */
  readonly interactionUid: string;
  /** Current client identifier persisted in the interaction parameters. */
  readonly clientId: string;
}

/** Resolver shared by artifact issuance and callback verification. */
export interface InteractionAuthorityResolver {
  /** Resolve one exact unexpired interaction without trusting transport metadata. */
  resolve(interactionUid: string): Promise<LiveInteractionAuthority | null>;
}

/**
 * Build a fail-closed resolver over the provider's own interaction model.
 *
 * The resolver validates both the requested identifier and the identifier returned by storage.
 * This prevents malformed or stale transport input from being treated as durable authority.
 *
 * @param provider - Provider model which owns interaction lifetime and parameters.
 * @returns Resolver suitable for both delayed recovery work and public callbacks.
 */
export function createInteractionAuthorityResolver(
  provider: InteractionAuthorityProvider,
): InteractionAuthorityResolver {
  return {
    async resolve(interactionUid) {
      const parsedUid = interactionUidSchema.safeParse(interactionUid);
      if (!parsedUid.success) return null;
      const interaction = await provider.Interaction.find(parsedUid.data);
      if (!interaction || interaction.uid !== parsedUid.data) return null;
      const clientId = clientIdSchema.safeParse(interaction.params.client_id);
      if (!clientId.success) return null;
      return { interactionUid: parsedUid.data, clientId: clientId.data };
    },
  };
}
