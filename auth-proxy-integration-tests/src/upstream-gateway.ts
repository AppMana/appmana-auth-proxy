import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();

const PROXY_TARGET = process.env.PROXY_TARGET || "http://localhost:3000";
const SPA_TARGET = process.env.SPA_TARGET || "http://localhost:8080";
const PORT = parseInt(process.env.PORT || "8888", 10);

// Logging
app.use((req, res, next) => {
  console.log(`[Gateway] ${req.method} ${req.url}`);
  next();
});

// Proxy /api to Auth Proxy Backend
app.use(
  "/api",
  (req, res, next) => {
    console.log("[Gateway] Authorization:", req.headers["authorization"]);
    console.log("[Gateway] X-Proxy-Target-Url:", req.headers["x-proxy-target-url"]);
    next();
  },
  createProxyMiddleware({
    target: PROXY_TARGET,
    changeOrigin: true,
    xfwd: true,
    pathRewrite: { "^/api": "" }, // Strip /api prefix
    // @ts-ignore
    onError: (err, req, res) => {
      console.error("[Gateway] Proxy Error (API):", err);
      res.status(500).send("Proxy Error (API)");
    },
  }),
);

// Proxy everything else to SPA Server
app.use(
  "/",
  createProxyMiddleware({
    target: SPA_TARGET,
    changeOrigin: true,
    // @ts-ignore
    onError: (err, req, res) => {
      console.error("[Gateway] Proxy Error (SPA):", err);
      res.status(500).send("Proxy Error (SPA)");
    },
  }),
);

app.listen(PORT, () => {
  console.log(`Upstream Gateway listening on ${PORT}`);
  console.log(`Proxying /api to ${PROXY_TARGET}`);
  console.log(`Proxying / to ${SPA_TARGET}`);
});
