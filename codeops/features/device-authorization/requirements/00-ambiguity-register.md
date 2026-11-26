# Ambiguity Register: Device Authorization

> **Status**: ✅ GATE PASSED — all 36 items resolved
> **Last Updated**: 2026-11-24
> **CodeOps Artifact Schema**: 1

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|---|---|---|---|---|
| AR-1 | Scope | Who may use device login in v1? | Generic OIDC + CLI / generic OIDC only / CLI only | Generic OIDC grant for registered clients plus the Porta CLI as first consumer | ✅ Resolved |
| AR-2 | Scope | How is the feature enabled and authorized? | Per-client grant / organization opt-in + grant / global flag + grant | Server-wide capability; explicit per-client device grant; no new organization or global setting | ✅ Resolved |
| AR-3 | UX & presentation | What does the user see when approving a device? | Branded Porta pages / provider default pages / branded minimal page | Branded, localized Porta pages showing client, code, requested scopes and an abort action | ✅ Resolved |
| AR-4 | Data & state | May a device-only client omit redirect URIs? | Conditional zero redirect URIs / always require one / new application type | Allow zero only when the authorization-code grant is absent and the device grant is present | ✅ Resolved |
| AR-5 | UX & presentation | How does the CLI use device login? | Explicit `--device-code` flag / auto in headless mode / no CLI change | Explicit `porta login --device-code`; existing browser and pasted-callback modes unchanged | ✅ Resolved |
| AR-6 | Security & compliance | Are device lifetime and limits configurable? | Fixed constants / global settings / TTL only | Fixed secure constants: 10-minute code TTL, 15-minute expired retention, approved fixed limits | ✅ Resolved |
| AR-7 | Naming & terminology | Which CodeOps feature owns the work? | `device-authorization` / `device-login` / `oidc-device-flow` | `device-authorization` | ✅ Resolved |
| AR-8 | Integration points | How is the device grant represented in contracts? | Full URN / friendly `device_code` / accept both | Full URN `urn:ietf:params:oauth:grant-type:device_code` everywhere | ✅ Resolved |
| AR-9 | Integration points | How do existing installations enable the built-in admin CLI client? | Explicit enablement / automatic migration / separate device client | New `porta init` includes it; existing installations require an explicit admin update with clear CLI remediation | ✅ Resolved |
| AR-10 | Security & compliance | What device details are stored and shown? | None / user agent only / provider default IP+UA | Store and show neither IP address nor user agent | ✅ Resolved |
| AR-11 | Security & compliance | Are device approvals and denials audited? | Dedicated events / rely on login/consent / no new audit | Dedicated `user.device.authorized` and `user.device.denied` events without codes | ✅ Resolved |
| AR-12 | Behavioral | Do new clients receive the device grant by default? | Explicit opt-in only / default for native / default for public | Explicit opt-in only; never in `getDefaultGrantTypes` | ✅ Resolved |
| AR-13 | Security & compliance | May device approval reuse an existing browser session, or must it force a fresh login? | Reuse SSO / always force login / force login only for untrusted clients | Reuse SSO; code entry plus the branded confirmation page is the explicit approval gesture | ✅ Resolved |
| AR-14 | Behavioral | Does device approval reuse the existing `requireConsent` policy or always show a consent page? | Reuse policy / always consent / consent for external clients only | Reuse the existing `requireConsent` policy; the branded confirmation page shows scopes for trusted clients | ✅ Resolved |
| AR-15 | UX & presentation | How much detail does the user-code page reveal for unknown, expired, used or aborted codes? | Generic message for all / distinguish expired / distinguish all states | One generic "invalid or expired" message for every invalid state | ✅ Resolved |
| AR-16 | Integration points | Which administration surfaces must ship in v1? | API+SDK+CLI+Admin terminal+portability+docs / API+SDK+CLI / API only | Full contract consistency: Admin API, SDK, `porta client` flags, Admin terminal Protocol and registration, portability, docs | ✅ Resolved |
| AR-17 | Integration points | How do CLI client commands expose grant changes and device-only clients? | Add `--grant-types` and optional redirect URIs / Admin terminal only / dedicated device command | Add `--grant-types` to create/update and make redirect URIs optional for device-only clients | ✅ Resolved |
| AR-18 | Data & state | How does portability handle a newer export containing the device grant? | Document minimum version / manifest version negotiation / ignore unknown grants | Strict same-version import; document the compatibility boundary; keep the existing manifest version | ✅ Resolved |
| AR-19 | Data & state | What validation applies to device-only clients beyond zero redirect URIs? | Keep public PKCE invariant, use native type, support public+confidential / relax PKCE / device-only public clients only | Keep public PKCE invariant, document native as the expected type without enforcing it, support public and confidential clients | ✅ Resolved |
| AR-20 | Behavioral | What are the exact token-endpoint polling errors and `interval` behavior? | RFC 8628 errors + advertised interval / RFC errors without interval / generic invalid_grant | Full RFC 8628: advertise `interval: 5`; return 400 `authorization_pending`, `slow_down`, `access_denied`, `expired_token`; `invalid_grant` for replay or client mismatch; hard 429 `rate_limit_exceeded` for abuse | ✅ Resolved |
| AR-21 | Security & compliance | How are approved device codes bound to session, grant, client, user and organization authority? | Full authority binding with revocation / bind only until approval / no extra binding | Full authority binding: exchange fails after revocation or deactivation; logout and connected-app revocation remove approved codes | ✅ Resolved |
| AR-22 | Security & compliance | What metadata and category do device audit and rate-limit events use? | Dedicated auth events with client/org/user/scopes / generic security event / no metadata | Authentication events `user.device.authorized`/`user.device.denied`; security events `rate_limit.device_code`/`rate_limit.device_user_code`; never codes | ✅ Resolved |
| AR-23 | UX & presentation | How do deployments with a custom hosted UI get device pages? | Provider-rendered Porta pages with documented limitation / custom UI hook / no custom UI support | Provider-rendered Porta pages for code entry, confirmation and success; host UI keeps login and consent; document the boundary | ✅ Resolved |
| AR-24 | UX & presentation | Which user-code alphabet, mask and normalization are used? | Keep upstream base-20 `****-****` / digits only / custom alphabet | Keep the upstream eight-character base-20 alphabet, `****-****` mask and normalization | ✅ Resolved |
| AR-25 | UX & presentation | What does the approval success page show and how does it end? | Static success page with client name / auto-close attempt / redirect to client | Static branded success page showing the client name and instructing the user to return to the device | ✅ Resolved |
| AR-26 | UX & presentation | Should connected-apps list distinguish device grants from browser grants? | No distinction / add a source label / add a dedicated filter | No distinction; device grants appear and revoke exactly like any other grant | ✅ Resolved |
| AR-27 | Security & compliance | What response does the user-code limiter return, and how is it keyed? | 429 generic page keyed by IP+session / re-render generic error / hard lockout | 429 with `Retry-After` and a generic page, keyed by IP plus the provider session UID when available | ✅ Resolved |
| AR-28 | Integration points | How does CLI device login interact with refresh tokens, credential storage and existing flags? | Reuse credential store and refresh behavior; `--device-code` implies no browser / separate credential profile / no refresh | Reuse the existing credential store and refresh behavior; `--device-code` implies no browser; print URL and code only; clear remediation when the grant is missing | ✅ Resolved |
| AR-29 | Security & compliance | How is cross-tenant device verification prevented? | Reject mismatches generically / rely on provider behavior / allow with warning | Every verification and resume request must match the DeviceCode client's organization and the URL organization; generic 404 on mismatch; pentest required | ✅ Resolved |
| AR-30 | Security & compliance | How are device and user codes protected in logs and audit? | Redact both / redact only the device code / no change | Add `device_code` and `user_code` to logger redaction; never include either in audit or log metadata | ✅ Resolved |
| AR-31 | Edge cases | How is a user-code collision handled? | Enforce uniqueness fail closed / accept upstream probabilistic uniqueness / custom retry generation | Enforce uniqueness with a partial unique index; a rare collision fails the new request closed with a retryable error | ✅ Resolved |
| AR-32 | Integration points | How do older SDK and CLI readers handle a client containing the device grant? | Lockstep upgrade with documented strict rejection / forward-compatible readers / API version negotiation | Lockstep upgrade; older readers strictly reject device-enabled clients; release notes and docs state the boundary | ✅ Resolved |
| AR-33 | Scope | How should the requirements be decomposed into RDs? | Five RDs by concern / four RDs merging CLI / three RDs merging provider+UX and client+CLI | Five RDs: provider; tenant-safe verification; client contracts; CLI; security operations and assurance | ✅ Resolved |
| AR-34 | Scope | Should the feature ship as one phased plan or separate plans? | One phased plan / separate plans per RD / MVP-first with follow-up | One phased plan with phases matching the RDs | ✅ Resolved |
| AR-35 | Security & compliance | How does the CLI verify a device-flow ID token when the device authorization request cannot carry an OIDC nonce? | Device-specific verification without nonce / custom nonce parameter / skip verification | Verify without nonce: ES256 signature, issuer, audience, iat, exp and subject; rely on the single-use device code and TLS | ✅ Resolved |
| AR-36 | Security & compliance | How are per-key budgets protected when an attacker rotates client IDs or provider sessions? | Add per-IP aggregates / primary keys only / IP-only keys | Add per-IP aggregates: user-code 30/10 minutes per IP and device authorization 30/5 minutes per IP | ✅ Resolved |

