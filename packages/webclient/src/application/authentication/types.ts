export enum eFlowState {
    GET_ACCOUNT = 100,
    INVALID_SESSION = 110,
    COMPLETE = 120
}

export interface IAuthenticationDialogModel {
    username: string;
    password: string;
    mfa: string;
}
