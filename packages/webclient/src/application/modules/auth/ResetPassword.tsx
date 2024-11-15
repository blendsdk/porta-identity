import { Layout, Loading, ToolbarSpacer } from "@blendsdk/fui9";
import { SessionLoadingView } from "@blendsdk/react";
import { Body1, Caption1, Divider } from "@fluentui/react-components";
import LogoImage from "../../../resources/logo.svg";
import { useTranslation } from "../../../system";
import { InvalidSession } from "./InvalidSession";
import { NewPassword } from "./NewPassword";
import { useResetPassword } from "./ResetPasswordLogic";
import { useStyles } from "./styles";

export const ResetPassword: React.FC = () => {
    const reset = useResetPassword();
    const styles = useStyles();
    const { t } = useTranslation();

    console.log(reset.showBrand);

    return !reset.ready ? (
        <SessionLoadingView />
    ) : (
        <div className={styles.wrapper}>
            <form>
                <div className={styles.authView}>
                    {reset.isInvalidSession && (
                        <InvalidSession
                            caption={t("invalid_reset_session_caption")}
                            message={t("invalid_reset_session_message")}
                        />
                    )}
                    {reset.showBrand && (
                        <div className={styles.logo} style={{ backgroundImage: `url(${reset.logo || LogoImage})` }} />
                    )}
                    {reset.showWaitSpinner && <Loading style={{ flex: 1 }} size={"large"} label={t("please_wait")} />}
                    {reset.showGetPassword && <NewPassword reset={reset} disabled={reset.fetching} />}
                    {reset.showComplete && (
                        <>
                            <ToolbarSpacer flex={1} />
                            <Body1>{t("reset_password_complete")}</Body1>
                            <ToolbarSpacer flex={1} />
                        </>
                    )}
                    {reset.showControls && <Divider />}
                    {reset.showBrand && (
                        <Layout display="flex" flexDirection="row" justifyContent="space-evenly">
                            <Caption1 className={styles.brandText}>{reset.tenantName}</Caption1>
                            <Caption1 className={styles.brandText}>{reset.applicationName}</Caption1>
                        </Layout>
                    )}
                </div>
            </form>
        </div>
    );
};
