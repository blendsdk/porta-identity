import { Body2 } from "@fluentui/react-components";
import { useTranslation } from "../../system/i18n";
import { AdminWrapper } from "../common/admin";

export const AdminOverview = () => {
    const { t } = useTranslation();

    return <AdminWrapper>
        <Body2>{t("admin_overview")}</Body2>
    </AdminWrapper>;
};
