import { DataStoreBase, IInitStore, makeLocalStore, RouterStore, TTranslationFunction } from "@blendsdk/react";
import { filterObject, IDictionaryOf } from "@blendsdk/stdlib";
import {
    COOKIE_AUTH_FLOW_TTL,
    FLOW_ERROR_INVALID,
    ICheckSetFlow,
    LOCAL_STORAGE_LAST_LOGIN,
    MFA_RESEND_REQUEST,
    RESP_ACCOUNT,
    RESP_CHANGE_PASSWORD,
    RESP_CONSENT,
    RESP_FINALIZE,
    RESP_MFA
} from "@porta/shared";
import { FormikProps, useFormik } from "formik";
import Cookies from "js-cookie";
import React from "react";
import * as yup from "yup";
import { ApplicationApi, useRouter, useTranslation } from "../../../system";
import { eAppRoutes } from "../../routing";
import { IAuthFormModel } from "./types";

export enum eView {
    GET_CREDENTIALS = 1,
    GET_MFA = 2,
    CHANGE_PASSWORD_ON_LOGIN = 3,
    USER_CONSENT = 4
}

const MIN_PASSWORD_LENGTH = 8;

export const validateData = (data: any, validator: (data: any) => void) => {
    try {
        validator(data);
        return undefined;
    } catch (err: any) {
        return err.message;
    }
};

/**
 * @export
 * @class LoginViewLogic
 * @extends {DataStoreBase}
 */
export class LoginViewLogic extends DataStoreBase {
    public ready: boolean;

    protected sessionChecker: any;
    protected state: ICheckSetFlow;
    protected t: TTranslationFunction;

    public isInavlidSession: boolean;
    public tenantName: string;
    public applicationName: string;
    public logo: string;
    public view: eView;

    public showControls: boolean;
    public showBrand: boolean;
    public showCredentials: boolean;
    public showMFA: boolean;
    public showChangePassword: boolean;
    public showUserConsent: boolean;

    public showWaitSpinner: boolean;
    public allow_reset_password: boolean;
    public mfa_type: string;
    public consent_display_name: string;
    public consent_claims: string[];
    public can_ow_consent: boolean;

    public form: FormikProps<IAuthFormModel>;
    public router: RouterStore;
    public errors: IDictionaryOf<string>;

    /**
     * Creates an instance of LoginViewLogic.
     * @memberof LoginViewLogic
     */
    public constructor() {
        super();
        this.ready = false;
        this.state = undefined;
        this.tenantName = "";
        this.applicationName = "";
        this.logo = undefined;
        this.view = undefined;
        this.errors = {};
    }

    /**
     * @protected
     * @param {ICheckSetFlow} [state]
     * @memberof LoginViewLogic
     */
    protected updateState(state?: ICheckSetFlow) {
        if (state) {
            this.state = state;
        }

        // make sure we have a state first
        if (this.state) {
            this.isInavlidSession = this.state.error && this.state.resp === FLOW_ERROR_INVALID;
            this.showControls = !this.isInavlidSession && this.fetching === false;
            this.showBrand = this.showControls;
            this.showCredentials = this.showControls && this.view === eView.GET_CREDENTIALS;
            this.showMFA = this.showControls && this.view === eView.GET_MFA;
            this.showChangePassword = this.showControls && this.view === eView.CHANGE_PASSWORD_ON_LOGIN;
            this.showUserConsent = this.showControls && this.view === eView.USER_CONSENT;
            this.showWaitSpinner = !this.isInavlidSession && this.fetching === true;

            this.tenantName = this.state.tenant_name;
            this.applicationName = this.state.application_name;
            this.logo = this.state.logo;
            this.allow_reset_password = this.state.allow_reset_password;
            this.mfa_type = this.state.mfa_type;
            this.consent_display_name = this.state.consent_display_name;
            this.consent_claims = this.state.consent_claims;
            this.can_ow_consent = this.state.ow_consent;
        }
    }

    /**
     * @protected
     * @memberof LoginViewLogic
     */
    protected async loadTenantInformation() {
        if (this.state === undefined && !this.fetching) {
            this.beginFetching();
            ApplicationApi.authorization
                .checkSetFlow({
                    update: null
                })
                .then(({ data }) => {
                    this.view = eView.GET_CREDENTIALS;
                    this.updateState(data);
                    this.ready = true;
                    this.doneFetching();
                })
                .catch((err) => {
                    this.catchSystemError(err);
                    this.ready = true;
                    this.doneFetching();
                });
        }
    }

