import { Loading } from "@blendsdk/fui8";
import { SessionLoadingView, useObjectState } from "@blendsdk/react";
import { SpinnerSize } from "@fluentui/react";
import { IFlowInfo } from "@porta/shared";
import { useFormik } from "formik";
import Cookies from "js-cookie";
import { useEffect, useMemo } from "react";
import LogoImage from "../../resources/logo.svg";
import { ApplicationApi } from "../../system/api";
import { useTranslation } from "../../system/i18n";
import { useSystemError } from "../../system/session";
import { GetAccount } from "./GetAccount";
import { InvalidSession } from "./InvalidSession";
import { useStyles } from "./styles";
import { IAuthenticationDialogModel, eFlowState } from "./types";
import { isFlowExpired } from "./utils";
interface ILoginViewState {
    flowInfo: IFlowInfo;
    flowState: eFlowState;
    fetching: boolean;
}

export const LoginView = () => {
    const { t } = useTranslation();
    const { catchSystemError } = useSystemError();
    const styles = useStyles();
    const [state, setState] = useObjectState<Partial<ILoginViewState>>(() => ({
        flowState: undefined,
        flowInfo: undefined,
        fetching: false
    }));

    const lastTenant = useMemo<string>(() => {
        return Cookies.get("_at") || "";
    }, []);

    const form = useFormik<IAuthenticationDialogModel>({
        validateOnMount: false,
        validateOnChange: false,
        initialValues: {
            username: "",
            password: "",
            mfa: ""
        },
        validate: (values) => {
        },
        onSubmit: (values, { validateForm }) => {
        }
    });

    useEffect(() => {
        const checker = setInterval(() => {
            const isInvalidFlow = isFlowExpired("_as") && state.flowState !== eFlowState.COMPLETE;
            if (isInvalidFlow) {
                setState({ flowState: eFlowState.INVALID_SESSION, flowInfo: undefined });
            } else if (!state.flowState) {
                setState({ fetching: true });
                ApplicationApi.authorization
                    .flowInfo({})
                    .then(({ data }) => {
                        setState({ flowInfo: data, flowState: eFlowState.GET_ACCOUNT, fetching: false });
                    })
                    .catch((err) => {
                        if (err.message === "INVALID_REQUEST_NO_FLOW") {
                            setState({ flowState: eFlowState.INVALID_SESSION, flowInfo: undefined, fetching: false });
                        } else {
                            catchSystemError(err);
                        }
                    });
            }
        }, 250);

        return () => {
            clearInterval(checker);
        };
    }, [catchSystemError, lastTenant, setState, state.flowState]);

    const showWaitSpinner = (!state?.flowInfo && state.flowState !== eFlowState.INVALID_SESSION) || state.fetching;
    const showLogo = state?.flowInfo && state.flowState !== eFlowState.INVALID_SESSION;
    const showControls = !state.fetching;

    return state.flowState === undefined ? (
        <SessionLoadingView />
    ) : (
        <div className={styles.wrapper}>
            <form onSubmit={form.handleSubmit}>
                <div className={styles.authView}>
                    {showLogo && <div className={styles.logo} style={{ backgroundImage: `url(${state?.flowInfo?.logo || LogoImage})` }} />}
                    {showWaitSpinner && <Loading style={{ flex: 1 }} size={SpinnerSize.large} label={t("please_wait")} />}
                    {showControls && <>
                        {state.flowState === eFlowState.INVALID_SESSION && (
                            <InvalidSession
                                caption="invalid_auth_session_caption"
                                message="invalid_auth_session_message"
                            />
                        )}
                        {state.flowState === eFlowState.GET_ACCOUNT && <GetAccount form={form} flowInfo={state?.flowInfo} />}
                    </>}
                </div>
            </form>
        </div>
    );
};
