import { Body1, Input, makeStyles, Subtitle1, tokens } from "@fluentui/react-components";
import { FormikProps } from "formik";
import React, { Fragment } from "react";
import { useTranslator } from "../../system/i18n";
import { FIELD_SIZE, IAuthenticationDialogModel } from "./types";

export interface IGetPassword {
    form: FormikProps<IAuthenticationDialogModel>;
}

const useStyles = makeStyles({
    validation: {
        color: tokens.colorPaletteRedForeground1
    }
});

export const GetPassword: React.FC<IGetPassword> = ({ form }) => {
    const { translate } = useTranslator();
    const styles = useStyles();

    return (
        <Fragment>
            <Subtitle1>{translate("password_caption")}</Subtitle1>
            <Input
                size={FIELD_SIZE}
                id="password"
                name="password"
                autoFocus
                onChange={form.handleChange}
                value={form.values.password}
                type="password"
                placeholder={translate("password_text_placeholder")}
            />
            {form.errors?.password && <Body1 className={styles.validation}>{translate(form.errors?.password)}</Body1>}
        </Fragment>
    );
};
