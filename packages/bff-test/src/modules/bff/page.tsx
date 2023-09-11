import { IPortaAuthenticationResult } from "@porta/webafx-auth";
import React, { Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export interface dummy {
    a: React.ReactNode;
}

export interface IDashboardPage {
    user: IPortaAuthenticationResult;
    serverURL: string;
}

export const dashboardPage: React.FC<IDashboardPage> = ({ user, serverURL }) => {
    const script = `
    const onRefreshToken = () => {
        fetch("${serverURL}/oidc/porta/refresh", {
            method: "post"
        })
            .then((res) => {
                res.json().then((j)=>{
                    document.getElementById("refresh").innerHTML = JSON.stringify(j,null,4)
                })

            })
            .catch((err) => {
                document.getElementById("refresh").innerHTML = err.toString();
            });
    };

    setTimeout(()=>{
        const btn = document.getElementById("btn")
        btn.addEventListener("click",onRefreshToken)
        btn.innerText = "Refresh"
    },2000)
`;
    return renderToStaticMarkup(
        <Fragment>
            <script dangerouslySetInnerHTML={{ __html: script }}></script>
            <div>
                <h1>Welcome to BFF</h1>
                <pre>{JSON.stringify({ user }, null, 4)}</pre>
                <button id="btn"></button>
                <pre></pre>
                <pre id="refresh"></pre>
            </div>
        </Fragment>
    );
};
