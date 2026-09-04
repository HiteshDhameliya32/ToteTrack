import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getEnvPorts() {
  let apiPort = 4000;
  let emailPort = 4001;
  try {
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const apiMatch = envContent.match(/^API_PORT\s*=\s*(\d+)/m);
      const emailMatch = envContent.match(/^EMAIL_PORT\s*=\s*(\d+)/m);
      if (apiMatch) apiPort = parseInt(apiMatch[1], 10);
      if (emailMatch) emailPort = parseInt(emailMatch[1], 10);
    }
  } catch (e) {
    console.warn("Failed to read root .env, using default ports:", e.message);
  }
  return { apiPort, emailPort };
}

const { apiPort, emailPort } = getEnvPorts();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api/cameras": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/statuses": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/logs": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-client-config": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-zones": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-image": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-image-check": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api": {
        target: `http://localhost:${emailPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/socket.io": {
        target: `http://localhost:${emailPort}`,
        changeOrigin: true,
        ws: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api/cameras": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/statuses": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/logs": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-client-config": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-zones": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-image": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api/tcp-image-check": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/api": {
        target: `http://localhost:${emailPort}`,
        changeOrigin: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
      "/socket.io": {
        target: `http://localhost:${emailPort}`,
        changeOrigin: true,
        ws: true,
        timeout: 10000,
        proxyTimeout: 10000,
      },
    },
  },
});

