import { SidePanelDrawer, SidePanelLayout } from "@blendsdk/fluentrc";
import { SidePanelProvider, useSidePanelState } from "@blendsdk/fluentrc/dist/components/sidepanel/SidePanelLayout/context";
import { WithSession } from "@blendsdk/react";
import { IDictionaryOf } from "@blendsdk/stdlib";
import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    Button,
    ButtonProps,
    makeStyles,
} from "@fluentui/react-components";
import { BuildingTownhouse32Regular, DocumentLock32Regular, People32Regular, Person32Regular, WindowApps32Regular } from "@fluentui/react-icons";
import { PropsWithChildren, useMemo } from "react";
import { useReferenceData } from "../../lib";
import { useTranslation } from "../../system/i18n";
import { useRouter } from "../../system/session";
import { ApplicationBar } from "../common/AppBar";
import { createRbacFilter } from "../common/rbac";
import { eAppRoutes } from "../routing";

const useStyles = makeStyles({
    fullPage: {
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        display: "flex",
        flexDirection: "column"
    }, columnLayout: {
        display: "flex",
        flexDirection: "column",
        "> *": {
            justifyContent: "start"
        }
    }
});

const SidePanelNavigation = () => {
    const s = useStyles();
    const router = useRouter();
    const refData = useReferenceData();
    const { t } = useTranslation();
    const { keys, items } = useMemo(() => {

        const tenant = refData.userProfile?.tenant?.name;

        const items: IDictionaryOf<ButtonProps[]> = {
            admin: [
                {
                    title: t("users"),
                    icon: <Person32Regular />
                },
                {
                    title: t("roles"),
                    icon: <People32Regular />
                },
                {
                    title: t("permissions"),
                    icon: <DocumentLock32Regular />
                },
            ],
            integrations: [
                {
                    title: t("applications"),
                    icon: <WindowApps32Regular />
                },
                {
                    title: t("tenants"),
                    icon: <BuildingTownhouse32Regular />,
                    id: eAppRoutes.tenants.key,
                    onClick: () => {
                        router.go(eAppRoutes.tenants.key, { tenant }, true);
                    }
                }
            ]
        };
        return {
            keys: Object.keys(items),
            items
        };
    }, [refData.userProfile, router, t]);

    const rbacFilter = useMemo(() => {
        return createRbacFilter(refData);
    }, [refData]);

    return <Accordion navigation="linear" multiple openItems={keys} collapsible={false}>
        {Object.entries(items).map(([title, buttons]) => {
            return <AccordionItem key={title} value={title} >
                <AccordionHeader>{t(title)}</AccordionHeader>
                <AccordionPanel className={s.columnLayout}>
                    {buttons.filter(rbacFilter).map(({ title, icon, onClick }) => {
                        return <Button key={title} onClick={onClick as any} size="large" appearance="subtle" icon={icon}>{t(title)}</Button>;
                    })}
                </AccordionPanel>
            </AccordionItem>;
        })}
    </Accordion>;
};

export const AdminWrapper: React.FC<PropsWithChildren> = ({ children }) => {
    const s = useStyles();
    const drawerState = useSidePanelState(true);
    return (
        <WithSession>
            <div className={s.fullPage}>
                <SidePanelProvider value={drawerState}>
                    <ApplicationBar launcher={true} />
                    <SidePanelLayout>
                        <SidePanelDrawer>
                            <SidePanelNavigation />
                        </SidePanelDrawer>
                        {children}
                    </SidePanelLayout>
                </SidePanelProvider>
            </div>
        </WithSession>
    );
};
