import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

export interface dummy {
    a: React.ReactNode;
}

export const dashboardPage = () => {
    return renderToStaticMarkup(
        <div>
            <h1>Welcome to BFF</h1>
        </div>
    );
};
