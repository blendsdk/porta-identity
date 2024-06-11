import { Body1, Layout, Subtitle1, tokens } from "@blendsdk/fui8";
import { FontIcon } from "@fluentui/react";
import { makeStyles } from "@griffel/react";
import React from "react";
import { useTranslation } from "../../../system";

const useStyles = makeStyles({
    text: {
        textAlign: "center"
    },
    icon: {
        textAlign: "center",
        fontSize: "8rem",
        color: tokens.paletteRed
    }
});

export const InvalidSession: React.FC<{ caption: string; message: string; }> = ({ message, caption }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout display="flex" flexDirection="column" gap={tokens.spacingL1}>
            <FontIcon className={styles.icon} iconName="Warning" />
            <Subtitle1 className={styles.text}>{t(caption)}</Subtitle1>
            <Body1 className={styles.text}>{t(message)}</Body1>
        </Layout>
    );
};
