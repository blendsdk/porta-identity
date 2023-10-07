import { WithSession } from "@blendsdk/react";
import { ApplicationBar } from "../common/AppBar";

export const DashboardOverview = () => {
    return (
        <WithSession>
            <div>
                <ApplicationBar launcher={true} />
            </div>
        </WithSession>
    );
};
