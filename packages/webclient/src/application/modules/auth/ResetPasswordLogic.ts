import { ComponentLogic, makeLocalStore, TTranslatorFunction, yup } from "@blendsdk/react";
import { filterObject } from "@blendsdk/stdlib";
import {
    COOKIE_AUTH_FLOW_TTL,
    IResetPasswordFlowInfo,
    RESET_COMPLETE,
    RESET_PASSWORD_INVALID_FLOW
} from "@porta/shared";
import { FormikProps, useFormik } from "formik";
import Cookies from "js-cookie";
import { ApplicationApi, useTranslation } from "../../../system";
import { IResetFormModel, MIN_PASSWORD_LENGTH, validateData } from "./types";

export enum eResetView {
    GET_NEW_PASSDWORD = 1,
    COMPLETE = 2
}

export interface IResetPasswordLogicState extends IResetPasswordFlowInfo {
    invalid_session: boolean;
    errorResp?: string;
    view: eResetView;
}

export class ResetPasswordLogic extends ComponentLogic<IResetPasswordLogicState> {
    /**
     * Checker
     *
     * @protected
     * @type {*}
     * @memberof ResetPasswordLogic
     */
    protected sessionChecker: any = undefined;
    protected t: TTranslatorFunction;

    public form: FormikProps<IResetFormModel>;

    // computed
    public isInvalidSession: boolean = true;
    public showControls: boolean;
    public showBrand: boolean;
    public showWaitSpinner: boolean;
    public tenantName: string = "";
    public applicationName: string = "";
    public logo: string = "";
    public showGetPassword: boolean;
    public showComplete: boolean;
    public captchaImage: string;
    public showResetError: boolean;
    public resetError: string;

    /**
     * @protected
     * @param {IResetPasswordLogicState} state
     * @memberof ResetPasswordLogic
     */
    protected updateComputed(state: IResetPasswordLogicState): void {
        this.isInvalidSession = state.invalid_session == true && this.ready === true;
        this.showControls = !this.isInvalidSession && this.fetching === false;
        this.showBrand = this.showControls;
        this.showWaitSpinner = !this.isInvalidSession && this.fetching === true;
        this.tenantName = state.organization;
        this.applicationName = state.application_name;
        this.logo = state.logo;
        this.showGetPassword = this.showControls && state.view === eResetView.GET_NEW_PASSDWORD;
        this.showComplete = this.showControls && state.view === eResetView.COMPLETE;
        this.captchaImage = state.captcha;
        this.showResetError = state.error === true && state.errorResp !== undefined;
        this.resetError = state.errorResp;
    }

    /**
     * @memberof ResetPasswordLogic
     */
    public onGetNewPatchaImage() {
        ApplicationApi.authorization
            .resetPasswordFlowInfo({})
            .then(({ data }) => {
                this.updateState({
                    ...data,
                    invalid_session: data.error === true
                });
                this.react();
            })
            .catch((err) => {
                this.catchSystemError(err);
            });
    }

    /**
     * @protected
     * @memberof ResetPasswordLogic
     */
    protected initActions(): void {
        this.makeAction<ResetPasswordLogic>("onGetNewPatchaImage");
    }

    /**
     * @protected
     * @memberof ResetPasswordLogic
     */
    protected initState(): void {
        if (this.sessionChecker === undefined) {
            this.sessionChecker = setInterval(() => {
                if (this.ready && !this.fetching) {
                    this.checkSession();
                }
            }, 1000);
        }
        this.updateState({
            errorResp: undefined,
            application_name: "",
            organization: "",
            logo: "",
            view: eResetView.GET_NEW_PASSDWORD,
            invalid_session: true
        });
    }

    protected initUtils(): void {
        const { t } = useTranslation();
        this.t = t;
        this.initForm();
    }

    /**
     * @protected
     * @memberof ResetPasswordLogic
     */
    protected checkSession() {
        const sessionCookie = Cookies.get(COOKIE_AUTH_FLOW_TTL);
        if (!sessionCookie) {
            this.updateState({
                invalid_session: true
            });
            this.react();
        }
    }

    protected loadComponent(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.beginFetching();
            ApplicationApi.authorization
                .resetPasswordFlowInfo({})
                .then(({ data }) => {
                    this.updateState({
                        ...data,
                        invalid_session: data.error === true && this.showComplete !== true
                    });
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * @protected
     * @memberof ResetPasswordLogic
     */
    protected unLoadComponent(): void {
        if (this.sessionChecker) {
            clearInterval(this.sessionChecker);
            this.sessionChecker = undefined;
        }
    }

    protected initForm() {
        this.form = useFormik<IResetFormModel>({
            validateOnBlur: true,
            validateOnMount: false,
            initialValues: {
                new_password: "",
                new_password_confirm: "",
                captcha: ""
            },
            validate: (values) => {
                if (this.showGetPassword) {
                    const val = {
                        new_password: validateData(values.new_password, (data) => {
                            yup.string()
                                .required("new_password_is_required")
                                .min(
                                    MIN_PASSWORD_LENGTH,
                                    this.t("err_min_password_length", { length: MIN_PASSWORD_LENGTH })
                                )
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
                                .required("password_confirm_is_required")
                                .oneOf([values.new_password], "err_password_do_not_match")
                                .validateSync(data);
                        }),
                        captcha: validateData(values.captcha, (data) => {
                            yup.string().required("captcha_value_is_required").validateSync(data);
                        })
                    };
                    return filterObject(val, { undefinedValues: true });
                }
            },
            onSubmit: (values) => {
                if (this.showControls) {
                    this.updateState({
                        error: false,
                        errorResp: undefined
                    });
                    this.beginFetching();
                    ApplicationApi.authorization
                        .resetAuth({
                            captcha: values.captcha,
                            confirm: values.new_password_confirm,
                            password: values.new_password
                        })
                        .then(({ data }) => {
                            this.updateState({
                                invalid_session: data.error === true && data.resp === RESET_PASSWORD_INVALID_FLOW,
                                error: data.error,
                                errorResp: data.resp,
                                view: data.resp === RESET_COMPLETE ? eResetView.COMPLETE : this.state.view
                            });
                            if (this.showResetError) {
                                this.form.resetForm({});
                            }
                            this.doneFetching();
                        })
                        .catch((err) => {
                            this.catchSystemError(err);
                            this.doneFetching();
                        });
                }
            }
        });
    }
}

export const useResetPassword = makeLocalStore<ResetPasswordLogic>(ResetPasswordLogic);