## Resolution Notes

**AR-1:** A protocol-only implementation would leave the first consumer for a later cycle; a
CLI-only implementation would not make Porta a general device-flow identity provider. The user
chose both, with the CLI as the first consumer.

**AR-2:** The per-client grant is the authorization boundary. No organization or global switch is
added. The feature is compiled in server-wide, and a client without the grant cannot start a device
authorization request.

**AR-3:** The approval experience must match Porta's login and consent surfaces: organization
branding, `en`/`nl` localization, client name, user code, requested scopes, and an explicit abort.
The exact success-page behavior remains AR-25.

**AR-4:** A device-only client does not use a redirect URI. The exception is deliberately narrow:
the authorization-code grant must be absent and the device grant present. All other clients keep
the existing one-to-ten redirect URI rule. The exact PKCE and application-type details remain
AR-19.

**AR-5:** An explicit flag keeps the existing browser and pasted-callback behavior predictable.
Automatic headless switching was rejected because it silently changes the login mechanism.

**AR-6:** The approved policy is: device authorization 10 requests/5 minutes per IP+client; user
code 10 failed attempts/10 minutes per IP; device polling allowed at 5-second intervals for the
full 10-minute lifetime; `slow_down` for faster polling; hard 429 at 180 requests/15 minutes per
client+IP; device-grant per-IP aggregate 600 requests/5 minutes; DeviceCode TTL 10 minutes; expired
row retention 15 minutes. No new global settings.

