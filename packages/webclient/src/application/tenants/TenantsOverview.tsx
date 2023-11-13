import { ConfirmDialog, Stack } from "@blendsdk/fluentrc";
import { useObjectState } from "@blendsdk/react";
import { Body1, Portal, Title2, Toolbar, ToolbarButton, tokens } from "@fluentui/react-components";
import { BuildingTownhouse32Regular, Delete32Regular } from "@fluentui/react-icons";
import { ISysTenant } from "@porta/shared";
import { useCallback } from "react";
import { useSystemError } from "../../system";
import { useTranslation } from "../../system/i18n";
import { AdminWrapper } from "../common/admin";
import { useCommonStyles } from "../common/styles";
import { TenantGrid } from "./datagrid";
import { useTenantGridStore } from "./datagrid/TenantGridStore";
import { TenantEditor } from "./editor";
import { ITenantEditorModel } from "./editor/TenantEditorForm";

interface ITenantsOverviewState {
    editorOpen: boolean;
    confirmDeleteOpen: boolean;
    currentRecord: Partial<ISysTenant>;
}

export const TenantsOverview = () => {

    const gridDataStore = useTenantGridStore();
    const { catchSystemError } = useSystemError();
    const [state, setState] = useObjectState<Partial<ITenantsOverviewState>>(() => ({
        editorOpen: false,
        confirmDeleteOpen: false,
        currentRecord: undefined
    }));

    const { t } = useTranslation();
    const cs = useCommonStyles();

    const onSaveTenant = useCallback((values: ITenantEditorModel, isNew: boolean) => {
        setState({ editorOpen: false });
        gridDataStore.createTenant(values, isNew).catch(catchSystemError);
    }, [catchSystemError, gridDataStore, setState]);

    return (
        <AdminWrapper>
            <Stack className={cs.flexFill}>
                <Toolbar style={{ backgroundColor: tokens.colorNeutralBackground3 }}>
                    <ToolbarButton
                        appearance="subtle"
                        icon={<BuildingTownhouse32Regular />}
                        onClick={() => {
                            setState({ editorOpen: true, currentRecord: undefined });
                        }}
                    >{t("new_tenant")}</ToolbarButton>
                    {state.currentRecord && (<ToolbarButton
                        appearance="subtle"
                        icon={<Delete32Regular />}
                        onClick={() => {
                            setState({ confirmDeleteOpen: true });
                        }}
                    >{t("delete_tenant", state.currentRecord)}</ToolbarButton>
                    )}
                </Toolbar>
                <Stack className={cs.padded}>
                    <Title2>Tenants</Title2>
                    <TenantGrid onSelectItem={(item) => setState({ currentRecord: item })} />
                </Stack>
            </Stack>
            <Portal>
                <ConfirmDialog
                    open={state.confirmDeleteOpen}
                    danger
                    declineAsPrimary
                    title={t("delete_tenant_title")}
                    buttonConfirmText={t("btn_delete_tenant_confirm")}
                    buttonDeclineText={t("btn_delete_tenant_cancel")}
                    onClose={(confirm) => {
                        setState({ confirmDeleteOpen: false });
                    }}
                >
                    <Body1>{t("confirm_delete_tenant_text", state.currentRecord || {})}</Body1>
                </ConfirmDialog>
                <TenantEditor tenantId={state.currentRecord?.id} open={state.editorOpen} onClose={onSaveTenant} />
            </Portal>
        </AdminWrapper>
    );
};
