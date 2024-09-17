//FIXME! Make a configuration variable from this.
export const MIN_PASSWORD_LENGTH = 8;

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

export interface IResetFormModel {
    new_password_confirm: string;
    new_password: string;
    captcha: string;
}

/**
 *
 * @param data Custom validator
 * @param validator
 * @returns
 */
export const validateData = (data: any, validator: (data: any) => void) => {
    try {
        validator(data);
        return undefined;
    } catch (err: any) {
        return err.message;
    }
};
