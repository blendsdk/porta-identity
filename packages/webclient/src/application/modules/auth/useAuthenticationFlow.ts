/* eslint-disable no-useless-escape */
import { useObjectState } from "@blendsdk/react";
import { filterObject } from "@blendsdk/stdlib";
import { ICheckSetFlow, INVALID_PWD, INVALID_PWD_MATCH, LOCAL_STORAGE_LAST_LOGIN, MFA_RESEND_REQUEST, RESP_ACCOUNT, RESP_CHANGE_PASSWORD, RESP_CONSENT, RESP_FORGOT_PASSWORD, RESP_MFA } from "@porta/shared";
import { useFormik } from "formik";
import { useCallback, useEffect, useState } from "react";
import * as yup from "yup";
import { ApplicationApi, useRouter, useSystemError, useTranslation } from "../../../system";

const MIN_PASSWORD_LENGTH = 8;

export const validateData = (data: any, validator: (data: any) => void) => {
    try {
        validator(data);
        return undefined;
    } catch (err: any) {
        return err.message;
    }
};

export interface IAuthenticationDialogModel {
    rememberMe: boolean;
    username: string;
    password: string;
    new_password_confirm: string;
    new_password: string;
    consent: boolean;
    ow_consent: boolean;
    mfa: string;
}

export interface IUseAuthenticationFlowState extends ICheckSetFlow {
    initializing: boolean;
    returningUser: boolean;
    fetching: boolean;
    curState: string;
}

let timeoutId: any = undefined;

