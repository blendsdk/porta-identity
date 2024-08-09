import { Database } from "@blendsdk/codegen";
import path from "path";
import { ITableMetaData, createViews } from "./lib";

const resourcesRoot = path.join(process.cwd(), "resources", "database");

export async function createViewSchema(database: Database<ITableMetaData>) {

    database.addView("sys_secret_view", path.join(resourcesRoot, "secret_view.sql"), 99);
    database.addView("sys_authorization_view", path.join(resourcesRoot, "authorization_view.sql"), 100);
    database.addView("sys_access_token_view", path.join(resourcesRoot, "access_token_view.sql"), 100);
    database.addView("sys_refresh_token_view", path.join(resourcesRoot, "refresh_token_view.sql"), 100);
    database.addView("sys_user_permission_view", path.join(resourcesRoot, "user_permission_view.sql"), 100);
    database.addView("sys_session_view", path.join(resourcesRoot, "session_view.sql"), 100);
    await createViews();
}
