import { useGlobalRouter, useObjectState } from "@blendsdk/react";
import { ISysTenant } from "@porta/shared";
import { useEffect } from "react";
import { useTranslation } from "../../../system";
import { useTenantGridStore } from "../datagrid/TenantGridStore";
import { useTenantEditorForm, validationSchema } from "./TenantEditorForm";
import { useDialogSize, useTenantEditorStyles } from "./TenantEditorStyles";
import { ITenantEditorProps, ITenantEditorState } from "./TenantEditorTypes";

/**
 * Implements logic for TenantEditor
 *
 * @export
 * @param {ITenantEditorProps} params
 * @return {*}
 */
export function useTenantEditor(params: ITenantEditorProps) {
	const { t } = useTranslation();
	const router = useGlobalRouter();
	const css = useTenantEditorStyles();
	const dlgCss = useDialogSize();
	const isNew = !params.tenantId;
	const dataStore = useTenantGridStore();

	const [state, setState] = useObjectState<Partial<ITenantEditorState>>(() => ({
		title: undefined,
		record: undefined
	}));

	const form = useTenantEditorForm({
		validateOnBlur: true,
		validateOnMount: false,
		validateOnChange: true,
		initialValues: () => ({
			name: "",
			organization: "",
			allow_registration: false,
			allow_reset_password: false,
			is_active: true,
			email: "",
			password: ""
		}),
		validationSchema: () => validationSchema(router, isNew),
		onSubmit: async (values) => {
			params.onClose(values, isNew, false);
		}
	});

	useEffect(() => {
		const worker = new Promise<void>(async (resolve) => {
			if (params.open) {
				const record: ISysTenant = dataStore.findLocalItem(params.tenantId) as ISysTenant;
				setState({
					record,
					title: record ? t("tenant_editor_title_edit", record) : t("tenant_editor_title_new")
				});
				if (record) {
					await form.setValues({
						name: record.name,
						organization: record.organization,
						email: "?",
						allow_registration: record.allow_registration,
						allow_reset_password: record.allow_reset_password,
						password: "?",
						is_active: record.is_active
					});
				} else {
					form.resetForm();
				}
			}
			resolve();
		});
		worker.then();
	}, [params.open, params.tenantId]);

	return { form, css, dlgCss, t, state, setState, isNew };
}