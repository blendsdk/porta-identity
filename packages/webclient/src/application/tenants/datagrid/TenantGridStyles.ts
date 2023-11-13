import { makeDataGridSize } from "@blendsdk/fluentrc";
import { makeStyles } from "@fluentui/react-components";

/**
 * Implements DataGrid sizing styles for TenantGrid
 */
export const useTenantGridSizeStyles = makeDataGridSize({
	displacement: "100px",
	maxHeight: "100vh"
});

/**
 * Implements styles for TenantGrid
 */
export const useTenantGridStyles = makeStyles({
	root: {}
});