import { Loading } from "@blendsdk/fui8";
import { SessionLoadingView } from "@blendsdk/react";
import { SpinnerSize } from "@fluentui/react";
import { FLOW_ERROR_INVALID, RESP_ACCOUNT, RESP_MFA } from "@porta/shared";
import React from "react";
import LogoImage from "../../../resources/logo.svg";
import { GetAccount } from "./GetAccount";
import { GetMFA } from "./GetMFA";
import { InvalidSession } from "./InvalidSession";
import { IUseAuthenticationFlowState, useAuthenticationFlow } from "./hooks";
import { useStyles } from "./styles";

export interface ILoginViewProps {
}


export const LoginView: React.FC<ILoginViewProps> = () => {
    const styles = useStyles();
    const { form, state, t } = useAuthenticationFlow();

    const isError = state?.error;
    const isInvalidFlow = isError && state?.resp == FLOW_ERROR_INVALID;
    const showLogo = !isInvalidFlow;
    const showWaitSpinner = !isInvalidFlow && state.fetching === true;
    const showControls = !isInvalidFlow && state.fetching !== true;
    const showGetAccount = showControls && (state.resp === RESP_ACCOUNT || state.curState === RESP_ACCOUNT);
    const showGetMFA = showControls && (state.resp === RESP_MFA || state.curState === RESP_MFA);

    console.log(state.resp);

    return state.initializing ? <SessionLoadingView /> :
        <div className={styles.wrapper}>
            <form onSubmit={form.handleSubmit}>
                <div className={styles.authView}>
                    {isInvalidFlow && <InvalidSession caption="invalid_auth_session_caption" message="invalid_auth_session_message" />}
                    {showLogo && <div className={styles.logo} style={{ backgroundImage: `url(${state?.logo || LogoImage})` }} />}
                    {showWaitSpinner && <Loading style={{ flex: 1 }} size={SpinnerSize.large} label={t("please_wait")} />}
                    {showGetAccount && <GetAccount form={form} flowState={state as IUseAuthenticationFlowState} />}
                    {showGetMFA && <GetMFA form={form} flowState={state as IUseAuthenticationFlowState} />}
                </div>
            </form>
        </div>;
};