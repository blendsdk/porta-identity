import { makeStyles } from "@fluentui/react-components";

/**
 * Implements styles for TenantOverviewDataGrid
 */
export const useTenantOverviewDataGridStyles = makeStyles({
    root: {},
    inactive: {
        "&:active": {
            backgroundColor: "auto"
        }
    }
});
