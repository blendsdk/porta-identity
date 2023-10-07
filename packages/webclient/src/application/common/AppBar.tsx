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
import { Button, Subtitle1 } from "@fluentui/react-components";
import {
    ContentView32Regular,
    Desktop32Regular,
    People32Regular,
    PeopleCommunity32Regular,
    Person32Regular,
    Settings24Regular
} from "@fluentui/react-icons";
import React, { useMemo } from "react";
import { Strings, useReferenceData } from "../../lib";
import { useTranslation } from "../../system/i18n";

export interface IApplicationBar {
    launcher?: boolean;
}

export const ApplicationBar: React.FC<IApplicationBar> = ({ launcher }) => {
    const { t } = useTranslation();
    const refData = useReferenceData();

    const appTitle = useMemo(() => {
        if (refData?.userProfile?.tenant) {
            return t(`${Strings.APPLICATION_NAME} (\${organization})`, refData.userProfile.tenant);
        } else {
            return Strings.APPLICATION_NAME;
        }
    }, [refData?.userProfile?.tenant, t]);

    const launcherItems = useMemo<AppLauncherModuleItem[]>(() => {
        const result = [
            {
                caption: t("dashboard_btn"),
                icon: Desktop32Regular,
                onClick: () => {}
            },
            {
                caption: t("applications"),
                icon: ContentView32Regular,
                onClick: () => {}
            },
            {
                caption: t("users"),
                icon: People32Regular,
                onClick: () => {}
            },
            {
                caption: t("roles"),
                icon: PeopleCommunity32Regular,
                onClick: () => {}
            },
            {
                caption: t("my_account"),
                icon: Person32Regular,
                onClick: () => {}
            }
        ];
        return result;
    }, [t]);

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
                    <AppBarTab icon={<Settings24Regular />}>
                        <AppBarTabHeader addBottomSpacing>
                            <Subtitle1>Settings</Subtitle1>
                        </AppBarTabHeader>
                        <Button appearance="primary" onClick={()=>{
                            window.location.href = refData.userProfile.signout_url
                        }}>{t("logout")}</Button>
                    </AppBarTab>
                </AppBarTabList>
            )}
        </AppBar>
    );
};
