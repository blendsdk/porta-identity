import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
    optimizeDeps: {
        include: ["@porta/shared"]
    },
    build: {
        commonjsOptions: {
            include: [/shared/, /node_modules/]
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
