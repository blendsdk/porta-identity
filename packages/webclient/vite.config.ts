import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as crypto from "crypto";

let reg: any = {};

const chunkName = (name: string) => {
    if (!reg[name]) {
        reg[name] = crypto.createHash("md5").update(name).digest("hex");
    }
    return reg[name];
};

// https://vitejs.dev/config/
export default defineConfig({
    define: {
        "process.env": process.env
    },
    // build: {
    //     rollupOptions: {
    //         output: {
    //             manualChunks: (id) => {
    //                 const [, part] = id.split("node_modules");
    //                 const packagePath = (part || "").split("/").filter(Boolean);
    //                 let [scope, pkg] = packagePath || [];

    //                 scope = scope || "";
    //                 if (scope.startsWith("@fluentui")) {
    //                     return chunkName([scope, pkg].join("-"));
    //                 } else if (scope.startsWith("@") || scope.startsWith("lodash")) {
    //                     return chunkName(scope);
    //                 } else if (scope.startsWith("react")) {
    //                     return chunkName("react");
    //                 } else {
    //                     return undefined;
    //                 }
    //             }
    //         }
    //     }
    // },
    plugins: [react()]
});
