import { Layout } from "@blendsdk/fui9";
import { Body1, Subtitle1, tokens } from "@fluentui/react-components";
import { CloudErrorRegular } from "@fluentui/react-icons";
import { makeStyles } from "@griffel/react";
import React from "react";
import { useTranslation } from "../../../system";

const useStyles = makeStyles({
    text: {
        textAlign: "center"
    },
    icon: {
        width: "128px",
        height: "128px"
    }
});

export const InvalidSession: React.FC<{ caption: string; message: string }> = ({ message, caption }) => {
    const { t } = useTranslation();
    const styles = useStyles();

    return (
        <Layout
            display="flex"
            flexDirection="column"
            gap={tokens.spacingVerticalL}
            justifyContent="center"
            alignItems="center"
        >
            <CloudErrorRegular color={tokens.colorPaletteRedBackground3} className={styles.icon} />
            <Subtitle1 className={styles.text}>{t(caption)}</Subtitle1>
            <Body1 className={styles.text}>{t(message)}</Body1>
        </Layout>
    );
};
