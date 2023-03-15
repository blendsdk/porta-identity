import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

export const useStyles = makeStyles({
    wrapper: {
        backgroundColor: tokens.colorNeutralBackground1Hover,
        backgroundSize: "cover",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: "100%",
        height: "100%",
        boxSizing: "border-box"
    },
    authView: {
        backgroundColor: tokens.colorNeutralBackground1,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        ...shorthands.gap(tokens.spacingVerticalL),
        ...shorthands.padding("1rem"),
        "@media only screen and (min-width: 600px)": {
            display: "flex",
            position: "absolute",
            width: "440px",
            transform: "translate(-50%, -50%)",
            top: "50%",
            left: "50%",
            boxShadow: tokens.shadow4,
            ...shorthands.borderRadius(tokens.borderRadiusSmall)
        }
    },
    logo: {
        maxHeight: "48px"
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
    }
});
