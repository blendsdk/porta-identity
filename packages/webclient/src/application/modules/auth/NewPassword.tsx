import { FormFieldTextInput, Layout, ToolbarSpacer } from "@blendsdk/fui9";
import { Body1, Body2, Button, tokens } from "@fluentui/react-components";
import { ArrowRepeatAllFilled } from "@fluentui/react-icons";
import React from "react";
import { useTranslation } from "../../../system";
import { ResetPasswordLogic } from "./ResetPasswordLogic";
import { useStyles } from "./styles";

export interface INewPassword {
    reset: ResetPasswordLogic;
    disabled?: boolean;
}

export const NewPassword: React.FC<INewPassword> = ({ reset, disabled }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout className={styles.page} display="flex" flexDirection="column" gap={tokens.spacingVerticalM}>
            {!reset.showResetError && (
                <Body2 className={styles.info} style={{ marginTop: tokens.spacingVerticalM }}>
                    {t("reset_password_text")}
                </Body2>
            )}
            {reset.showResetError && <Body1 className={styles.error}>{t(reset.resetError)}</Body1>}
            <FormFieldTextInput form={reset.form} t={t} fieldName="new_password" inputProps={{ type: "password" }} />
            <FormFieldTextInput
                form={reset.form}
                t={t}
                fieldName="new_password_confirm"
                inputProps={{ type: "password" }}
            />
            <Layout
                display="flex"
                flexDirection="row"
                alignItems="center"
                justifyContent="center"
                gap={tokens.spacingHorizontalM}
            >
                <img src={reset.state.captcha} style={{ width: 200 }} />
                <Button size="large" icon={<ArrowRepeatAllFilled />} onClick={reset.onGetNewPatchaImage} />
            </Layout>
            <FormFieldTextInput form={reset.form} t={t} fieldName="captcha" />
            <ToolbarSpacer flex={1} />
            <Layout
                display="flex"
                flexDirection="row"
                justifyContent="flex-end"
                alignItems="center"
                gap={tokens.spacingHorizontalM}
            >
                <Button
                    appearance="primary"
                    onClick={() => {
                        reset.form.submitForm();
                    }}
                    disabled={disabled || !reset.form.isValid}
                >
                    {t("btn_confirm_change_password")}
                </Button>
            </Layout>
        </Layout>
    );
};
