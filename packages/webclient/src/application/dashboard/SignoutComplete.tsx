import { Body2 } from "@fluentui/react-components";
import { useTranslation } from "../../system/i18n";
import { ApplicationBar } from "../common/AppBar";
import { PageContainer } from "../common/PageContainer";

export const SignoutComplete = () => {
    const { t } = useTranslation();
    return (
        <div>
            <ApplicationBar launcher={false}/>
            <PageContainer>
                <Body2>{t("signout_complete")}</Body2>
            </PageContainer>
        </div>
    );
}