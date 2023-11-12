import { Slot } from "@blendsdk/react";
/**
 * Interface describing the properties of TenantOverviewDataGrid
 *
 * @export
 * @interface TenantOverviewDataGrid
 */
export interface ITenantOverviewDataGridProps {
    top?: Slot;
}

/**
 * Interface for describing the internal state of
 * TenantOverviewDataGrid
 *
 * @export
 * @interface ITenantOverviewDataGrid
 */
export interface ITenantOverviewDataGridState {
    currentId: string;
}
