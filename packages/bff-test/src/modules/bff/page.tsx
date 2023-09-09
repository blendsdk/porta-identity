import { IPortaAuthenticationResult } from "@porta/webafx-auth";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

export interface dummy {
    a: React.ReactNode;
}

export interface IDashboardPage {
    user: IPortaAuthenticationResult;
}

export const dashboardPage: React.FC<IDashboardPage> = ({ user }) => {
    return renderToStaticMarkup(
        <div>
            <h1>Welcome to BFF</h1>
            <pre>{JSON.stringify({ user }, null, 4)}</pre>
        </div>
    );
};
