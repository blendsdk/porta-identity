import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
export default defineConfig({
    optimizeDeps: {
        include: ["@porta/shared", "@blendsdk/fui8", "@fluentui/react"]
    },
    build: {
        commonjsOptions: {
            include: [/shared/, /node_modules/, /fui8/, /fluent/]
        }
    },
    plugins: [
        react(),
        dts({
            outDir: "../sdk/types"
        })
    ],
    define: {
        "process.env": {}
    },
    server: {
        hmr: false,
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
