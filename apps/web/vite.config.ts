import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

function preserveApiSpecs() {
  return {
    name: "preserve-api-specs",
    async closeBundle() {
      const apiDir = resolve(__dirname, "../../public/api");
      const srcYaml = resolve(__dirname, "../../openapi/phototracker.v1.yaml");
      const { parse } = await import("yaml");
      const src = readFileSync(srcYaml, "utf8");
      mkdirSync(apiDir, { recursive: true });
      writeFileSync(resolve(apiDir, "openapi.yaml"), src);
      writeFileSync(resolve(apiDir, "openapi.json"), JSON.stringify(parse(src), null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), preserveApiSpecs()],
  build: {
    outDir: "../../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