**AR-7:** The folder name follows the protocol name and is independent of the user-facing label
"device login".

**AR-8:** The provider's client metadata and `grantTypeAllowed()` use the full URN. Storing the URN
everywhere avoids a translation layer and keeps portability exports directly consumable by the
provider. The Admin surfaces present a human-readable label without changing the stored value.

**AR-9:** No silent grant widening. New installations add the grant to the built-in admin CLI client
during `porta init`; existing installations require an explicit Admin API/SDK/CLI/Admin terminal
update. `porta login --device-code` must fail with actionable remediation when the grant is absent.

**AR-10:** The provider's default `deviceInfo` stores IP and user agent. Porta overrides it to store
neither. The approval page uses client name, code and scopes as the recognizable context.

**AR-11:** Device approval is an authentication event. The dedicated events carry organization,
user, client and scopes, never the device code or user code. The final metadata contract remains
AR-22.

**AR-12:** A new client receives only the existing grant defaults. The device grant must be selected
explicitly, even for native clients.

**AR-13:** Device approval follows the same session model as other OIDC flows. The user must
possess the user code and complete the branded confirmation; forcing a second login would add a
device-specific authentication policy without a clear threat model. The shared-browser risk is the
same as approving any OAuth client from an unlocked session and is documented as an operational
consideration.

**AR-14:** Consent remains trust-driven. A trusted client with `requireConsent=false` auto-consents
after the branded confirmation page, which shows the requested scopes. A client with
`requireConsent=true` still gets the full consent page after login. No duplicate confirmation is
added.

**AR-15:** Unknown, expired, already-used and aborted user codes all produce the same generic
invalid-or-expired page. The token endpoint still uses the RFC-specific errors because the device
client needs to distinguish pending, slow, denied and expired outcomes.

**AR-20:** The device authorization response advertises `interval: 5`. Porta's device-aware token
limiter returns `400` with `slow_down` when the device polls faster than the advertised interval,
and a hard `429 rate_limit_exceeded` when the approved abuse threshold is crossed. The provider's
normal handler returns `authorization_pending`, `access_denied`, `expired_token` and
`invalid_grant` for the other states. Expired device rows are retained for 15 minutes so
`expired_token` remains observable.

**AR-21:** Approval binds the DeviceCode to the authenticated account, grant, client and session
metadata. Token exchange must fail if the client is inactive or foreign, the grant is missing or
expired, or the account or organization is no longer active. Existing logout cascade and
connected-app revocation delete approved DeviceCode rows by grant ID. The plan must verify the
offline-access case, where the provider's default session binding differs, against these
requirements.

**AR-22:** Device approval and denial are audit events in the `authentication` category. Rate-limit
denials are separate `security` events. Metadata carries organization, user, client and scopes;
the device code and user code are never included.

**AR-16:** The grant is part of the public client contract. Delivering only the server API would
leave the SDK, CLI and Admin terminal unable to create or inspect a consistent client. The Admin
terminal registration flow must therefore support creating a device-only client, and its Protocol
editor must expose the grant. Portability and documentation ship in the same contract change.

**AR-17:** `--grant-types` is a general client-contract flag, not a device-specific command. Create
and update accept a comma-separated list of the full grant URNs. `--redirect-uris` becomes optional
when the selected grants are device-only; the server remains the authority for the conditional rule.

