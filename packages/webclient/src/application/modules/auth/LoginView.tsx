import { SessionLoadingView } from "@blendsdk/react";
import { FLOW_ERROR_INVALID } from "@porta/shared";
import React from "react";
import LogoImage from "../../../resources/logo.svg";
import { InvalidSession } from "./InvalidSession";
import { useAuthenticationFlow } from "./hooks";
import { useStyles } from "./styles";

export interface ILoginViewProps {

}

export const LoginView: React.FC<ILoginViewProps> = () => {
    const styles = useStyles();
    const flow = useAuthenticationFlow();

    const isError = flow?.error;
    const isInvalidFlow = isError && flow?.resp == FLOW_ERROR_INVALID;
    const showLogo = !isInvalidFlow;

    return flow.fetching ? <SessionLoadingView /> : <div className={styles.wrapper}>
        <div className={styles.authView}>
            {isInvalidFlow && <InvalidSession caption="invalid_auth_session_caption" message="invalid_auth_session_message" />}
            {showLogo && <div className={styles.logo} style={{ backgroundImage: `url(${flow?.logo || LogoImage})` }} />}
        </div>
    </div>;
};