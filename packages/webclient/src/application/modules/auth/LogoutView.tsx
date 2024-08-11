import { Body2, Layout, Loading, tokens } from "@blendsdk/fui8";
import { SessionLoadingView } from "@blendsdk/react";
import { DefaultButton, PrimaryButton, SpinnerSize } from "@fluentui/react";
import React from "react";
import LogoImage from "../../../resources/logo.svg";
import { InvalidSession } from "./InvalidSession";
import { useStyles } from "./styles";
import { useLogoutFlow } from "./useLogoutFlow";

export const LogoutView: React.FC = () => {
    const styles = useStyles();
    const { state, t, setState, onProceedWithLogout } = useLogoutFlow();

    const isError = state?.error;
    const isInvalidFlow = isError;
    const showLogo = !isInvalidFlow;
    const showWaitSpinner = !isInvalidFlow && state.fetching === true;
    const showControlles = !showWaitSpinner && !isInvalidFlow && state.state === "inital";
    const stayLoggedIn = state.state === "keep";
    const proceedWithLogout = state.state === "end";
    const isComplete = state.state === "complete";

    return state.initializing ? <SessionLoadingView /> :
        <div className={styles.wrapper}>
            <div className={styles.authView}>
                {isInvalidFlow && <InvalidSession caption="invalid_logout_session_caption" message="invalid_logout_session_message" />}
                {showLogo && <div className={styles.logo} style={{ backgroundImage: `url(${state?.logo || LogoImage})` }} />}
                {showWaitSpinner && <Loading style={{ flex: 1 }} size={SpinnerSize.large} label={t("please_wait")} />}
                {proceedWithLogout && <Layout display="flex" flex={1} flexDirection="column" justifyContent="center" alignItems="center" gap={tokens.spacingM}>
                    <Loading style={{ flex: 1 }} size={SpinnerSize.large} label={t("please_wait_while_redirecting")} />
                </Layout>}
                {isComplete && <Layout display="flex" flex={1} flexDirection="column" justifyContent="center" alignItems="center" gap={tokens.spacingM}>
                    <Body2 style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span
                            style={{ textAlign: "center" }}
                            dangerouslySetInnerHTML={{ __html: t("logout_complete", state) }}
                        ></span>
                    </Body2>
                </Layout>}
                {stayLoggedIn && <Layout display="flex" flex={1} flexDirection="column" justifyContent="center" alignItems="center" gap={tokens.spacingM}>
                    <Body2 style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span
                            style={{ textAlign: "center" }}
                            dangerouslySetInnerHTML={{ __html: t("logout_canceled", state) }}
                        ></span>
                    </Body2>
                </Layout>}
                {showControlles &&
                    <Layout display="flex" flex={1} flexDirection="column" justifyContent="center" alignItems="center" gap={tokens.spacingM}>
                        <Body2 style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span
                                style={{ textAlign: "center" }}
                                dangerouslySetInnerHTML={{ __html: t("logout_confirm_message", state) }}
                            ></span>
                        </Body2>
                        <Layout display="flex" flexDirection="row" justifyContent="center" alignItems="center" gap={tokens.spacingM}>
                            <DefaultButton onClick={() => {
                                setState({ state: "keep" });
                            }}>
                                {t("keep_me_signed_in")}
                            </DefaultButton>
                            <PrimaryButton onClick={onProceedWithLogout}>
                                {t("btn_yes_logout")}
                            </PrimaryButton>
                        </Layout>
                    </Layout>
                }
            </div>
        </div>;
};