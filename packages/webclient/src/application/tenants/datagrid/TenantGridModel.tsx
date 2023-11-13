import { TTranslationFunction } from "@blendsdk/react";
import { TableCellLayout, TableColumnDefinition, createTableColumn } from "@fluentui/react-components";
import { ISysTenant, eSysTenant } from "@porta/shared";
/**
 * Interface describing the row type of TenantGrid
 *
 * @export
 * @interface TenantGrid
 */
export interface ITenantGridItem extends Pick<ISysTenant, "id" | "name" | "organization" | "is_active" | "allow_registration" | "allow_reset_password"> {
}

/**
 * Interface describing parameters for createTenantGridColumnDefinition
 *
 * @export
 * @interface ICreateTenantGridColumnDefinitionParams
 */
export interface ICreateTenantGridColumnDefinition {
	t: TTranslationFunction;
	onAction: (item: ITenantGridItem) => void;
}

function createTextDataCell(colName: string, t: TTranslationFunction) {
	return createTableColumn({
		columnId: colName,
		renderHeaderCell: () => {
			return t(colName);
		},
		renderCell: (item) => {
			return (
				<TableCellLayout>
					{item[colName]}
				</TableCellLayout>
			);
		},
	});
}

function createBooleanDataCell(colName: string, t: TTranslationFunction) {
	return createTableColumn({
		columnId: colName,
		renderHeaderCell: () => {
			return t(colName);
		},
		renderCell: (item) => {
			const val = item[colName];
			const text = val === true ? t(`${colName}_true`) : val === false ? t(`${colName}_false`) : t(`${colName}_undefined`);
			return (
				<TableCellLayout>
					{text}
				</TableCellLayout>
			);
		},
	});
}

/**
 * Create column definition for TenantGrid
 * @param {TTranslationFunction} t
 * @export
 * @return {*}  {TableColumnDefinition<ITenantGridItem>[]}
 */
export function createTenantGridColumnDefinition(
	{ t }: ICreateTenantGridColumnDefinition
): TableColumnDefinition<ITenantGridItem>[] {
	return [
		createTextDataCell(eSysTenant.NAME, t),
		createTextDataCell(eSysTenant.ORGANIZATION, t),
		createBooleanDataCell(eSysTenant.IS_ACTIVE, t)
	];
}