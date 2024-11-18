import { WebApplication } from "@blendsdk/webafx";
import { RedisCacheModule } from "@blendsdk/webafx-cache-redis";
import { I18NModuleFactory } from "@blendsdk/webafx-i18n";
import { MailerModule } from "@blendsdk/webafx-mailer";
import * as path from "path";
import { PortaAuthSessionProviderModule } from "../../services";
import { AdminModule } from "../api/admin";
import { AuthorizationModule } from "../api/authorization";
import { InitializeModule } from "../api/initialize";
import { RedirectRoutes } from "../redirects";
import { SPARoutes } from "../spa";
import { DatabaseModule } from "./database";
import { ValidationSchema } from "./validations";

/**
 * Configuration setting for testing
 */
const getTestConfig = () => {
    const cfg = require(path.join(process.cwd(), "config", "app.config.js"));
    cfg.PORT = 4010;
    return cfg;
};

/**
 * Instance of the WebApi application configured with
 * modules.
 */
const application = new WebApplication({
    settings: process.env.TEST ? getTestConfig() : {},
    router: [
        //
        ValidationSchema(),
        InitializeModule(),
        AuthorizationModule(),
        AdminModule(),
        RedirectRoutes(),
        SPARoutes()
    ]
}).addModule([
    //
    (config) => {
        return new RedisCacheModule({ ...config, id: config.PORTA_SSO_COMMON_NAME });
    },
    I18NModuleFactory({
        translationDatabase: [
            path.join(process.cwd(), "resources", "i18n", "*.json"),
            path.join(process.cwd(), "resources", "i18n", "*.html")
        ]
    }),
    (config) => {
        return new PortaAuthSessionProviderModule({ ...config });
    },
    (config) => {
        return new DatabaseModule({ ...config });
    },
    (config) => {
        return new MailerModule(config);
    }
]);

export { application };
