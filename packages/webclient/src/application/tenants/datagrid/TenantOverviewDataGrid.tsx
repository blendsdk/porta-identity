import {
	DataGrid,
	DataGridBody,
	DataGridCell,
	DataGridHeader,
	DataGridHeaderCell,
	DataGridRow,
	Spinner,
	mergeClasses,
} from "@fluentui/react-components";
import React from "react";
import { useTenantOverviewDataGrid } from "./TenantOverviewDataGridLogic";
import { ITenantOverviewDataGridItem } from "./TenantOverviewDataGridModel";
import { ITenantOverviewDataGridProps } from "./TenantOverviewDataGridTypes";

/**
 * Implements the TenantOverviewDataGrid
 * @export
 */
export const TenantOverviewDataGrid: React.FC<ITenantOverviewDataGridProps> = props => {
	const { columnDefinition, state, sortState, onSortChange, sizeCss, css, dataStore } = useTenantOverviewDataGrid(props);

	return dataStore.fetching ? (<Spinner />) : (<DataGrid
		items={dataStore.records}
		columns={columnDefinition}
		resizableColumns
		getRowId={(item: ITenantOverviewDataGridItem) => item.id}
		selectionAppearance="none"
		sortable
		sortState={sortState}
		onSortChange={onSortChange}
		className={mergeClasses(css.root, sizeCss.dataGrid)}
	>
		<DataGridHeader>
			<pre>{state.currentId}</pre>
			<DataGridRow appearance="brand">
				{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
			</DataGridRow>
		</DataGridHeader>
		<DataGridBody<ITenantOverviewDataGridItem> className={sizeCss.dataGridBody}>
			{({ item, rowId }) => (
				<DataGridRow<ITenantOverviewDataGridItem> appearance="none" key={rowId} className={sizeCss.dataGridRow}>
					{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
				</DataGridRow>
			)}
		</DataGridBody>
	</DataGrid>
	);
};