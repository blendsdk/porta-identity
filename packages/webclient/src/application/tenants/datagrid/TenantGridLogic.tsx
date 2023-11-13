import { useObjectState, useRunOnce } from "@blendsdk/react";
import { TableRowId } from "@fluentui/react-components";
import { useCallback, useMemo } from "react";
import { useTranslation } from "../../../system";
import { createTenantGridColumnDefinition } from "./TenantGridModel";
import { useTenantGridStore } from "./TenantGridStore";
import { useTenantGridSizeStyles, useTenantGridStyles } from "./TenantGridStyles";
import { ITenantGridProps, ITenantGridState } from "./TenantGridTypes";

/**
 * Implements logic for TenantGrid
 *
 * @export
 * @param {ITenantGridProps} params
 * @return {*}
 */
export function useTenantGrid(params: ITenantGridProps) {
	const { t } = useTranslation();
	const css = useTenantGridStyles();
	const sizeCss = useTenantGridSizeStyles();
	const dataStore = useTenantGridStore();

	const [state, setState] = useObjectState<Partial<ITenantGridState>>(() => ({
		selectedItem: undefined
	}));

	const onSelectionChange = useCallback((data: Set<TableRowId>) => {
		const value = data.values().next().value;
		params.onSelectItem(dataStore.findLocalItem(value));
	}, [dataStore, params]);

	const columnDefinition = useMemo(() => {
		return createTenantGridColumnDefinition({
			t,
			onAction: () => { }
		});
	}, [t]);

	useRunOnce(done => {
		dataStore.loadAll().then(done);
	});

	return {
		css,
		state,
		setState,
		columnDefinition,
		params,
		sizeCss,
		dataStore,
		onSelectionChange
	};
}