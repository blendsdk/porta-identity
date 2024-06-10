import { useGlobalTranslation } from "@blendsdk/react";
import { Text } from "@fluentui/react";
import { makeStyles } from "@griffel/react";

const useStyles = makeStyles({
    icon: {
        display: "flex", flexDirection: "column", alignItems: "center"
    },
    root: {}
});

export const AccessDeniedContent = () => {
    const gt = useGlobalTranslation();
    const s = useStyles();
    //TODO: FIX AccessDeniedContent, fix the types
    return <div className={s.root}>
        <Text>{gt.translate("access_denied")}</Text>
        <Text>{gt.translate("no_permissions1")}</Text>
        <Text>{gt.translate("no_permissions2")}</Text>

        {/* <Subtitle2 align="center">{gt.translate("access_denied")}</Subtitle2>
        <Body2 align="center">{gt.translate("no_permissions1")}</Body2>
        <Body2 align="center">{gt.translate("no_permissions2")}</Body2> */}
    </div>;
};