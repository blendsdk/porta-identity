import { makeDialogSize } from "@blendsdk/fluentrc";
import { makeStyles } from "@fluentui/react-components";

/**
 * Implements styles for sizing the  TenantEditor dialog
 */
export const useDialogSize = makeDialogSize({
    minHeight: "10rem"
});

/**
 * Implements styles for TenantEditor
 */
export const useTenantEditorStyles = makeStyles({
    root: {}
});
