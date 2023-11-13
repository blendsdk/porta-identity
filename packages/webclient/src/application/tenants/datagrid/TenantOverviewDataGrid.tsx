import { ConfirmDialog } from "@blendsdk/fluentrc";
import {
	Body1,
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
	const { columnDefinition, state, sortState, onSortChange, sizeCss, css, dataStore, t, onDeleteAction } = useTenantOverviewDataGrid(props);

	console.log(dataStore.fetching);

	return dataStore.fetching ? (<Spinner />) : (<>
		<DataGrid
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
		<ConfirmDialog
			open={state.showConfirmDelete}
			onClose={(confirm: boolean) => {
				if (confirm) {
					onDeleteAction();
				}
			}}
			danger
			title={t("delete_tenant_dialog_title", state.currentItem)}
			buttonConfirmText={t("delete_tenant_button")}
			buttonDeclineText={"keep_tenant_button"}>
			<Body1>{t("delete_tenant_dialog_title_message", state.currentItem)}</Body1>
		</ConfirmDialog>
	</>
	);
};