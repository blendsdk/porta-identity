import { useObjectState } from "@blendsdk/react";
import { filterObject } from "@blendsdk/stdlib";
import { ICheckSetFlow, LOCAL_STORAGE_LAST_LOGIN, MFA_RESEND_REQUEST, RESP_ACCOUNT, RESP_CONSENT, RESP_MFA } from "@porta/shared";
import { useFormik } from "formik";
import { useCallback, useEffect, useState } from "react";
import * as yup from "yup";
import { ApplicationApi, useRouter, useSystemError, useTranslation } from "../../../system";

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
                        curState: data.resp === RESP_MFA || data.resp === RESP_ACCOUNT || data.resp === RESP_CONSENT ? data.resp : state.curState,
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
                        curState: data.resp === RESP_MFA || data.resp === RESP_ACCOUNT ? data.resp : state.curState,
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
                        curState: data.resp === RESP_MFA || data.resp === RESP_ACCOUNT ? data.resp : state.curState,
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

    useEffect(() => {
        if (isFinalize(state.resp)) {
            const url = new URL(state.resp);
            router.go(url.toString(), {}, true);
        }
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
    }, [reCheck]);

    return { state, form, t, onResendMFA };
};