**AR-18:** The manifest shape does not change, but an older server's closed grant enum rejects the
new value. The compatibility boundary is documented rather than silently weakening the import.
A manifest containing the device grant requires a server release that supports it.

**AR-19:** Zero redirect URIs remain a narrow exception. Public clients keep the existing PKCE
requirement even though the device grant does not use PKCE; this avoids a later conditional that
could weaken authorization-code security. `native` is the documented application type but is not
newly enforced. Confidential device clients remain valid and authenticate with their existing
client-secret method.

**AR-23:** The device code entry, confirmation and success pages are rendered by Porta because they
are provider-owned endpoints. After code confirmation, the existing interaction URL still hands
login and consent to the deployment's configured UI. This boundary is documented for custom UI
deployments; no new custom-UI hook is added.

**AR-24:** The provider default is already usable and avoids a custom generator. Eight characters
from the base-20 alphabet provide about 34.6 bits; the short lifetime and rate limiting make online
guessing impractical. No configuration is added.

**AR-25:** Browsers commonly block `window.close()` for tabs the page did not open, and device
clients have no redirect URI. A static branded success page is the only reliable outcome.

**AR-27:** The limiter returns `429` with `Retry-After` and the generic invalid-or-expired page. The
key is the client IP plus the provider session UID when one exists, so a shared NAT does not lock
out every user after one attacker exhausts an address-only budget.

**AR-28:** Device login is another way to obtain the same CLI session. It stores tokens in the
existing durable credential store, supports refresh, and does not create a second profile.
`--device-code` implies no browser. The CLI prints the verification URL and user code; QR rendering
is left to clients. If the admin client lacks the grant, the error names the exact remediation.

**AR-29:** This is the critical Porta-specific risk. The provider loads a DeviceCode and its client
globally, while Porta resolves the interaction organization from the request URL. Without an
explicit binding check, a code for a client in organization A could be approved under organization
B, producing a cross-tenant grant. Verification and resume requests therefore compare the
DeviceCode client's organization and the stored interaction organization with the URL organization
and reject any mismatch with the same generic 404 used for unknown clients. Penetration coverage is
mandatory.

**AR-30:** Device and user codes are bearer-equivalent secrets for the pending request. Pino
redaction does not currently cover them. Both names are added to the redaction paths, and audit or
operational metadata never carries the raw values.

**AR-32:** Porta releases the server, SDK and CLI in lockstep. The grant enum is a closed security
contract; older readers cannot validate a value they do not know. The supported boundary is the
same lockstep release for the server and its clients when device-enabled clients are used. Older
readers reject the response, and release notes document the required upgrade. No forward-compatible
parser or new API version is added.

**AR-31:** A partial unique index on `user_code` for `type = 'DeviceCode'` prevents two live requests
from sharing a code. A collision makes the new device authorization request fail closed with a
retryable error rather than returning an arbitrary matching request. The index is added in a new
migration and covers only the new model type, so it does not affect existing rows.

**AR-33:** The five RDs separate concerns that have different actors, acceptance criteria and
verification layers: provider protocol behavior, the browser verification experience, the public
client contract, the CLI runtime flow, and the cross-cutting security/assurance work. The plan can
still execute them in a single sequence.

**AR-34:** One plan keeps the spec tests, phase gates, review loop and evidence in one place. The
provider and tenant-binding work lands first because nothing else is safe to enable without it;
client contracts and CLI follow; assurance closes the feature. Separate plans would create
partially usable intermediate states and duplicate coordination.

**AR-36:** The primary per-client and per-session keys preserve fair budgets for legitimate users.
A per-IP aggregate closes the rotation bypass: device authorization is capped at 30 requests per
5 minutes per IP, and user-code submissions at 30 attempts per 10 minutes per IP. The primary keys
remain the first check; the aggregate is the second. This adds two fixed constants and no setting.

**AR-35:** The device authorization request is non-frontchannel, so node-oidc-provider does not
carry an OIDC nonce into the resulting ID token. The CLI must not reuse the authorization-code
verifier's mandatory nonce check. It verifies the ES256 signature, issuer, audience, `iat`, `exp`
and subject, and relies on the single-use device code and TLS for request binding. The verifier is
device-specific and does not weaken the authorization-code nonce check.

**AR-26:** A device grant is an ordinary OIDC Grant. The existing connected-apps projection and
revocation path already cover it, so no source label, filter or new storage is introduced.

## Final Confirmation

The user reviewed the complete register and confirmed all 34 decisions and the five-RD,
one-phased-plan structure on 2026-11-24. RD-01 through RD-03 were authored and approved.

AR-35 surfaced during RD-04 authoring and was resolved. AR-36 surfaced during RD-05 authoring, was
resolved by the user, and the complete 36-item register is confirmed. The Zero-Ambiguity Gate is
open.
