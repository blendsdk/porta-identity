import {
	DataGrid,
	DataGridBody,
	DataGridCell,
	DataGridHeader,
	DataGridHeaderCell,
	DataGridProps, DataGridRow, Spinner
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
	const { columnDefinition, state, css } = useTenantOverviewDataGrid(props);

	const [sortState, setSortState] = React.useState<
		Parameters<NonNullable<DataGridProps["onSortChange"]>>[1]
	>({
		sortColumn: "name",
		sortDirection: "ascending",
	});
	const onSortChange: DataGridProps["onSortChange"] = (_e, nextSortState) => {
		setSortState(nextSortState);
	};

	return state.loading ? (<Spinner />) : (<DataGrid
		items={state.items}
		columns={columnDefinition}
		resizableColumns
		getRowId={(item: ITenantOverviewDataGridItem) => item.id}
		selectionAppearance="none"
		sortable
		sortState={sortState}
		onSortChange={onSortChange}
		style={{ maxHeight: "calc(100vh - 250px)", display: "flex", flexDirection: "column" }}
	>
		<DataGridHeader>
			<pre>{state.currentId}</pre>
			<DataGridRow appearance="brand">
				{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
			</DataGridRow>
		</DataGridHeader>
		<DataGridBody<ITenantOverviewDataGridItem> style={{ flex: 1, overflow: "auto" }}
		>
			{({ item, rowId }) => (
				<DataGridRow<ITenantOverviewDataGridItem> appearance="none" className={css.inactive} key={rowId}>
					{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
				</DataGridRow>
			)}
		</DataGridBody>
	</DataGrid>
	);
};