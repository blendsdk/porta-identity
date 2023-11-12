/**
 * Interface for configuring the TenantEditorDialog
 *
 * @export
 * @interface ITenantEditorDialog
 */
export interface ITenantEditorDialogProps {
    open: boolean;
    onClose: () => void;
    tenantId?: string;
}

/**
 * Interface for describing the internal state of
 * TenantEditorDialog
 *
 * @export
 * @interface ITenantEditorDialog
 */
export interface ITenantEditorDialogState extends Pick<ITenantEditorDialogProps, "tenantId"> {
    title: string;
    saving: boolean;
}
