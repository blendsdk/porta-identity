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
import { Avatar, Button, Subtitle1 } from "@fluentui/react-components";
import {
    ContentView32Regular,
    Desktop32Regular, Person32Regular
} from "@fluentui/react-icons";
import { eDefaultSystemGroups } from "@porta/shared";
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
            return t(`${Strings.APPLICATION_NAME} (\${organization})`, refData.userProfile?.tenant);
        } else {
            return Strings.APPLICATION_NAME;
        }
    }, [refData?.userProfile?.tenant, t]);

    const launcherItems = useMemo<AppLauncherModuleItem[]>(() => {

        const tenant = refData.userProfile?.tenant?.name;

        const result = [
            {
                caption: t("dashboard_btn"),
                icon: Desktop32Regular,
                id: eAppRoutes.tenantDashboard.key,
                onClick: () => { }
            },
            {
                caption: t("admin"),
                icon: ContentView32Regular,
                id: eAppRoutes.admin.key,
                roles: [eDefaultSystemGroups.ADMINISTRATORS_GROUP],
                onClick: () => {
                    router.go(eAppRoutes.admin.key, {
                        tenant
                    });
                }
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

                const hasPermission = appRbacTable.check(menu.id, refData.userProfile.permissions, eAclRuleType.permission, { allRequired: true, passWhenNoRulePresent: true });
                const hasRole = appRbacTable.check(menu.id, refData.userProfile.roles, eAclRuleType.role, { allRequired: true, passWhenNoRulePresent: true });

                // Check for role and permission per route id
                return hasRole && hasPermission;
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
                    <AppBarTab icon={<Avatar image={{ src: refData.userProfile.profile.avatar }} />}>
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
