import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    base: "/fe/",
    define: {
        "process.env": {}
    },
    server: {
        port: 3000,
        proxy: {
            "/auth": {
                target: "https://ont.digi-v.nl",
                changeOrigin: true
            }
        }
    }
});
