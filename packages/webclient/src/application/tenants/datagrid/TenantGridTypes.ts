import { ITenantGridItem } from "./TenantGridModel";
/**
 * Interface describing the properties of TenantGrid
 *
 * @export
 * @interface TenantGrid
 */
export interface ITenantGridProps {
    onSelectItem: (item: ITenantGridItem) => void;
}

/**
 * Interface for describing the internal state of
 * TenantGrid
 *
 * @export
 * @interface ITenantGrid
 */
export interface ITenantGridState {
    selectedItem: ITenantGridItem;
}
