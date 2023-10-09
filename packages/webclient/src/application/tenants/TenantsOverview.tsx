import { WithSession } from "@blendsdk/react";
import { Body2 } from "@fluentui/react-components";
import { useTranslation } from "../../system/i18n";
import { ApplicationBar } from "../common/AppBar";
import { PageContainer } from "../common/PageContainer";

export const TenantsOverview = () => {
    const { t } = useTranslation();
    return (
        <WithSession>
            <div>
                <ApplicationBar launcher={true} />
                <PageContainer>
                    <Body2>{t("tenants_overview")}</Body2>
                </PageContainer>
            </div>
        </WithSession>
    );
};
