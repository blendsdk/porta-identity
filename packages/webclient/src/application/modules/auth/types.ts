export interface IAuthFormModel {
    rememberMe: boolean;
    username: string;
    password: string;
    new_password_confirm: string;
    new_password: string;
    consent: boolean;
    ow_consent: boolean;
    mfa: string;
}
