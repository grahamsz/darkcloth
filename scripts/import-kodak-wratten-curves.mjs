import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const curveDefinitions = [
  ["wratten_2a", "2A", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-2A.pdf"],
  ["wratten_2b", "2B", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-2B.pdf"],
  ["wratten_2e", "2E", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-2E.pdf"],
  ["wratten_3", "3", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-3.pdf"],
  ["wratten_8", "8", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-w2-8.pdf"],
  ["wratten_9", "9", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-9.pdf"],
  ["wratten_12", "12", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-12.pdf"],
  ["wratten_15", "15", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-15.pdf"],
  ["wratten_16", "16", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-16.pdf"],
  ["wratten_21", "21", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-21.pdf"],
  ["wratten_22", "22", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-22.pdf"],
  ["wratten_24", "24", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-24.pdf"],
  ["wratten_25", "25", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-25.pdf"],
  ["wratten_26", "26", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-26.pdf"],
  ["wratten_29", "29", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-29.pdf"],
  ["wratten_32", "32", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-32.pdf"],
  ["wratten_34a", "34A", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-34A.pdf"],
  ["wratten_38a", "38A", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-38A.pdf"],
  ["wratten_44", "44", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-44.pdf"],
  ["wratten_44a", "44A", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-44A.pdf"],
  ["wratten_47", "47", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-47.pdf"],
  ["wratten_47a", "47A", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-47A.pdf"],
  ["wratten_58", "58", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-58.pdf"],
  ["wratten_61", "61", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-61.pdf"],
  ["wratten_70", "70", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-70.pdf"],
  ["wratten_87", "87", "https://www.kodak.com/content/products-brochures/Film/Infrared-Filters-W2-87.pdf"],
  ["wratten_87a", "87A", "https://www.kodak.com/content/products-brochures/Film/Infrared-Filters-W2-87A.pdf"],
  ["wratten_87b", "87B", "https://www.kodak.com/content/products-brochures/Film/Infrared-Filters-W2-87B.pdf"],
  ["wratten_87c", "87C", "https://www.kodak.com/content/products-brochures/Film/Infrared-Filters-W2-87C.pdf"],
  ["wratten_89b", "89B", "https://www.kodak.com/content/products-brochures/Film/Infrared-Filters-W2-89B.pdf"],
  ["wratten_90", "90", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-90.pdf"],
  ["wratten_92", "92", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-92.pdf"],
  ["wratten_98", "98", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-98.pdf"],
  ["wratten_99", "99", "https://www.kodak.com/content/products-brochures/Film/Basic-Color-Filters-W2-99.pdf"],
  ["wratten_102", "102", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-102.pdf"],
  ["wratten_106", "106", "https://www.kodak.com/content/products-brochures/Film/Special-Dye-Color-Filters-W2-106.pdf"],
];

const curves = Object.fromEntries(curveDefinitions.map(([key, label, url]) => [
  key,
  {
    label: `KODAK WRATTEN 2 Optical Filter / ${label}`,
    url,
  },
]));

const cacheDir = ".cache/kodak-wratten-curves";
const outputPath = "apps/web/src/filterSpectralCurveData.ts";
const sample = {
  minWavelengthNm: 350,
  maxWavelengthNm: 750,
  stepNm: 5,
};
const chart = {
  xMin: 105.919,
  xMax: 654.079,
  yTop: 99.6,
  yBottom: 475.44,
  wavelengthMin: 300,
  wavelengthMax: 900,
  densityMax: 3,
};

mkdirSync(cacheDir, { recursive: true });

const numberPattern = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?";
const tokenPattern = new RegExp(`[MLCZmclcz]|${numberPattern}`, "g");

function transformPoint([x, y], [a, b, c, d, e, f]) {
  return [a * x + c * y + e, b * x + d * y + f];
}

function parsePath(pathData, transform) {
  const tokens = pathData.match(tokenPattern) ?? [];
  const points = [];
  let index = 0;
  let command = null;
  let current = [0, 0];

  const readPoint = () => {
    const point = [Number(tokens[index]), Number(tokens[index + 1])];
    index += 2;
    return point;
  };

  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) {
      command = tokens[index];
      index += 1;
    }
    if (index >= tokens.length) break;

    if (command === "M") {
      current = readPoint();
      points.push(transformPoint(current, transform));
      command = "L";
    } else if (command === "L") {
      current = readPoint();
      points.push(transformPoint(current, transform));
    } else if (command === "C") {
      const start = current;
      const control1 = readPoint();
      const control2 = readPoint();
      const end = readPoint();
      for (let step = 1; step <= 12; step += 1) {
        const t = step / 12;
        const x = ((1 - t) ** 3 * start[0])
          + (3 * (1 - t) ** 2 * t * control1[0])
          + (3 * (1 - t) * t ** 2 * control2[0])
          + (t ** 3 * end[0]);
        const y = ((1 - t) ** 3 * start[1])
          + (3 * (1 - t) ** 2 * t * control1[1])
          + (3 * (1 - t) * t ** 2 * control2[1])
          + (t ** 3 * end[1]);
        points.push(transformPoint([x, y], transform));
      }
      current = end;
    } else {
      break;
    }
  }

  return points;
}

function extractPoints(svgText) {
  const points = [];
  for (const match of svgText.matchAll(/<path ([^>]+)>/g)) {
    const attrs = match[1];
    if (!attrs.includes('stroke-width="1.92"')) continue;
    const pathData = attrs.match(/d="([^"]+)"/)?.[1];
    const transform = attrs.match(/transform="matrix\(([^)]+)\)"/)?.[1]
      ?.split(",")
      .map(value => Number(value.trim()));
    if (!pathData || !transform) continue;
    points.push(...parsePath(pathData, transform));
  }
  return points
    .map(([x, y]) => {
      const wavelengthNm = chart.wavelengthMin
        + ((x - chart.xMin) / (chart.xMax - chart.xMin)) * (chart.wavelengthMax - chart.wavelengthMin);
      const density = ((chart.yBottom - y) / (chart.yBottom - chart.yTop)) * chart.densityMax;
      return { wavelengthNm, transmission: 10 ** -Math.max(0, Math.min(chart.densityMax, density)) };
    })
    .filter(point => point.wavelengthNm >= 250 && point.wavelengthNm <= 950)
    .sort((left, right) => left.wavelengthNm - right.wavelengthNm);
}

function interpolate(points, wavelengthNm) {
  let left = points[0];
  for (const right of points) {
    if (right.wavelengthNm < wavelengthNm) {
      left = right;
      continue;
    }
    const span = right.wavelengthNm - left.wavelengthNm;
    const t = span === 0 ? 0 : (wavelengthNm - left.wavelengthNm) / span;
    return left.transmission + (right.transmission - left.transmission) * t;
  }
  return points.at(-1)?.transmission ?? 1;
}

const result = {};

for (const [key, curve] of Object.entries(curves)) {
  const { label, url } = curve;
  const pdfPath = join(cacheDir, basename(url));
  const svgPath = pdfPath.replace(/\.pdf$/i, ".svg");
  execFileSync("curl", ["-L", "-s", "-o", pdfPath, url], { stdio: "inherit" });
  execFileSync("pdftocairo", ["-svg", pdfPath, svgPath], { stdio: "inherit" });
  const rawPoints = extractPoints(readFileSync(svgPath, "utf8"));
  result[key] = {
    key,
    label,
    sourceUrl: url,
    points: Array.from({
      length: Math.floor((sample.maxWavelengthNm - sample.minWavelengthNm) / sample.stepNm) + 1,
    }, (_, index) => {
      const wavelengthNm = sample.minWavelengthNm + index * sample.stepNm;
      return {
        wavelengthNm,
        transmission: Number(interpolate(rawPoints, wavelengthNm).toFixed(5)),
      };
    }),
  };
}

writeFileSync(
  outputPath,
  `// Generated by scripts/import-kodak-wratten-curves.mjs. Do not edit by hand.\n`
  + `export const FILTER_SPECTRAL_CURVE_DATA = ${JSON.stringify(result, null, 2)} as const;\n`,
);
console.log(`Wrote ${outputPath}`);
