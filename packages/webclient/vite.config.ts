import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
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
        hmr: {
            protocol: "ws",
            host: "localhost",
            port: 3001
        },
        host: "0.0.0.0",
        port: 3000,
        strictPort: true,
        proxy: {
            "/api": {
                target: "http://localhost:4000",
                changeOrigin: true
            },
            "/cache": {
                target: "http://localhost:4000",
                autoRewrite: true,
                changeOrigin: true
            }
        }
    }
});
