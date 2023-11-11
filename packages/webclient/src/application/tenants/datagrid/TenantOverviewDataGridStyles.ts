import { makeDataGridSize } from "@blendsdk/fluentrc";
import { makeStyles, shorthands } from "@fluentui/react-components";

export const useTenantOverviewDataGridSizeStyles = makeDataGridSize({
    displacement: "100px",
    maxHeight: "100vh"
});

/**
 * Implements styles for TenantOverviewDataGrid
 */
export const useTenantOverviewDataGridStyles = makeStyles({
    root: {
        ...shorthands.flex(1)
    }
});
