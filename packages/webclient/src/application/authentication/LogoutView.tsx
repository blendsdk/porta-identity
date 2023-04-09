import { useTranslator } from "../../system/i18n";
import { useStyles } from "./styles";
import { useFormik } from "formik";
import { useEffect, useState } from "react";
import { Button, mergeClasses, Spinner, Subtitle1 } from "@fluentui/react-components";
import Cookies from "js-cookie";
import { eFlowState, FIELD_SIZE } from "./types";
import { PortaApi } from "../api";
import { ILogoutFlowInfo } from "@porta/shared";
import { catchSystemError } from "@blendsdk/react";
import LogoImage from "../../resources/logo.svg";
import { InvalidSession } from "./InvalidSession";
import { isExpired } from "./lib";

export const LogoutView = () => {
    const { translate } = useTranslator();
    const [flowInfo, setFlowInfo] = useState<ILogoutFlowInfo>(undefined);
    const [flowState, setFlowState] = useState<number>(undefined);
    const [flowStarted, setFlowStarted] = useState<boolean>(false);

    const styles = useStyles();

    const form = useFormik({
        validateOnMount: false,
        validateOnChange: false,
        initialValues: {},

        onSubmit: (_values) => {
            if (form.isValid) {
            }
        }
    });

    useEffect(() => {
        const now = Date.now();
        const _as = Cookies.get("_ls");

        let expire = now - 1;

        if (_as) {
            try {
                expire = parseInt(_as);
            } catch {
                //no-op
            }
        }

        // edge case
        if (isNaN(expire)) {
            expire = now - 1;
        }

        const checker = setInterval(() => {
            if (isExpired("_ls") && flowState !== eFlowState.INVALID_SESSION) {
                setFlowState(eFlowState.INVALID_SESSION);
            } else if (flowState === undefined && !flowStarted) {
                PortaApi.authorization
                    .logoutFlowInfo({})
                    .then(({ data }) => {
                        setFlowInfo(data);
                        setFlowState(eFlowState.SELECT_ACCOUNT);
                        setFlowStarted(true);
                    })
                    .catch((err: any) => {
                        if (err.message === "INVALID_REQUEST_NO_FLOW") {
                            setFlowState(eFlowState.INVALID_SESSION);
                        } else {
                            catchSystemError(err);
                        }
                    });
            }
        }, 1000);

        return () => {
            clearInterval(checker);
        };
    }, [flowState]);

    return (
        <div className={styles.wrapper}>
            <form onSubmit={form.handleSubmit}>
                <div className={mergeClasses(styles.authView)}>
                    {flowInfo && flowState !== eFlowState.INVALID_SESSION && (
                        <img className={styles.logo} src={flowInfo.logo || LogoImage} alt="logo" />
                    )}
                    {!flowState && <Spinner className={styles.spinner} size="small" label={translate("please_wait")} />}
                    {flowState === eFlowState.INVALID_SESSION && <InvalidSession logout />}
                    {flowState && flowState !== eFlowState.COMPLETE && flowState !== eFlowState.INVALID_SESSION && (
                        <>
                            <Subtitle1 className={styles.logout_message}>
                                {translate("logout_confirm_message", flowInfo)}
                            </Subtitle1>
                            <div className={styles.footer}>
                                <Button
                                    size={FIELD_SIZE}
                                    className={styles.button}
                                    appearance="outline"
                                    onClick={() => {
                                        setFlowState(eFlowState.INVALID_SESSION);
                                    }}
                                >
                                    {translate("keep_me_signed_in")}
                                </Button>
                                <div className={styles.spacer} />
                                <Button
                                    size={FIELD_SIZE}
                                    className={styles.button}
                                    appearance="primary"
                                    onClick={() => {
                                        form.submitForm();
                                    }}
                                >
                                    {translate("btn_yes_logout")}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </form>
        </div>
    );
};
