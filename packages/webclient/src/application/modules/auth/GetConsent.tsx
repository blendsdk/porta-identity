import { Body1Strong, FormCheckboxField, Layout, tokens } from "@blendsdk/fui8";
import { DefaultButton, makeStyles, MessageBar, MessageBarType, PrimaryButton } from "@fluentui/react";
import { shorthands } from "@griffel/react";
import { FormikProps } from "formik";
import { useTranslation } from "../../../system";
import { IAuthenticationDialogModel, IUseAuthenticationFlowState } from "./useAuthenticationFlow";

export interface IGetConsent {
    form: FormikProps<IAuthenticationDialogModel>;
    flowState: IUseAuthenticationFlowState;
    disabled?: boolean;
}

const useStyles = makeStyles({
    root: {
        flex: 1,
        "& a": {
            ...shorthands.textDecoration("none"),
            ":hover": {
                ...shorthands.textDecoration("underline"),
            }
        }
    },
    text: {
        flex: 1,
        //padding: tokens.spacingS1
    },
    center: {
        textAlign: "center"
    }
});

export const GetConsent: React.FC<IGetConsent> = ({ form, disabled, flowState }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout className={styles.root} display="flex" flexDirection="column" gap={tokens.spacingM}>
            <Layout display="flex" flexDirection="column" gap={tokens.spacingM} className={styles.text}>
                <Body1Strong className={styles.center}>{t("greet_concent", flowState)}</Body1Strong>
                <Body1Strong>{t("greet_consent_app", flowState)}</Body1Strong>
            </Layout>
            <Layout display="flex" flexDirection="column" gap={tokens.spacingM}>
                {flowState.consent_claims.map(claim => {
                    return <MessageBar key={claim} messageBarType={claim === "openid" || claim == "offline " ? MessageBarType.info : MessageBarType.success}>{t(`consent_${claim}`)}</MessageBar>;
                })}
            </Layout>
            {flowState.ow_consent && <FormCheckboxField fieldName="ow_consent" form={form} t={t} label={t("admin_ow_consent")} />}
            <Layout display="flex" flexDirection="row" justifyContent="flex-end" alignItems="center" gap={tokens.spacingM}>
                <DefaultButton
                    onClick={() => {
                        form.setFieldValue("consent", false);
                        form.submitForm();
                    }}
                    text={t("btn_consent_decline")}
                    disabled={disabled || !form.isValid}
                    style={{ flex: flowState?.allow_reset_password ? 1 : "none" }}
                />
                <PrimaryButton
                    onClick={() => {
                        form.setFieldValue("consent", true);
                        form.submitForm();
                    }}
                    text={t("btn_consent_accept")}
                    disabled={disabled || !form.isValid}
                    style={{ flex: flowState?.allow_reset_password ? 1 : "none" }}
                />
            </Layout>
        </Layout>
    );
};