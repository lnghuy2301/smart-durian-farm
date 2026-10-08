import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(
    mode,
    fileURLToPath(new URL(".", import.meta.url)),
    "WEB_DEV_",
  );
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@brand": fileURLToPath(
          new URL("../../assets/brand/Smart_Durian_Brand_Kit", import.meta.url),
        ),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Chỉ proxy API trong development; không đọc .env ở root chứa secrets backend.
      proxy: {
        "/api": {
          target:
            process.env.WEB_DEV_API_TARGET ??
            env.WEB_DEV_API_TARGET ??
            "http://127.0.0.1:3000",
          changeOrigin: true,
        },
      },
    },
  };
});
