import { SessionLoadingView } from "@blendsdk/react";
import React from "react";
import { useAuthenticationFlow } from "./hooks";
import { useStyles } from "./styles";

export interface ILoginViewProps {

}

export const LoginView: React.FC<ILoginViewProps> = () => {
    const styles = useStyles();
    const flow = useAuthenticationFlow();

    return flow.fetching ? <SessionLoadingView /> : <div className={styles.wrapper}>
        <div className={styles.authView}>
            
        </div>
    </div>;
};