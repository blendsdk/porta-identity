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
import { Avatar, Button, Subtitle1 } from "@fluentui/react-components";
import {
    ContentViewRegular,
    DesktopRegular, PersonRegular
} from "@fluentui/react-icons";
import { eApiRoles } from "@porta/shared";
import React, { useMemo } from "react";
import { Strings, useReferenceData } from "../../lib";
import { useTranslation } from "../../system/i18n";
import { useRouter } from "../../system/session";
import { eAppRoutes } from "../routing";
import { createRbacFilter } from "./rbac";

export interface IApplicationBar {
    launcher?: boolean;
}

export const ApplicationBar: React.FC<IApplicationBar> = ({ launcher }) => {
    const { t } = useTranslation();
    const referenceData = useReferenceData();
    const router = useRouter();

    const appTitle = useMemo(() => {
        if (referenceData?.userProfile?.tenant) {
            return t(`${Strings.APPLICATION_NAME} (\${organization})`, referenceData.userProfile?.tenant);
        } else {
            return Strings.APPLICATION_NAME;
        }
    }, [referenceData?.userProfile?.tenant, t]);

    const rbacFilter = useMemo(() => {
        return createRbacFilter(referenceData);
    }, [referenceData]);

    const launcherItems = useMemo<AppLauncherModuleItem[]>(() => {

        const tenant = referenceData.userProfile?.tenant?.name;

        const result = [
            {
                caption: t("dashboard_btn"),
                icon: DesktopRegular,
                id: eAppRoutes.tenantDashboard.key,
                onClick: () => { }
            },
            {
                caption: t("admin"),
                icon: ContentViewRegular,
                id: eAppRoutes.admin.key,
                roles: [eApiRoles.SYSTEM_ADMINS],
                onClick: () => {
                    router.go(eAppRoutes.admin.key, {
                        tenant
                    });
                }
            },
            {
                caption: t("my_account"),
                icon: PersonRegular,
                onClick: () => {
                    router.go(eAppRoutes.myProfile.key, {
                        tenant
                    });
                }
            }
        ];

        return result.filter(rbacFilter);
        // return result.filter(menu => {
        //     if (menu.id && referenceData.userProfile) {

        //         const hasPermission = appRbacTable.check(menu.id, referenceData.userProfile.permissions, eAclRuleType.permission, { allRequired: true, passWhenNoRulePresent: true });
        //         const hasRole = appRbacTable.check(menu.id, referenceData.userProfile.roles, eAclRuleType.role, { allRequired: true, passWhenNoRulePresent: true });

        //         // Check for role and permission per route id
        //         return hasRole && hasPermission;
        //     } else {
        //         return true;
        //     }
        // });
    }, [rbacFilter, referenceData.userProfile?.tenant?.name, router, t]);

    return (
        <AppBar>
            {launcher !== false && (
                <AppLauncher>
                    <AppLauncherModule title={"Porta Identity"} items={launcherItems} />
                </AppLauncher>
            )}
            <AppTitle>{appTitle}</AppTitle>
            <AppBarSpacer />
            {referenceData.userProfile && (
                <AppBarTabList>
                    <AppBarTab icon={<Avatar image={{ src: referenceData.userProfile.profile.avatar }} />}>
                        <AppBarTabHeader addBottomSpacing>
                            <Subtitle1>Settings</Subtitle1>
                        </AppBarTabHeader>
                        <Button appearance="primary" onClick={() => {
                            window.location.href = referenceData.userProfile.signout_url;
                        }}>{t("logout")}</Button>
                    </AppBarTab>
                </AppBarTabList>
            )}
        </AppBar>
    );
};
