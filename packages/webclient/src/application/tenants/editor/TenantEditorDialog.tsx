import { FormTextField, Stack } from "@blendsdk/fluentrc";
import { makeForm, useGlobalTranslation } from "@blendsdk/react";
import {
	Button,
	Checkbox,
	Dialog,
	DialogActions,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	Spinner,
} from "@fluentui/react-components";
import { eSysTenant, eSysUser, eSysUserProfile } from "@porta/shared";
import React from "react";
import { useTenantEditorDialog } from "./TenantEditorDialogLogic";
import { ITenantEditorDialogProps } from "./TenantEditorDialogTypes";

function useValidateOn(form: ReturnType<ReturnType<typeof makeForm>>) {
	const t = useGlobalTranslation();
	return function validateOn(field: string) {
		const error = (form["errors"] || {})[field];

		return {
			validationState: error ? "error" : "none",
			validationMessage: t.translate((error || "").replace(/ /gi, "_"))
		} as any;
	};
}

/**
 * Implements the TenantEditorDialog
 * @export
 */
export const TenantEditorDialog: React.FC<ITenantEditorDialogProps> = params => {
	const { dlgCss, state, t, form } = useTenantEditorDialog(params);
	const validate = useValidateOn(form);

	return (
		<form onSubmit={form.handleSubmit}>
			<Dialog open>
				<DialogSurface className={dlgCss.dialogSurface}>
					{state.saving ? (
						<Stack alignItems="center" className={dlgCss.dialogContentNoPadding} justifyContent="center" flex="1">
							<Spinner label={"please_wait"} size="small" labelPosition="below" />
						</Stack>
					) : (
						<DialogBody>
							<DialogTitle>{state.title}</DialogTitle>
							<DialogContent className={dlgCss.dialogContent}>
								<Stack>
									<FormTextField name={eSysTenant.NAME} label={t("tenant")} validate={validate} form={form} />
									<FormTextField name={eSysTenant.ORGANIZATION} label={t(eSysTenant.ORGANIZATION)} validate={validate} form={form} />
									<FormTextField name={eSysUserProfile.EMAIL} label={t(eSysUserProfile.EMAIL)} validate={validate} form={form} type="email" />
									<FormTextField name={eSysUser.PASSWORD} label={t(eSysUser.PASSWORD)} validate={validate} form={form} type="password" />
									<Checkbox label={t(eSysTenant.ALLOW_REGISTRATION)} name={eSysTenant.ALLOW_REGISTRATION} checked={form.values.allow_registration} onChange={form.handleChange} />
									<Checkbox label={t(eSysTenant.ALLOW_RESET_PASSWORD)} name={eSysTenant.ALLOW_RESET_PASSWORD} checked={form.values.allow_reset_password} onChange={form.handleChange} />
									<Checkbox label={t(eSysTenant.IS_ACTIVE)} name={eSysTenant.IS_ACTIVE} checked={form.values.is_active} onChange={form.handleChange} />
								</Stack>
							</DialogContent>
							<DialogActions fluid>
								<Button appearance="secondary" onClick={() => params.onClose()}>
									{t("close")}
								</Button>
								<Button appearance="primary" onClick={() => form.submitForm()}>
									{t("ok")}
								</Button>
							</DialogActions>
						</DialogBody>
					)}
				</DialogSurface>
			</Dialog >
		</form >
	);
};