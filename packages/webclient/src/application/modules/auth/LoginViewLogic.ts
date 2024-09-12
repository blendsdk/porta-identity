import { DataStoreBase, IInitStore, makeLocalStore, RouterStore, TTranslationFunction } from "@blendsdk/react";
import { filterObject, IDictionaryOf } from "@blendsdk/stdlib";
import {
    FLOW_ERROR_INVALID,
    ICheckSetFlow,
    LOCAL_STORAGE_LAST_LOGIN,
    MFA_RESEND_REQUEST,
    RESP_ACCOUNT,
    RESP_CHANGE_PASSWORD,
    RESP_MFA
} from "@porta/shared";
import { FormikProps, useFormik } from "formik";
import React from "react";
import * as yup from "yup";
import { ApplicationApi, useRouter, useTranslation } from "../../../system";
import { eAppRoutes } from "../../routing";
import { IAuthFormModel } from "./types";

export enum eView {
    GET_CREDENTIALS = 1,
    GET_MFA = 2,
    CHANGE_PASSWORD_ON_LOGIN = 3
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

export class LoginViewLogic extends DataStoreBase {
    /**
     * @type {boolean}
     * @memberof LoginViewLogic
     */
    public ready: boolean;
    protected state: ICheckSetFlow;
    protected t: TTranslationFunction;

    public isInavlidSession: boolean;
    public showControls: boolean;
    public showBrand: boolean;
    public tenantName: string;
    public applicationName: string;
    public logo: string;
    public view: eView;

    public showCredentials: boolean;
    public showMFA: boolean;
    public showChangePassword: boolean;

    public showWaitSpinner: boolean;
    public allow_reset_password: boolean;
    public mfa_type: string;

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

    protected updateState(state?: ICheckSetFlow) {
        if (state) {
            this.state = state;
        }
        if (this.state) {
            this.isInavlidSession = this.state.error && this.state.resp === FLOW_ERROR_INVALID;
            this.showControls = !this.isInavlidSession && this.fetching === false;
            this.showBrand = this.showControls;
            this.tenantName = this.state.tenant_name;
            this.applicationName = this.state.application_name;
            this.logo = this.state.logo;
            this.allow_reset_password = this.state.allow_reset_password;
            this.mfa_type = this.state.mfa_type;

            this.showCredentials = this.showControls && this.view === eView.GET_CREDENTIALS;
            this.showMFA = this.showControls && this.view === eView.GET_MFA;
            this.showChangePassword = this.showControls && this.view === eView.CHANGE_PASSWORD_ON_LOGIN;

            this.showWaitSpinner = !this.isInavlidSession && this.fetching === true;
        }
    }

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

    public onForgotPasswordClick() {
        this.router.go(eAppRoutes.forgotPassword.path, {}, true);
    }

    protected beginFetching(): void {
        super.beginFetching(() => {
            this.updateState();
        });
    }

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
        }
    }

    protected gotoNextStep() {
        this.form.resetForm();
        switch (this.state.next) {
            case RESP_MFA:
                this.view = eView.GET_MFA;
                break;
            case RESP_CHANGE_PASSWORD:
                this.view = eView.CHANGE_PASSWORD_ON_LOGIN;
                break;
        }
        setTimeout(() => {
            this.form.resetForm();
        }, 100);
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
                    this.doneFetching();
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
                    this.doneFetching();
                }, 500);
            })
            .catch((err) => {
                this.catchSystemError(err);
                this.doneFetching();
            });
    }

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
                    this.doneFetching();
                }, 500);
            })
            .catch((err) => {
                this.catchSystemError(err);
                this.doneFetching();
            });
    }

    public init(params: IInitStore): void {
        const { t } = useTranslation();
        this.router = useRouter();
        this.t = t;

        const { sideEffect } = params;

        this.makeAction<LoginViewLogic>("onForgotPasswordClick");
        this.makeAction<LoginViewLogic>("onKandleKeyPress");
        this.makeAction<LoginViewLogic>("onResendVerificationCode");

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
                } else {
                    console.log(Error(`Not implemented yet ${this.view}`));
                }
            }
        });

        sideEffect(() => {
            this.loadTenantInformation();
        }, []);
    }
}

export const useLoginView = makeLocalStore<LoginViewLogic>(LoginViewLogic);
