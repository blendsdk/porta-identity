import { Layout, Loading } from "@blendsdk/fui9";
import { SessionLoadingView } from "@blendsdk/react";
import { Body2, Button, Caption1, Divider, tokens } from "@fluentui/react-components";
import React from "react";
import LogoImage from "../../../resources/logo.svg";
import { useTranslation } from "../../../system";
import { InvalidSession } from "./InvalidSession";
import { useLogoutView } from "./LogoutViewLogic";
import { useStyles } from "./styles";

export const LogoutView: React.FC = () => {
    const logout = useLogoutView();
    const styles = useStyles();
    const { t } = useTranslation();

    return !logout.ready ? (
        <SessionLoadingView />
    ) : (
        <div className={styles.wrapper}>
            <form>
                <div className={styles.authView}>
                    {logout.isInavlidSession && (
                        <InvalidSession
                            caption={t("invalid_logout_session_caption")}
                            message={t("invalid_logout_session_message")}
                        />
                    )}
                    {logout.showBrand && (
                        <div className={styles.logo} style={{ backgroundImage: `url(${logout.logo || LogoImage})` }} />
                    )}
                    {logout.showWaitSpinner && <Loading style={{ flex: 1 }} size={"large"} label={t("please_wait")} />}
                    {logout.showUserOptions && (
                        <Layout
                            display="flex"
                            flex={1}
                            flexDirection="column"
                            justifyContent="center"
                            alignItems="center"
                            gap={tokens.spacingVerticalM}
                        >
                            <Body2 style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span
                                    style={{ textAlign: "center" }}
                                    dangerouslySetInnerHTML={{
                                        __html: t("logout_confirm_message", {
                                            application_name: logout.applicationName
                                        })
                                    }}
                                ></span>
                            </Body2>
                            <Layout
                                display="flex"
                                flexDirection="row"
                                justifyContent="center"
                                alignItems="center"
                                gap={tokens.spacingHorizontalM}
                            >
                                <Button appearance="secondary" onClick={logout.onLogoutCancel}>
                                    {t("keep_me_signed_in")}
                                </Button>
                                <Button appearance="primary" onClick={logout.onProceedWithLogout}>
                                    {t("btn_yes_logout")}
                                </Button>
                            </Layout>
                        </Layout>
                    )}
                    {logout.showCancelLogout && (
                        <Layout
                            display="flex"
                            flex={1}
                            flexDirection="column"
                            justifyContent="center"
                            alignItems="center"
                            gap={tokens.spacingVerticalM}
                        >
                            <Body2 style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span
                                    style={{ textAlign: "center" }}
                                    dangerouslySetInnerHTML={{
                                        __html: t("logout_canceled", { application_name: logout.applicationName })
                                    }}
                                ></span>
                            </Body2>
                        </Layout>
                    )}
                    {logout.showLogoutComplete && (
                        <Layout
                            display="flex"
                            flex={1}
                            flexDirection="column"
                            justifyContent="center"
                            alignItems="center"
                            gap={tokens.spacingVerticalM}
                        >
                            <Body2 style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span
                                    style={{ textAlign: "center" }}
                                    dangerouslySetInnerHTML={{ __html: t("logout_complete") }}
                                ></span>
                            </Body2>
                        </Layout>
                    )}
                    {logout.showControls && <Divider style={{ flexGrow: "unset" }} />}
                    {logout.showBrand && (
                        <Layout display="flex" flexDirection="row" justifyContent="space-evenly">
                            <Caption1 className={styles.brandText}>{logout.tenantName}</Caption1>
                            <Caption1 className={styles.brandText}>{logout.applicationName}</Caption1>
                        </Layout>
                    )}
                </div>
            </form>
        </div>
    );
};