    /**
     * @memberof LoginViewLogic
     */
    public onResendVerificationCode() {
        this.beginFetching();
        ApplicationApi.authorization
            .checkSetFlow({
                update: MFA_RESEND_REQUEST,
                mfa_result: MFA_RESEND_REQUEST
            })
            .then(({ data }) => {
                setTimeout(() => {
                    this.form.setFieldValue("mfa", "");
                    this.updateState(data);
                    this.doneFetching();
                }, 500);
            })
            .catch((err) => {
                this.catchSystemError(err);
                this.doneFetching();
            });
    }

    /**
     * @memberof LoginViewLogic
     */
    public onForgotPasswordClick() {
        this.router.go(eAppRoutes.forgotPassword.path, {}, true);
    }

    /**
     * @protected
     * @memberof LoginViewLogic
     */
    protected beginFetching(): void {
        super.beginFetching(() => {
            this.updateState();
        });
    }

    /**
     * @protected
     * @memberof LoginViewLogic
     */
    protected doneFetching(): void {
        super.doneFetching(() => {
            this.updateState();
        });
    }

    /**
     * Handles KeyPress on the Dialog
     *
     * @param {React.KeyboardEvent<HTMLDivElement>} e
     * @memberof LoginViewLogic
     */
    public onKandleKeyPress(e: React.KeyboardEvent<HTMLDivElement>) {
        if (this.showCredentials) {
            if (e.code === "Enter") {
                e.preventDefault();
                this.form.submitForm();
            } else {
                this.errors[RESP_ACCOUNT] = undefined;
            }
        } else if (this.showMFA) {
            if (e.code === "Enter") {
                e.preventDefault();
                this.form.submitForm();
            } else {
                this.errors[RESP_MFA] = undefined;
            }
        } else if (this.showChangePassword) {
            if (e.code === "Enter") {
                e.preventDefault();
                this.form.submitForm();
            } else {
                this.errors[RESP_CHANGE_PASSWORD] = undefined;
            }
        } else if (this.showUserConsent) {
            if (e.code === "Enter") {
                e.preventDefault();
                this.form.submitForm();
            } else {
                this.errors[RESP_CONSENT] = undefined;
            }
        }
    }

    /**
     * @protected
     * @memberof LoginViewLogic
     */
    protected gotoNextStep() {
        this.form.resetForm();
        debugger;
        switch (this.state.next) {
            case RESP_MFA:
                this.view = eView.GET_MFA;
                break;
            case RESP_CHANGE_PASSWORD:
                this.view = eView.CHANGE_PASSWORD_ON_LOGIN;
                break;
            case RESP_CONSENT:
                this.view = eView.USER_CONSENT;
                break;
        }

        if (this.state.next === RESP_FINALIZE) {
            this.beginFetching();
            this.router.go(this.state.resp, {}, true);
        } else {
            setTimeout(() => {
                this.form.resetForm();
                this.doneFetching();
            }, 100);
        }
    }

    /**
     * @param {IAuthFormModel} values
     * @memberof LoginViewLogic
     */
    public submitAccount(values: IAuthFormModel) {
        this.beginFetching();
        ApplicationApi.authorization
            .checkSetFlow({
                update: RESP_ACCOUNT,
                username: values.username,
                password: values.password
            })
            .then(({ data }) => {
                if (data.error) {
                    this.errors[RESP_ACCOUNT] = data.resp;
                }
                setTimeout(() => {
                    this.updateState(data);
                    this.gotoNextStep();
                }, 500);
            })
            .catch((err) => {
                this.catchSystemError(err);
                this.doneFetching();
            });
    }

    /**
     * @param {IAuthFormModel} values
     * @memberof LoginViewLogic
     */
    public submitMFA(values: IAuthFormModel) {
        this.beginFetching();
        ApplicationApi.authorization
            .checkSetFlow({
                update: RESP_MFA,
                mfa_result: values.mfa
            })
            .then(({ data }) => {
                if (data.error) {
                    this.errors[RESP_MFA] = data.resp;
                }
                setTimeout(() => {
                    this.updateState(data);
                    this.gotoNextStep();
                }, 500);
            })
            .catch((err) => {
                this.catchSystemError(err);
                this.doneFetching();
            });
    }

    /**
     * @param {IAuthFormModel} values
     * @memberof LoginViewLogic
     */
    public submitChangePassword(values: IAuthFormModel) {
        this.beginFetching();
        ApplicationApi.authorization
            .checkSetFlow({
                update: RESP_CHANGE_PASSWORD,
                password: values.password,
                new_password: values.new_password,
                confirm_new_password: values.new_password_confirm
            })
            .then(({ data }) => {
                if (data.error) {
                    this.errors[RESP_CHANGE_PASSWORD] = data.resp;
                }
                setTimeout(() => {
                    this.updateState(data);
                    this.gotoNextStep();
                }, 500);
            })
            .catch((err) => {
                this.catchSystemError(err);
                this.doneFetching();
            });
    }

