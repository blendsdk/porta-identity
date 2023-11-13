import { FormTextField, Stack, useValidateOn } from "@blendsdk/fluentrc";
import {
	Button,
	Checkbox,
	Dialog,
	DialogActions,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle
} from "@fluentui/react-components";
import { eSysTenant, eSysUser, eSysUserProfile } from "@porta/shared";
import { useTenantEditor } from "./TenantEditorLogic";
import { ITenantEditorProps } from "./TenantEditorTypes";

/**
 * Implements the TenantEditor
 * @export
 */
export const TenantEditor: React.FC<ITenantEditorProps> = props => {
	const { dlgCss, state, t, form, isNew } = useTenantEditor(props);
	const validate = useValidateOn(form);
	return (
		<Dialog open={props.open}>
			<DialogSurface className={dlgCss.dialogSurface}>
				<DialogBody>
					<DialogTitle>{state.title}</DialogTitle>
					<DialogContent className={dlgCss.dialogContent}>
						<Stack>
							<FormTextField name={eSysTenant.NAME} disabled={!isNew} label={t("tenant")} validate={validate} form={form} />
							<FormTextField name={eSysTenant.ORGANIZATION} label={t(eSysTenant.ORGANIZATION)} validate={validate} form={form} />
							{isNew && <FormTextField name={eSysUserProfile.EMAIL} label={t(eSysUserProfile.EMAIL)} validate={validate} form={form} type="email" />}
							{isNew && <FormTextField name={eSysUser.PASSWORD} label={t(eSysUser.PASSWORD)} validate={validate} form={form} type="password" />}
							<Checkbox label={t(eSysTenant.ALLOW_REGISTRATION)} name={eSysTenant.ALLOW_REGISTRATION} checked={form.values.allow_registration} onChange={form.handleChange} />
							<Checkbox label={t(eSysTenant.ALLOW_RESET_PASSWORD)} name={eSysTenant.ALLOW_RESET_PASSWORD} checked={form.values.allow_reset_password} onChange={form.handleChange} />
							<Checkbox label={t(eSysTenant.IS_ACTIVE)} name={eSysTenant.IS_ACTIVE} checked={form.values.is_active} onChange={form.handleChange} />
						</Stack>
					</DialogContent>
					<DialogActions fluid>
						<Button appearance="secondary" onClick={() => props.onClose(undefined, undefined)}>
							{t("close")}
						</Button>
						<Button appearance="primary" onClick={() => form.submitForm()}>
							{t("ok")}
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};