import { useObjectState } from "@blendsdk/react";
import { Title2, Toolbar, ToolbarButton, mergeClasses, tokens } from "@fluentui/react-components";
import { BuildingTownhouse32Regular } from "@fluentui/react-icons";
import { ISysTenant } from "@porta/shared";
import { useTranslation } from "../../system/i18n";
import { AdminWrapper } from "../common/admin";
import { useCommonStyles } from "../common/styles";
import { TenantOverviewDataGrid } from "./datagrid";
import { tenantOverviewDataGridStore } from "./datagrid/TenantOverviewDataGridStore";
import { TenantEditorDialog } from "./editor";

interface ITenantsOverviewState {
    editorOpen?: boolean;
    currentRecord?: Partial<ISysTenant>;
}

export const TenantsOverview = () => {

    const [state, setState] = useObjectState<ITenantsOverviewState>(() => ({
        editorOpen: false,
        currentRecord: undefined
    }));

    const { t } = useTranslation();
    const cs = useCommonStyles();
    return (
        <AdminWrapper>
            <div className={mergeClasses(cs.flexColumn, cs.formGap, cs.flexFill)}>
                <Toolbar style={{ backgroundColor: tokens.colorNeutralBackground3 }}>
                    <ToolbarButton
                        appearance="subtle"
                        icon={<BuildingTownhouse32Regular />}
                        onClick={() => {
                            setState({ editorOpen: true });
                        }}
                    >{t("new_tenant")}</ToolbarButton>
                </Toolbar>
                <div className={mergeClasses(cs.flexColumn, cs.formGap, cs.flexFill, cs.padded)}>
                    <Title2>Tenants</Title2>
                    <TenantOverviewDataGrid />
                </div>
            </div>
            <TenantEditorDialog open={state.editorOpen} onClose={async () => {
                await tenantOverviewDataGridStore.loadAll();
                setState({ editorOpen: false });
            }} />
        </AdminWrapper>
    );
};
