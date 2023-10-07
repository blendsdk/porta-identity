import { Body2 } from "@fluentui/react-components";
import { useTranslation } from "../../system/i18n";
import { ApplicationBar } from "../common/AppBar";
import { PageContainer } from "../common/PageContainer";

export const SessionExpiredView = () => {
    const { t } = useTranslation();
    return (
        <div>
            <ApplicationBar launcher={false} />
            <PageContainer>
                <Body2>{t("session_expired_message")}</Body2>
            </PageContainer>
        </div>
    );
};
