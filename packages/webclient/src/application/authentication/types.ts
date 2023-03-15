export const FIELD_SIZE = "large";

export interface IExistingAccountStorage {
    [client_id: string]: IExistingAccount[];
}

export interface IExistingAccount {
    account: string;
    tenant: string;
}

export interface IAuthenticationDialogModel {
    username: string;
    password: string;
}

/**
 * Enum describing the UI flow
 */
export const eFlowState = {
    SELECT_ACCOUNT: 1,
    REQUIRE_PASSWORD: 2,
    START_MFA: 3,
    COMPLETE: 4,
    INVALID_SESSION: 99
};
