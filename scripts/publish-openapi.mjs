#!/usr/bin/env node
// Copy openapi/phototracker.v1.yaml → public/api/openapi.{yaml,json}
// Run after `npm run web:build` because Vite emptyOutDir wipes public/api/.
import { parse } from "yaml";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const src = readFileSync("openapi/phototracker.v1.yaml", "utf8");
mkdirSync("public/api", { recursive: true });
writeFileSync("public/api/openapi.yaml", src);
writeFileSync("public/api/openapi.json", JSON.stringify(parse(src), null, 2));
console.log("Published public/api/openapi.{yaml,json}");
