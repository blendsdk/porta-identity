import { Application } from "@blendsdk/webafx";
import { CacheModule } from "@blendsdk/webafx-cache";
import * as path from "path";
import { BFFRoutes } from "../bff";
import { BffTokenAuthenticationModule } from "../bff/auth";
import { BffSessionProviderModule } from "../bff/session";

/**
 * Configuration setting for testing
 */
const getTestConfig = () => {
    const cfg = require(path.join(process.cwd(), "config", "app.config.js"));
    return cfg;
};

/**
 * Instance of the WebApi application configured with
 * modules.
 */
const application = new Application({
    settings: process.env.TEST ? getTestConfig() : {},
    router: [BFFRoutes()]
}).addModule([
    //
    (config) => {
        return new CacheModule({ ...config, id: "bff" });
    },
    (config) => {
        return new BffTokenAuthenticationModule({ ...config });
    },
    (config) => {
        return new BffSessionProviderModule({ ...config });
    }
]);

export { application };
