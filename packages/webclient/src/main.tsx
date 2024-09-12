import "@blendsdk/fui9/css/global.css";
import { FluentProvider, teamsLightTheme } from "@fluentui/react-components";
import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./resources/global.css";
import { Startup, useApplicationTheme } from "./system";

export function Root() {
    const theme = useApplicationTheme();

    useEffect(() => {
        theme.setTheme(teamsLightTheme);
    }, []);

    return (
        theme.theme && (
            <FluentProvider theme={theme.theme}>
                <Startup />
            </FluentProvider>
        )
    );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<Root />);
