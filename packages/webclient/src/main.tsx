import "./resources/global.css";
import { loadExtensions } from "./system/extensions";
import { Startup } from "./system";
import { create_extension } from "./application";

loadExtensions(create_extension).then((root) => {
    root.render(
        <Startup />
    );
});
