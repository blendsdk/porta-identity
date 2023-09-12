import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

export const useStyles = makeStyles({
    org: {
        color: tokens.colorNeutralStroke1Pressed
    },
    org_spacer: {
        ...shorthands.flex(1)
    },
    orgWrapper: {
        display: "flex",
        flexDirection: "row"
    },
    wrapper: {
        backgroundColor: tokens.colorNeutralBackground1Hover,
        backgroundSize: "cover",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        "& form": {
            position: "relative",
            height: "100%"
        }
    },
    authViewContent: {
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        ...shorthands.flex(1),
        ...shorthands.gap(tokens.spacingVerticalL),
        "@media only screen and (min-width: 600px)": {
            justifyContent: "space-evenly"
        },
        "@media only screen and (max-width: 600px)": {
            justifyContent: "start"
        }
    },
    authView: {
        backgroundColor: tokens.colorNeutralBackground1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "start",
        boxSizing: "border-box",
        ...shorthands.gap(tokens.spacingVerticalL),
        ...shorthands.padding("1rem"),
        "@media only screen and (min-width: 600px)": {
            display: "flex",
            position: "absolute",
            width: "440px",
            minHeight: "300px",
            transform: "translate(-50%, -50%)",
            top: "50%",
            left: "50%",
            boxShadow: tokens.shadow4,
            ...shorthands.borderRadius(tokens.borderRadiusSmall)
        },
        "@media only screen and (max-width: 600px)": {
            height: "100%",
            position: "relative"
        }
    },
    logo: {
        minHeight: "72px",
        maxHeight: "72px",
        height: "72px",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
        backgroundPositionX: "center",
        backgroundPositionY: "center"
    },
    footer: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "end"
    },
    button: {
        ...shorthands.flex(1)
    },
    spacer: {
        width: "1rem"
    },
    redirect: {
        textAlign: "center"
    },
    spinner: {
        ...shorthands.padding("1rem"),
        ...shorthands.flex(1)
    },
    logout_message: {
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...shorthands.padding("1rem"),
        "& span": {
            textAlign: "center"
        }
    }
});
