import { Loading } from "@blendsdk/fui8";
import { SessionLoadingView } from "@blendsdk/react";
import { SpinnerSize } from "@fluentui/react";
import { FLOW_ERROR_INVALID, INVALID_PWD, INVALID_PWD_MATCH, RESP_ACCOUNT, RESP_CHANGE_PASSWORD, RESP_CONSENT, RESP_MFA } from "@porta/shared";
import React from "react";
import LogoImage from "../../../resources/logo.svg";
import { ChangePassword } from "./ChangePassword";
import { GetAccount } from "./GetAccount";
import { GetConsent } from "./GetConsent";
import { GetMFA } from "./GetMFA";
import { InvalidSession } from "./InvalidSession";
import { useStyles } from "./styles";
import { IUseAuthenticationFlowState, useAuthenticationFlow } from "./useAuthenticationFlow";

export interface ILoginViewProps {
}


export const LoginView: React.FC<ILoginViewProps> = () => {
    const styles = useStyles();
    const { form, state, t, onResendMFA } = useAuthenticationFlow();

    console.log(state.resp, state.curState);

    const isError = state?.error;
    const isInvalidFlow = isError && state?.resp == FLOW_ERROR_INVALID;
    const showLogo = !isInvalidFlow;
    const showWaitSpinner = !isInvalidFlow && state.fetching === true;
    const showControls = !isInvalidFlow && state.fetching !== true;
    const showGetAccount = showControls && (state.resp === RESP_ACCOUNT || (state.curState === RESP_ACCOUNT && state.resp === INVALID_PWD));
    const showGetMFA = showControls && (state.resp === RESP_MFA || state.curState === RESP_MFA);
    const showConsent = showControls && (state.resp == RESP_CONSENT);
    const showChangePW = showControls && (state.resp === RESP_CHANGE_PASSWORD || (state.curState === RESP_CHANGE_PASSWORD && state.resp === INVALID_PWD_MATCH));

    return state.initializing || state.returningUser ? <SessionLoadingView /> :
        <div className={styles.wrapper}>
            <form onSubmit={form.handleSubmit}>
                <div className={styles.authView}>
                    {isInvalidFlow && <InvalidSession caption="invalid_auth_session_caption" message="invalid_auth_session_message" />}
                    {showLogo && <div className={styles.logo} style={{ backgroundImage: `url(${state?.logo || LogoImage})` }} />}
                    {showWaitSpinner && <Loading style={{ flex: 1 }} size={SpinnerSize.large} label={t("please_wait")} />}
                    {showGetAccount && <GetAccount form={form} flowState={state as IUseAuthenticationFlowState} />}
                    {showGetMFA && <GetMFA form={form} flowState={state as IUseAuthenticationFlowState} onResend={onResendMFA} />}
                    {showConsent && <GetConsent form={form} flowState={state as IUseAuthenticationFlowState} />}
                    {showChangePW && <ChangePassword form={form} flowState={state as IUseAuthenticationFlowState} />}
                </div>
            </form>
        </div>;
};