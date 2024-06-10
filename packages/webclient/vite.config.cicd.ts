import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    optimizeDeps: {
        include: ["@porta/shared", "@blendsdk/fui8"]
    },
    build: {
        commonjsOptions: {
            include: [/shared/, /node_modules/, /fui8/]
        }
    },
    plugins: [react()],
    define: {
        "process.env": {}
    },
    server: {
        port: 3000
    }
});