    /**
     * @param {IAuthFormModel} values
     * @memberof LoginViewLogic
     */
    public submitUserConsent(values: IAuthFormModel) {
        this.beginFetching();
        ApplicationApi.authorization
            .checkSetFlow({
                update: RESP_CONSENT,
                consent: values.consent,
                ow_consent: values.ow_consent
            })
            .then(({ data }) => {
                if (data.error) {
                    this.errors[RESP_CONSENT] = data.resp;
                }
                setTimeout(() => {
                    this.updateState(data);
                    this.gotoNextStep();
                }, 500);
            })
            .catch((err) => {
                this.catchSystemError(err);
                this.doneFetching();
            });
    }

    /**
     * @protected
     * @memberof LoginViewLogic
     */
    protected initForm() {
        this.form = useFormik<IAuthFormModel>({
            validateOnBlur: true,
            validateOnMount: true,
            initialValues: {
                rememberMe: window.localStorage.getItem(LOCAL_STORAGE_LAST_LOGIN) ? true : false,
                username: window.localStorage.getItem(LOCAL_STORAGE_LAST_LOGIN) || "",
                password: "",
                new_password: "",
                new_password_confirm: "",
                consent: false,
                ow_consent: false,
                mfa: ""
            },
            validate: (values) => {
                if (this.showCredentials) {
                    const val = {
                        username: validateData(values.username, (data) => {
                            yup.string().required("username_is_required").validateSync(data);
                        }),
                        password: validateData(values.password, (data) => {
                            yup.string().required("password_is_required").validateSync(data);
                        })
                    };
                    return filterObject(val, { undefinedValues: true });
                } else if (this.showMFA) {
                    const val = {
                        mfa: validateData(values.mfa, (data) => {
                            yup.string().required(`mfa_${this.state.mfa_type}_is_required`).validateSync(data);
                        })
                    };
                    return filterObject(val, { undefinedValues: true });
                } else if (this.showChangePassword) {
                    const val = {
                        password: validateData(values.password, (data) => {
                            yup.string().required("current_password_is_required").validateSync(data);
                        }),
                        new_password: validateData(values.new_password, (data) => {
                            yup.string()
                                .required("new_password_is_required")
                                .min(
                                    MIN_PASSWORD_LENGTH,
                                    this.t("err_min_password_length", { length: MIN_PASSWORD_LENGTH })
                                )
                                .notOneOf([values.password], "err_not_same_password")
                                .matches(/[a-z]+/, "password must have at least one lower case character")
                                .matches(/[A-Z]+/, "password must have at least one upper case character")
                                .matches(
                                    /[!@#\$%\^&\*\(\)_\+\-=\[\]\{\};:'"\\|,.<>\/\?`~]+/,
                                    "password must have at least one special character"
                                )
                                .matches(/\d+/, "password must have at least one number")
                                .validateSync(data);
                        }),
                        new_password_confirm: validateData(values.new_password_confirm, (data) => {
                            yup.string()
                                .required()
                                .oneOf([values.new_password], "err_password_do_not_match")
                                .validateSync(data);
                        })
                    };
                    return filterObject(val, { undefinedValues: true });
                }
            },
            onSubmit: (values) => {
                if (this.showCredentials) {
                    this.submitAccount(values);
                } else if (this.showMFA) {
                    this.submitMFA(values);
                } else if (this.showChangePassword) {
                    this.submitChangePassword(values);
                } else if (this.showUserConsent) {
                    this.submitUserConsent(values);
                } else {
                    console.log(Error(`Not implemented yet ${this.view}`));
                }
            }
        });
    }

    protected checkSession() {
        const sessionCookie = Cookies.get(COOKIE_AUTH_FLOW_TTL);
        if (!sessionCookie) {
            this.state = this.state || ({} as any);
            this.state.error = true;
            this.state.resp = FLOW_ERROR_INVALID;
            this.updateState(this.state);
            this.react();
        }
    }

    /**
     * @param {IInitStore} params
     * @memberof LoginViewLogic
     */
    public init(params: IInitStore): void {
        const { t } = useTranslation();
        this.router = useRouter();
        this.t = t;

        const { sideEffect } = params;

        this.makeAction<LoginViewLogic>("onForgotPasswordClick");
        this.makeAction<LoginViewLogic>("onKandleKeyPress");
        this.makeAction<LoginViewLogic>("onResendVerificationCode");

        this.initForm();

        sideEffect(() => {
            this.loadTenantInformation();
            if (!this.sessionChecker) {
                this.sessionChecker = setInterval(() => {
                    this.checkSession();
                }, 1000);
            }
            return () => {
                if (this.sessionChecker) {
                    clearInterval(this.sessionChecker);
                }
            };
        }, []);
    }
}

export const useLoginView = makeLocalStore<LoginViewLogic>(LoginViewLogic);
