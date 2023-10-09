import { WithSession } from "@blendsdk/react";
import { Body2 } from "@fluentui/react-components";
import { useReferenceData } from "../../lib";
import { useTranslation } from "../../system/i18n";
import { ApplicationBar } from "../common/AppBar";
import { PageContainer } from "../common/PageContainer";

export const MyProfile = () => {
    const { t } = useTranslation();
    const refData = useReferenceData();
    return (
        <WithSession>
            <div>
                <ApplicationBar launcher={false} />
                <PageContainer>
                    <Body2>{t("my_profile")}</Body2>
                    {refData.userProfile && (
                        <>

                            <pre>{JSON.stringify(refData.userProfile, null, 4)}</pre>
                            <img src={refData.userProfile.picture} />
                        </>
                    )}
                </PageContainer>
            </div>
        </WithSession>
    );
};