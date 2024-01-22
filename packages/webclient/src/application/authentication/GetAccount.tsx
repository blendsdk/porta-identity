import { Body1, FormCheckboxField, FormTextField, Layout, ToolbarSpacer, tokens } from "@blendsdk/fui8";
import { Link } from "@blendsdk/react";
import { PrimaryButton } from "@fluentui/react";
import { makeStyles, shorthands } from "@griffel/react";
import { IFlowInfo } from "@porta/shared";
import { FormikProps } from "formik";
import React from "react";
import { useRouter } from "../../system";
import { useTranslation } from "../../system/i18n";
import { eAppRoutes } from "../routing";
import { IAuthenticationDialogModel } from "./types";

export interface IGetAccount {
    form: FormikProps<IAuthenticationDialogModel>;
    flowInfo: IFlowInfo;
    disabled?: boolean;
}

const useStyles = makeStyles({
    root: {
        "& a": {
            ...shorthands.textDecoration("none"),
            ":hover": {
                ...shorthands.textDecoration("underline"),
            }
        }
    }
});

export const GetAccount: React.FC<IGetAccount> = ({ form, disabled, flowInfo }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const styles = useStyles();

    return (
        <Layout className={styles.root} display="flex" flexDirection="column" gap={tokens.spacingM}>
            <FormTextField form={form} t={t} fieldName="username" />
            <FormTextField form={form} t={t} fieldName="password" type="password" />
            <FormCheckboxField form={form} t={t} fieldName="rememberMe" />
            <ToolbarSpacer flex={1} />
            <Layout display="flex" flexDirection="row" justifyContent="flex-end" alignItems="center" gap={tokens.spacingM}>
                {flowInfo?.allow_reset_password && (
                    <>
                        <Link to={router.generateUrl(eAppRoutes.forgotPassword.path)} reload>
                            <Body1>{t("forgot_password_link")}</Body1>
                        </Link>
                        <ToolbarSpacer />
                    </>
                )}
                <PrimaryButton
                    onClick={() => { form.submitForm(); }}
                    text={t("btn_signin")}
                    disabled={disabled || !form.isValid}
                    style={{ flex: flowInfo?.allow_reset_password ? 1 : "none" }}
                />
            </Layout>
        </Layout>
    );
};
