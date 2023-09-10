import { useCallback, useEffect, useState } from "react";
import { FIELD_SIZE, eFlowState, isFlowExpired } from "./lib";
import { SessionLoadingView } from "@blendsdk/react";
import { ILogoutFlowInfo } from "@porta/shared";
import { useSystemError } from "../../system/session";
import LogoImage from "../../resources/logo.svg";
import { useTranslation } from "../../system/i18n";
import { useStyles } from "./styles";
import { ApplicationApi } from "../../system/api";
import { Body2, Button, Spinner } from "@fluentui/react-components";
import { InvalidSession } from "./InvalidSession";

export const LogoutView = () => {
    const { t } = useTranslation();
    const { catchSystemError } = useSystemError();
    const [flowState, setFlowState] = useState<number | undefined>(undefined);
    const [flowInfo, setFlowInfo] = useState<ILogoutFlowInfo | undefined>();
    const s = useStyles();

    const finalizeAndRedirect = useCallback(() => {
        setFlowState(eFlowState.COMPLETE);
        setTimeout(() => {
            window.location.href = flowInfo?.finalize_url || "";
        }, 1000);
    }, [flowInfo?.finalize_url]);

    useEffect(() => {
        const checker = setInterval(() => {
            const isInvalidFlow = isFlowExpired("_ls") && flowState !== eFlowState.INVALID_SESSION;

            if (isInvalidFlow) {
                setFlowState(eFlowState.INVALID_SESSION);
                setFlowInfo(undefined);
            } else if (!flowState) {
                ApplicationApi.authorization
                    .logoutFlowInfo({})
                    .then(({ data }) => {
                        setFlowInfo(data);
                        setFlowState(eFlowState.LOGOUT_PROGRESS);
                    })
                    .catch((err) => {
                        if (err.message === "INVALID_REQUEST_NO_FLOW") {
                            setFlowState(eFlowState.INVALID_SESSION);
                            setFlowInfo(undefined);
                        } else {
                            catchSystemError(err);
                        }
                    });
            }
        }, 1000);

        return () => {
            clearInterval(checker);
        };
    }, [catchSystemError, flowState]);

    return !flowState ? (
        <SessionLoadingView />
    ) : (
        <div className={s.wrapper}>
            <form>
                <div className={s.authView}>
                    {flowInfo && flowState !== eFlowState.INVALID_SESSION && (
                        <div className={s.logo} style={{ backgroundImage: `url(${flowInfo.logo || LogoImage})` }} />
                    )}
                    <div className={s.authViewContent}>
                        {flowState === eFlowState.COMPLETE && (
                            <Spinner className={s.spinner} size="small" label={t("please_wait_while_redirecting")} />
                        )}
                        {flowState === eFlowState.INVALID_SESSION && <InvalidSession logout />}
                        {flowInfo && flowState === eFlowState.LOGOUT_CANCELED && (
                            <Body2 as="h2" align="center">
                                {t("logout_canceled", flowInfo)}
                            </Body2>
                        )}
                        {flowInfo && flowState === eFlowState.LOGOUT_PROGRESS && (
                            <Body2 as="h2" align="center">
                                <span
                                    dangerouslySetInnerHTML={{ __html: t("logout_confirm_message", flowInfo) }}
                                ></span>
                            </Body2>
                        )}
                        {flowState === eFlowState.LOGOUT_PROGRESS && (
                            <div data-footer="true" className={s.footer}>
                                <Button
                                    size={FIELD_SIZE}
                                    className={s.button}
                                    appearance="secondary"
                                    onClick={() => {
                                        setFlowState(eFlowState.LOGOUT_CANCELED);
                                    }}
                                >
                                    {t("keep_me_signed_in")}
                                </Button>
                                {flowState === eFlowState.LOGOUT_PROGRESS && <div className={s.spacer} />}
                                <Button
                                    size={FIELD_SIZE}
                                    className={s.button}
                                    appearance="primary"
                                    onClick={() => {
                                        finalizeAndRedirect();
                                    }}
                                >
                                    {t("btn_yes_logout")}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
};
