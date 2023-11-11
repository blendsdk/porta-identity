import { makeDialogSize } from "@blendsdk/fluentrc";
import { makeStyles } from "@fluentui/react-components";

/**
 * Implements styles for sizing the  TenantEditorDialog dialog
 */
export const useDialogSize = makeDialogSize({
    minHeight: "10rem"
});

/**
 * Implements styles for TenantEditorDialog
 */
export const useTenantEditorDialogStyles = makeStyles({
    root: {}
});
