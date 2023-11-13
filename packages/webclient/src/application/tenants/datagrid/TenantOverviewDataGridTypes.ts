import { ITenantOverviewDataGridItem } from "./TenantOverviewDataGridModel";

/**
 * Interface describing the properties of TenantOverviewDataGrid
 *
 * @export
 * @interface TenantOverviewDataGrid
 */
export interface ITenantOverviewDataGridProps {}

/**
 * Interface for describing the internal state of
 * TenantOverviewDataGrid
 *
 * @export
 * @interface ITenantOverviewDataGrid
 */
export interface ITenantOverviewDataGridState {
    currentItem: ITenantOverviewDataGridItem;
    showConfirmDelete: boolean;
}
