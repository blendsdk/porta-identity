/** Supported public second-factor journeys in the retained security harness. */
export type SecondFactorJourneyId = 'email-otp' | 'totp' | 'recovery-code';

/** Secret-free outcome of one public verification attempt. */
export interface SecondFactorAttemptObservation {
  /** Stable attempt name from the requirements catalog. */
  readonly id: string;
  /** Public result observed after form submission. */
  readonly result: 'accepted' | 'rejected' | 'throttled';
  /** Whether an authorization code reached the registered callback. */
  readonly authorizationCompleted: boolean;
  /** Remaining recovery-code count when that public observer applies. */
  readonly remainingRecoveryCodes: number | null;
}

/** Complete secret-free result for one second-factor family. */
export interface SecondFactorJourneyObservation {
  /** Journey family. */
  readonly id: SecondFactorJourneyId;
  /** Active owner-fenced lifecycle run. */
  readonly runId: string;
  /** Ordered public attempts. */
  readonly attempts: readonly SecondFactorAttemptObservation[];
  /** Whether any raw OTP, TOTP secret, or recovery code entered retained evidence. */
  readonly secretRetained: boolean;
  /** Whether the deterministic lifecycle reset completed. */
  readonly cleanupCompleted: boolean;
}

/** Owner-fenced live input admitted only by the production-security harness. */
export interface SecondFactorLiveContext {
  readonly runId: string;
  readonly fixtureManifestPath: string;
  readonly protectedCredentialsPath: string;
  readonly projectAdmitted: boolean;
  readonly profile: 'production-security';
}

/** Public-boundary adapter for ordinary second-factor verification. */
export interface SecondFactorContract {
  observeJourney(id: SecondFactorJourneyId): Promise<SecondFactorJourneyObservation>;
}

/** Factory signature implemented by the retained live harness adapter. */
export type CreateSecondFactorContract = (context: SecondFactorLiveContext) => SecondFactorContract;