export const useAuthenticationFlow = () => {
    const router = useRouter();
    const { t } = useTranslation();
    const { catchSystemError } = useSystemError();
    const [reCheck, setReCheck] = useState(0);
    const [state, setState] = useObjectState<Partial<IUseAuthenticationFlowState>>(() => ({
        initializing: true,
        fetching: false,
        curState: undefined,
        resp: ""
    }));

    const isFinalize = (resp: string) => {
        return resp.startsWith("http");
    };

    const form = useFormik<IAuthenticationDialogModel>({
        validateOnMount: false,
        validateOnChange: true,
        validateOnBlur: true,
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
            if (state.resp === RESP_ACCOUNT) {
                const val = {
                    username: validateData(values.username, (data) => {
                        yup.string().required("username_is_required").validateSync(data);
                    }),
                    password: validateData(values.password, (data) => {
                        yup.string().required("password_is_required").validateSync(data);
                    })
                };
                return filterObject(val, { undefinedValues: true });
            } else if (state.resp === RESP_MFA) {
                const val = {
                    mfa: validateData(values.mfa, (data) => {
                        yup.string().required(`mfa_${state.mfa_type}_is_required`).validateSync(data);
                    }),
                };
                return filterObject(val, { undefinedValues: true });
            } else if (state.resp === RESP_CHANGE_PASSWORD) {
                const val = {
                    password: validateData(values.password, (data) => {
                        yup.string().required("password_is_required").validateSync(data);
                    }),
                    new_password: validateData(values.new_password, (data) => {
                        yup.string()
                            .required("password_is_required")
                            .min(MIN_PASSWORD_LENGTH, "err_min_password_length")
                            .notOneOf([values.password], "err_not_same_password")
                            .matches(/[a-z]+/, "password must have at least one lower case character")
                            .matches(/[A-Z]+/, "password must have at least one upper case character")
                            .matches(/[!@#\$%\^&\*\(\)_\+\-=\[\]\{\};:'"\\|,.<>\/\?`~]+/, "password must have at least one special character")
                            .matches(/\d+/, "password must have at least one number").validateSync(data);
                    }),
                    new_password_confirm: validateData(values.new_password_confirm, (data) => {
                        yup.string().required().oneOf([values.new_password], "err_password_do_not_match").validateSync(data);
                    })
                };
                return filterObject(val, { undefinedValues: true });
            }
        },
        onSubmit: (values) => {
            if (values.rememberMe) {
                window.localStorage.setItem(LOCAL_STORAGE_LAST_LOGIN, values.rememberMe ? values.username : "");
            } else {
                window.localStorage.removeItem(LOCAL_STORAGE_LAST_LOGIN);
            }
            if (state.resp === RESP_ACCOUNT || state.curState === RESP_ACCOUNT) {
                setState({ fetching: true });
                ApplicationApi.authorization.checkSetFlow({
                    update: RESP_ACCOUNT,
                    username: values.username,
                    password: values.password,
                }).then(({ data }) => {
                    setState({
                        fetching: isFinalize(data.resp),
                        curState: data.resp !== state.curState && data.resp !== INVALID_PWD ? data.resp : state.curState,
                        ...data
                    });
                })
                    .catch(catchSystemError);
            } else if (state.resp === RESP_MFA || state.curState === RESP_MFA) {
                setState({ fetching: true });
                ApplicationApi.authorization.checkSetFlow({
                    update: RESP_MFA,
                    mfa_result: values.mfa
                }).then(({ data }) => {
                    setState({
                        fetching: isFinalize(data.resp),
                        curState: data.resp !== state.curState ? data.resp : state.curState,
                        ...data
                    });
                })
                    .catch(catchSystemError);

            } else if (state.resp === RESP_CONSENT) {
                setState({ fetching: true });
                ApplicationApi.authorization.checkSetFlow({
                    update: RESP_CONSENT,
                    ow_consent: values.ow_consent,
                    consent: values.consent
                }).then(({ data }) => {
                    setState({
                        fetching: isFinalize(data.resp),
                        curState: data.resp !== state.curState ? data.resp : state.curState,
                        ...data
                    });
                })
                    .catch(catchSystemError);
            } else if (state.resp === RESP_CHANGE_PASSWORD || state.curState === RESP_CHANGE_PASSWORD) {
                setState({ fetching: true });
                ApplicationApi.authorization.checkSetFlow({
                    update: RESP_CHANGE_PASSWORD,
                    password: values.password,
                    new_password: values.new_password,
                    confirm_new_password: values.new_password_confirm,
                    username: values.username,
                }).then(({ data }) => {
                    setState({
                        fetching: isFinalize(data.resp),
                        curState: data.resp !== state.curState && data.resp !== INVALID_PWD_MATCH ? data.resp : state.curState,
                        ...data
                    });
                })
                    .catch(catchSystemError);

            }
        }
    });

    const onResendMFA = useCallback(() => {
        setState({ fetching: true });
        ApplicationApi.authorization.checkSetFlow({
            update: RESP_MFA,
            mfa_result: MFA_RESEND_REQUEST
        }).then(({ data }) => {
            setState({
                fetching: isFinalize(data.resp),
                curState: data.resp === RESP_MFA || data.resp === RESP_ACCOUNT ? data.resp : state.curState,
                ...data
            });
        })
            .catch(catchSystemError);

    }, [catchSystemError, setState, state]);

    const onForgotPassword = useCallback(() => {
        setState({ fetching: true });
        ApplicationApi.authorization.checkSetFlow({
            update: RESP_FORGOT_PASSWORD,
        }).then(({ data }) => {
            setState({
                fetching: isFinalize(data.resp),
                curState: data.resp === RESP_FORGOT_PASSWORD || data.resp === RESP_FORGOT_PASSWORD ? data.resp : state.curState,
                ...data
            });
        })
            .catch(catchSystemError);

    }, [catchSystemError, setState, state.curState]);

    useEffect(() => {
        if (isFinalize(state.resp)) {
            const url = new URL(state.resp);
            router.go(url.toString(), {}, true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.resp]);

    useEffect(() => {
        setState({ initializing: true });
        ApplicationApi.authorization.checkSetFlow({}).then(({ data }) => {

            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (data.expires_in > 0) {
                timeoutId = setTimeout(() => {
                    setReCheck(reCheck + 1);
                }, data.expires_in);
            }
            setState(
                {
                    initializing: false,
                    ...data,
                    curState: data.resp,
                    returningUser: isFinalize(data.resp)
                }
            );
        }).catch(err => {
            setState({ initializing: false, ...err });
        });

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reCheck]);

    return { state, form, t, onResendMFA, onForgotPassword };
};
