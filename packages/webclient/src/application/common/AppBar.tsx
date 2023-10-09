import {
    AppBar,
    AppBarSpacer,
    AppBarTab,
    AppBarTabHeader,
    AppBarTabList,
    AppLauncher,
    AppLauncherModule,
    AppLauncherModuleItem,
    AppTitle
} from "@blendsdk/fluentrc";
import { eAclRuleType } from "@blendsdk/rbac";
import { Button, Persona, Subtitle1 } from "@fluentui/react-components";
import {
    ContentView32Regular,
    Desktop32Regular,
    HomeDatabase32Regular,
    People32Regular,
    PeopleCommunity32Regular,
    Person32Regular
} from "@fluentui/react-icons";
import { eDefaultPermissions } from "@porta/shared";
import React, { useMemo } from "react";
import { Strings, useReferenceData } from "../../lib";
import { useTranslation } from "../../system/i18n";
import { useRouter } from "../../system/session";
import { eAppRoutes } from "../routing";
import { appRbacTable } from "./rbac";

export interface IApplicationBar {
    launcher?: boolean;
}

export const ApplicationBar: React.FC<IApplicationBar> = ({ launcher }) => {
    const { t } = useTranslation();
    const refData = useReferenceData();
    const router = useRouter();
    const appTitle = useMemo(() => {
        if (refData?.userProfile?.tenant) {
            return t(`${Strings.APPLICATION_NAME} (\${organization})`, refData.userProfile.tenant);
        } else {
            return Strings.APPLICATION_NAME;
        }
    }, [refData?.userProfile?.tenant, t]);

    const launcherItems = useMemo<AppLauncherModuleItem[]>(() => {

        const tenant = refData.userProfile.tenant.name;

        const result = [
            {
                caption: t("dashboard_btn"),
                icon: Desktop32Regular,
                onClick: () => { }
            },
            {
                id: "launcher_tenants",
                caption: t("tenants"),
                icon: HomeDatabase32Regular,
                permissions: [eDefaultPermissions.CAN_CREATE_TENANT.code],
                onClick: () => {
                    router.go(eAppRoutes.tenants.key, {
                        tenant
                    });
                }
            },
            {
                caption: t("applications"),
                icon: ContentView32Regular,
                onClick: () => { }
            },
            {
                caption: t("users"),
                icon: People32Regular,
                onClick: () => { }
            },
            {
                caption: t("roles"),
                icon: PeopleCommunity32Regular,
                onClick: () => { }
            },
            {
                caption: t("my_account"),
                icon: Person32Regular,
                onClick: () => {
                    router.go(eAppRoutes.myProfile.key, {
                        tenant
                    });
                }
            }
        ];
        return result.filter(menu => {
            if (menu.id && refData.userProfile) {
                return appRbacTable.check(menu.id,
                    refData.userProfile.permissions,
                    eAclRuleType.permission,
                    {
                        allRequired: true,
                        passWhenNoRulePresent: true
                    }
                );
            } else {
                return true;
            }
        });
    }, [refData.userProfile, router, t]);

    return (
        <AppBar>
            {launcher !== false && (
                <AppLauncher>
                    <AppLauncherModule title={"Porta Identity"} items={launcherItems} />
                </AppLauncher>
            )}
            <AppTitle>{appTitle}</AppTitle>
            <AppBarSpacer />
            {refData.userProfile && (
                <AppBarTabList>
                    <AppBarTab icon={<Persona avatar={{ image: { src: refData.userProfile.profile.avatar } }} />}>
                        <AppBarTabHeader addBottomSpacing>
                            <Subtitle1>Settings</Subtitle1>
                        </AppBarTabHeader>
                        <Button appearance="primary" onClick={() => {
                            window.location.href = refData.userProfile.signout_url;
                        }}>{t("logout")}</Button>
                    </AppBarTab>
                </AppBarTabList>
            )}
        </AppBar>
    );
};
