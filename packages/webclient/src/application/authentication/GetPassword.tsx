import { Body1, Input, Subtitle1 } from "@fluentui/react-components";
import { FormikProps } from "formik";
import React, { Fragment } from "react";
import { useTranslation } from "../../system/i18n";
import { FIELD_SIZE, IAuthenticationDialogModel } from "./lib";
import { useCheckFlowStore } from "./store";
import { useStyles } from "./styles";

export interface IGetPassword {
    form: FormikProps<IAuthenticationDialogModel>;
}

export const GetPassword: React.FC<IGetPassword> = ({ form }) => {
    const { t } = useTranslation();
    const styles = useStyles();
    const checkFlow = useCheckFlowStore();

    return (
        <Fragment>
            <Subtitle1>{t("password_caption")}</Subtitle1>
            <Input
                size={FIELD_SIZE}
                id="password"
                name="password"
                autoFocus
                disabled={checkFlow.fetching}
                onChange={form.handleChange}
                value={form.values.password}
                type="password"
                placeholder={t("password_text_placeholder")}
            />
            {form.errors?.password && <Body1 className={styles.validation}>{t(form.errors?.password)}</Body1>}
        </Fragment>
    );
};
