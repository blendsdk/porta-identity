import { FormFieldCheckbox, Layout } from "@blendsdk/fui9";
import { Body1Strong, Button, MessageBar, tokens } from "@fluentui/react-components";
import { useTranslation } from "../../../system";
import { LoginViewLogic } from "./LoginViewLogic";
import { useStyles } from "./styles";

export interface IGetConsent {
    login: LoginViewLogic;
    disabled?: boolean;
}

export const GetConsent: React.FC<IGetConsent> = ({ login, disabled }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    console.log(login.applicationName);

    return (
        <Layout className={styles.page} display="flex" flexDirection="column" gap={tokens.spacingVerticalM}>
            <Layout display="flex" flexDirection="column" gap={tokens.spacingVerticalM} flex={1}>
                <Body1Strong className={styles.center}>
                    {t("greet_concent", { consent_display_name: login.consent_display_name })}
                </Body1Strong>
                <Body1Strong>
                    {t("greet_consent_app", { application_name: login.applicationName, tenant_name: login.tenantName })}
                </Body1Strong>
            </Layout>
            <Layout display="flex" flexDirection="column" gap={tokens.spacingVerticalM}>
                {login.consent_claims.map((claim) => {
                    return (
                        <MessageBar
                            shape="rounded"
                            key={claim}
                            intent={claim === "openid" || claim == "offline " ? "info" : "success"}
                        >
                            {t(`consent_${claim}`)}
                        </MessageBar>
                    );
                })}
            </Layout>
            {login.can_ow_consent && (
                <FormFieldCheckbox fieldName="ow_consent" form={login.form} t={t} fieldLabel={t("admin_ow_consent")} />
            )}
            <Layout
                display="flex"
                flexDirection="row"
                justifyContent="flex-end"
                alignItems="center"
                gap={tokens.spacingHorizontalM}
            >
                <Button
                    className={styles.fill}
                    appearance="secondary"
                    onClick={() => {
                        login.form.setFieldValue("consent", false);
                        login.form.submitForm();
                    }}
                    disabled={disabled || !login.form.isValid}
                >
                    {t("btn_consent_decline")}
                </Button>
                <Button
                    className={styles.fill}
                    appearance="primary"
                    onClick={() => {
                        login.form.setFieldValue("consent", true);
                        login.form.submitForm();
                    }}
                    disabled={disabled || !login.form.isValid}
                >
                    {t("btn_consent_accept")}
                </Button>
            </Layout>
        </Layout>
    );
};
