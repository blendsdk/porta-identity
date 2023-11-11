import { useObjectState, useRunOnce } from "@blendsdk/react";
import { DataGridProps } from "@fluentui/react-components";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "../../../system";
import { ApplicationApi } from "../../../system/api";
import { ITenantOverviewDataGridItem, createTenantOverviewDataGridColumnDefinition } from "./TenantOverviewDataGridModel";
import { useTenantOverviewDataGridSizeStyles, useTenantOverviewDataGridStyles } from "./TenantOverviewDataGridStyles";
import { ITenantOverviewDataGridProps, ITenantOverviewDataGridState } from "./TenantOverviewDataGridTypes";

/**
 * Implements logic for TenantOverviewDataGrid
 *
 * @export
 * @param {ITenantOverviewDataGridProps} params
 * @return {*}
 */
export function useTenantOverviewDataGrid(params: ITenantOverviewDataGridProps) {
	const css = useTenantOverviewDataGridStyles();
	const sizeCss = useTenantOverviewDataGridSizeStyles();

	const { t } = useTranslation();

	const [sortState, setSortState] = useState<
		Parameters<NonNullable<DataGridProps["onSortChange"]>>[1]
	>({
		sortColumn: "name",
		sortDirection: "ascending",
	});
	const onSortChange: DataGridProps["onSortChange"] = (_e, nextSortState) => {
		setSortState(nextSortState);
	};


	const [state, setState] = useObjectState<Partial<ITenantOverviewDataGridState>>(() => ({
		items: [],
		currentId: undefined,
		loading: false,
	}));

	const onDeleteConfirmAction = useCallback((item: ITenantOverviewDataGridItem) => {
		setState({ currentId: item.id });
	}, [setState]);

	const columnDefinition = useMemo(() => {
		console.log("re-do");
		return createTenantOverviewDataGridColumnDefinition({
			t,
			onDeleteConfirmAction
		});
	}, [onDeleteConfirmAction, t]);

	useRunOnce((done) => {
		setState({ loading: true });
		ApplicationApi.openIdTenant.listOpenIdTenant({ tenant: undefined }).then(({ data }) => {
			setState({
				loading: false,
				items: data.map(({ id, name, organization, is_active }) => {
					return {
						id,
						name,
						organization,
						is_active
					};
				})
			});
			done();
		});
	});

	return { css, state, setState, columnDefinition, params, sortState, onSortChange, sizeCss };
}