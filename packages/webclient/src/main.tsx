import React from "react";
import ReactDOM from "react-dom/client";
import { Startup } from "./system/Startup";
import "./resources/global.css";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <Startup />
    </React.StrictMode>
);
