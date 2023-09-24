import { Link } from "@blendsdk/react";
import { Body1 } from "@fluentui/react-components";
import { useTranslation } from "../../system/i18n";
import { useRouter } from "../../system/session";
import { eAppRoutes } from "../routing";
import { eFlowState } from "./lib";
import { useStyles } from "./styles";

export interface IOrgName {
    flowInfo: { allow_reset_password?: boolean; organization: string } | undefined;
    flowState: number;
}
export const OrgName: React.FC<IOrgName> = ({ flowInfo, flowState }) => {
    const styles = useStyles();
    const router = useRouter();
    const { t } = useTranslation();

    return flowInfo ? (
        <div className={styles.orgWrapper}>
            {flowState === eFlowState.REQUIRE_PASSWORD && flowInfo.allow_reset_password && (
                <Link to={router.generateUrl(eAppRoutes.forgotPassword.path)} reload>
                    {t("forgot_password_link")}
                </Link>
            )}
            <div className={styles.org_spacer} />
            <Body1 className={styles.org}>{flowInfo.organization}</Body1>
        </div>
    ) : null;
};
