import { Stack } from "@blendsdk/fluentrc";
import { TTranslationFunction } from "@blendsdk/react";
import { Button, TableCellLayout, TableColumnDefinition, createTableColumn } from "@fluentui/react-components";
import {
	DeleteRegular,
	EditRegular
} from "@fluentui/react-icons";
import { ISysTenant, eSysTenant } from "@porta/shared";
/**
 * Interface describing the row type of TenantOverviewDataGrid
 *
 * @export
 * @interface TenantOverviewDataGrid
 */
export interface ITenantOverviewDataGridItem extends Pick<ISysTenant, "name" | "organization" | "is_active" | "id"> { }

/**
 *
 *
 * @export
 * @interface ICreateTenantOverviewDataGridColumnDefinitionParams
 */
export interface ICreateTenantOverviewDataGridColumnDefinitionParams {
	t: TTranslationFunction,
	onDeleteConfirmAction: (item: ITenantOverviewDataGridItem) => void;
}

/**
 * Create column definition for TenantOverviewDataGrid
 *
 * @export
 * @return {*}  {TableColumnDefinition<ITenantOverviewDataGridItem>[]}
 */
export function createTenantOverviewDataGridColumnDefinition(params: ICreateTenantOverviewDataGridColumnDefinitionParams): TableColumnDefinition<ITenantOverviewDataGridItem>[] {
	const { t, onDeleteConfirmAction } = params;
	return Object.values(eSysTenant).map((colName) => {
		switch (colName) {
			case eSysTenant.$name:
				return createTableColumn<ITenantOverviewDataGridItem>({
					columnId: "actions",
					renderHeaderCell: () => {
						return "Actions";
					},
					renderCell: (item) => {
						return (
							<Stack horizontal gap="0.5rem" style={{ padding: "0.5rem" }}>
								<Button size="small" appearance="subtle" icon={<EditRegular />} onClick={() => {
									onDeleteConfirmAction(item);
								}} />
								<Button size="small" appearance="subtle" icon={<DeleteRegular />} />
							</Stack>
						);
					},
				});
			case eSysTenant.ORGANIZATION:
			case eSysTenant.NAME:
				return createTableColumn<ITenantOverviewDataGridItem>({
					columnId: colName,
					renderHeaderCell: () => {
						return t(colName);
					},
					compare: (a, b) => {
						return a[colName].localeCompare(b[colName]);
					},
					renderCell: (item) => {
						return (
							<TableCellLayout>
								{item[colName]}
							</TableCellLayout>
						);
					},
				});
			default:
				return null;
		}
	}).filter(Boolean);
}
