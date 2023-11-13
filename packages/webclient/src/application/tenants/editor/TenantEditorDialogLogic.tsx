import { useGlobalRouter, useObjectState } from "@blendsdk/react";
import { useSystemError, useTranslation } from "../../../system";
import { ApplicationApi } from "../../../system/api";
import { useTenantEditorDialogForm, validationSchema } from "./TenantEditorDialogForm";
import { useDialogSize, useTenantEditorDialogStyles } from "./TenantEditorDialogStyles";
import { ITenantEditorDialogProps, ITenantEditorDialogState } from "./TenantEditorDialogTypes";

/**
 * Implements logic for TenantEditorDialog
 *
 * @export
 * @param {ITenantEditorDialogProps} props
 * @return {*}
 */
export function useTenantEditorDialog(props: ITenantEditorDialogProps) {
	const { catchSystemError } = useSystemError();
	const router = useGlobalRouter();
	const { t } = useTranslation();
	const css = useTenantEditorDialogStyles();
	const dlgCss = useDialogSize();

	const [state, setState] = useObjectState<Partial<ITenantEditorDialogState>>(() => ({
		title: "TODO: Title",
		tenantId: props.tenantId,
		saving: false

	}));

	const form = useTenantEditorDialogForm({
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
		validationSchema: () => validationSchema(router),
		onSubmit: async (values) => {
			try {
				setState({ saving: true });
				await ApplicationApi.openIdTenant.createOpenIdTenant({
					tenant: undefined,
					...values
				} as any);
				setState({ saving: false });
				props.onClose();
			} catch (err) {
				catchSystemError(err);
			}

		}
	});
	return { form, css, dlgCss, t, router, state, setState };
}