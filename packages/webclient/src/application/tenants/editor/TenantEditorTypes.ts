import { ISysTenant } from "@porta/shared";
import { ITenantEditorModel } from "./TenantEditorForm";

/**
 * Interface for configuring the TenantEditor
 *
 * @export
 * @interface ITenantEditor
 */
export interface ITenantEditorProps {
    onClose: (values: ITenantEditorModel, isNew: boolean) => void;
    open: boolean;
    tenantId?: string;
}

/**
 * Interface for describing the internal state of
 * TenantEditor
 *
 * @export
 * @interface ITenantEditor
 */
export interface ITenantEditorState {
    title: string;
    record: ISysTenant;
}
