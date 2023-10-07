import { makeStyles, shorthands, tokens } from "@fluentui/react-components";
import { pct } from "../../lib";

const useStyles = makeStyles({
    root: {
        ...shorthands.margin("auto"),
        ...shorthands.padding(tokens.spacingHorizontalL),
        maxWidth: pct(75),
        display: "flex",
        flexDirection: "column",
        ...shorthands.gap(tokens.spacingVerticalM)
    }
});

export const PageContainer: React.FC<React.PropsWithChildren> = ({ children }) => {
    const css = useStyles();
    return <div className={css.root}>{children}</div>;
};
