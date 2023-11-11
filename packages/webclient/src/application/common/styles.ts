import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

export const useCommonStyles = makeStyles({
    flexColumn: {
        display: "flex",
        flexDirection: "column"
    },
    flexRow: {
        display: "flex",
        flexDirection: "row"
    },
    formGap: {
        ...shorthands.gap(tokens.spacingVerticalL)
    },
    flexFill: {
        ...shorthands.flex(1)
    },
    flexForm: {
        display: "flex",
        flexDirection: "column",
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalNone)
    },
    padded: {
        ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM)
    }
});
