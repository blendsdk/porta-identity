import { Layout, Loading } from "@blendsdk/fui9";
import { SessionLoadingView } from "@blendsdk/react";
import { Caption1 } from "@fluentui/react-components";
import React from "react";
import LogoImage from "../../../resources/logo.svg";
import { useTranslation } from "../../../system";
import { ChangePassword } from "./ChangePassword";
import { GetAccount } from "./GetAccount";
import { GetMFA } from "./GetMFA";
import { InvalidSession } from "./InvalidSession";
import { useLoginView } from "./LoginViewLogic";
import { useStyles } from "./styles";

export interface ILoginViewProps {}

export const LoginView: React.FC<ILoginViewProps> = () => {
    const styles = useStyles();
    const login = useLoginView();
    const { t } = useTranslation();

    return !login.ready ? (
        <SessionLoadingView />
    ) : (
        <div className={styles.wrapper} onKeyDown={login.onKandleKeyPress}>
            <form>
                <div className={styles.authView}>
                    {login.isInavlidSession && (
                        <InvalidSession
                            caption={t("invalid_auth_session_caption")}
                            message={t("invalid_auth_session_message")}
                        />
                    )}
                    {login.showBrand && (
                        <div className={styles.logo} style={{ backgroundImage: `url(${login.logo || LogoImage})` }} />
                    )}
                    {login.showWaitSpinner && <Loading style={{ flex: 1 }} size={"large"} label={t("please_wait")} />}
                    {login.showCredentials && <GetAccount login={login} disabled={login.fetching} />}
                    {login.showMFA && <GetMFA login={login} disabled={login.fetching} />}
                    {login.showChangePassword && <ChangePassword login={login} disabled={login.fetching} />}
                    {login.showBrand && (
                        <Layout display="flex" flexDirection="row" justifyContent="space-evenly">
                            <Caption1 className={styles.brandText}>{login.tenantName}</Caption1>
                            <Caption1 className={styles.brandText}>{login.applicationName}</Caption1>
                        </Layout>
                    )}
                </div>
            </form>
        </div>
    );
};
