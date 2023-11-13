import {
	DataGrid,
	DataGridBody,
	DataGridCell,
	DataGridHeader,
	DataGridHeaderCell,
	DataGridRow,
	Spinner
} from "@fluentui/react-components";
import { useTenantGrid } from "./TenantGridLogic";
import { ITenantGridItem } from "./TenantGridModel";
import { ITenantGridProps } from "./TenantGridTypes";

/**
 * Implements the TenantGrid
 * @export
 */
export const TenantGrid: React.FC<ITenantGridProps> = props => {
	const { columnDefinition, dataStore, onSelectionChange } = useTenantGrid(props);
	return (
		<DataGrid
			items={dataStore.records}
			columns={columnDefinition}
			selectionMode="single"
			resizableColumns
			getRowId={(item: ITenantGridItem) => item.id}
			onSelectionChange={(e, data) => onSelectionChange(data.selectedItems)}
			selectionAppearance="brand"
			focusMode="none"
		>
			<DataGridHeader>
				<DataGridRow>
					{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
				</DataGridRow>
			</DataGridHeader>
			{dataStore.fetching ? (<Spinner size="small" style={{ padding: "4rem" }} />) : (
				<DataGridBody<ITenantGridItem>>
					{({ item, rowId }) => (
						<DataGridRow<ITenantGridItem> key={rowId}>
							{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
						</DataGridRow>
					)}
				</DataGridBody>
			)}
		</DataGrid >
	);
};