import { useObjectState, useRunOnce } from "@blendsdk/react";
import { DataGridProps } from "@fluentui/react-components";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "../../../system";
import { ITenantOverviewDataGridItem, createTenantOverviewDataGridColumnDefinition } from "./TenantOverviewDataGridModel";
import { tenantOverviewDataGridStore } from "./TenantOverviewDataGridStore";
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
		showConfirmDelete: false
	}));

	const onDeleteConfirmAction = useCallback((item: ITenantOverviewDataGridItem) => {
		setState({ currentItem: item, showConfirmDelete: true });
	}, [setState]);

	const onDeleteAction = useCallback(async () => {
		await tenantOverviewDataGridStore.deleteTenant(state.currentItem.id);
		await tenantOverviewDataGridStore.loadAll();
		setState({ showConfirmDelete: false });
	}, [setState, state.currentItem]);

	const columnDefinition = useMemo(() => {
		console.log("re-do");
		return createTenantOverviewDataGridColumnDefinition({
			t,
			onDeleteConfirmAction
		});
	}, [onDeleteConfirmAction, t]);

	useRunOnce((done) => {
		tenantOverviewDataGridStore.loadAll().then(done);
	});

	return {
		t,
		css,
		state,
		setState,
		columnDefinition,
		onDeleteAction,
		params,
		sortState,
		onSortChange,
		sizeCss,
		dataStore: tenantOverviewDataGridStore
	};
}