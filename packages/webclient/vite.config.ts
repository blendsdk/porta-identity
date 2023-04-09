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
    optimizeDeps: {
        include: ["@porta/shared"]
    },
    server: {
        hmr: {
            protocol: "ws",
            host: "porta.local"
        }
    },
    plugins: [
        react({
            include: "**/*.tsx"
        })
    ]
});
