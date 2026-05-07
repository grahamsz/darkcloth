import type {
  BTZSChartData,
  BTZSSourceFile,
  BTZSDevelopmentProfileCreate,
  RawXdfMetadata,
} from "../api/client";
import type { InferredProcessParts, ParsedBtzsXdf } from "./xdf";
import {
  formatRawXdfPaperEsDisplay,
  formatRawXdfReciprocityCode,
  formatRawXdfUseReciprocity,
  inferProcessParts,
} from "./xdf";

export interface ImportedXdfSource {
  name: string;
  size: number;
}

export interface ImportedAverageGPoint {
  averageG: number;
  effectiveFilmSpeed?: number;
  developmentTime?: number;
}

export interface ImportedBtzsXdfPreview {
  fileName: string;
  fileSize: number;
  displayName: string;
  processLabel: string;
  versionOrType: string | number;
  paperEs: string;
  reciprocityExpIndex: number;
  reciprocityGIndex: number;
  useReciprocity: number;
  reciprocityCode: string;
  useReciprocityText: string;
  inferredProcessParts: InferredProcessParts;
  name: string;
  developerName: string;
  dilution: string;
  temperatureText: string;
  keyValuesText: string;
  rawXdf: RawXdfMetadata;
  sourceFiles: BTZSSourceFile[];
  chartData: BTZSChartData[];
  efsPointCount: number;
  devPointCount: number;
  efsRows: ImportedAverageGPoint[];
  devRows: ImportedAverageGPoint[];
}

function trimOrFallback(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function buildSourceFiles(file: ImportedXdfSource, parsed: ParsedBtzsXdf): BTZSSourceFile[] {
  return [
    {
      label: parsed.displayName,
      filename: file.name,
      type: "xdf",
      source: "BTZS / ExpoDev XDF import",
      displayName: parsed.displayName,
      processLabel: parsed.processLabel,
      versionOrType: parsed.versionOrType,
      paperES: parsed.paperES,
      reciprocityExpIndex: parsed.reciprocityExpIndex,
      reciprocityGIndex: parsed.reciprocityGIndex,
      useReciprocity: parsed.useReciprocity,
    },
  ];
}

function buildChartData(parsed: ParsedBtzsXdf): BTZSChartData[] {
  const devRows = parsed.devGPoints.map((point) => ({
    averageG: point.averageGradient,
    developmentTime: point.developmentMinutes,
  }));
  const efsRows = parsed.efsGPoints.map((point) => ({
    averageG: point.averageGradient,
    effectiveFilmSpeed: point.effectiveFilmSpeed,
  }));

  return [
    {
      title: "Average G vs Development Time",
      xAxisLabel: "Average G",
      yAxisLabel: "Development Time",
      points: devRows.map((point) => ({
        averageG: point.averageG,
        developmentTime: point.developmentTime,
      })),
    },
    {
      title: "Effective Film Speed vs Average G",
      xAxisLabel: "Average G",
      yAxisLabel: "Effective Film Speed",
      points: efsRows.map((point) => ({
        averageG: point.averageG,
        effectiveFilmSpeed: point.effectiveFilmSpeed,
      })),
    },
  ];
}

function buildKeyValuesText(input: {
  displayName: string;
  processLabel: string;
  developerName: string;
  dilution: string;
  temperatureText: string;
  parsed: ParsedBtzsXdf;
  fileName: string;
}): string {
  const lines = [
    `Display name: ${input.displayName}`,
    `Process label: ${input.processLabel}`,
    `Developer name: ${input.developerName}`,
    `Dilution: ${input.dilution || "—"}`,
    `Temperature text: ${input.temperatureText || "—"}`,
    `Paper ES: ${formatRawXdfPaperEsDisplay(input.parsed.paperES)}`,
    `R code: ${formatRawXdfReciprocityCode(input.parsed.reciprocityExpIndex, input.parsed.reciprocityGIndex)}`,
    `Use reciprocity: ${formatRawXdfUseReciprocity(input.parsed.useReciprocity)}`,
    `Version/type: ${input.parsed.versionOrType}`,
    `Average G / Development Time points: ${input.parsed.devGPoints.length}`,
    `Average G / EFS points: ${input.parsed.efsGPoints.length}`,
    `Source file: ${input.fileName}`,
  ];

  return lines.join("\n");
}

export function buildImportedBtzsXdfPreview(
  file: ImportedXdfSource,
  parsed: ParsedBtzsXdf,
): ImportedBtzsXdfPreview {
  const displayName = trimOrFallback(parsed.displayName, file.name);
  const processLabel = trimOrFallback(parsed.processLabel, displayName, file.name);
  const inferredProcessParts = inferProcessParts(processLabel);
  const name = displayName;
  const developerName = trimOrFallback(inferredProcessParts.developerName, processLabel, name);
  const dilution = inferredProcessParts.dilution ? inferredProcessParts.dilution.trim() : "";
  const temperatureText = trimOrFallback(inferredProcessParts.temperatureText, processLabel, displayName, file.name);
  const paperEs = formatRawXdfPaperEsDisplay(parsed.paperES);
  const reciprocityCode = formatRawXdfReciprocityCode(parsed.reciprocityExpIndex, parsed.reciprocityGIndex);
  const useReciprocityText = formatRawXdfUseReciprocity(parsed.useReciprocity);
  const rawXdf: RawXdfMetadata = {
    versionOrType: parsed.versionOrType,
    displayName,
    processLabel,
    paperES: parsed.paperES,
    reciprocityExpIndex: parsed.reciprocityExpIndex,
    reciprocityGIndex: parsed.reciprocityGIndex,
    useReciprocity: parsed.useReciprocity,
  };
  const sourceFiles = buildSourceFiles(file, parsed);
  const chartData = buildChartData(parsed);
  const keyValuesText = buildKeyValuesText({
    displayName,
    processLabel,
    developerName,
    dilution,
    temperatureText,
    parsed,
    fileName: file.name,
  });

  return {
    fileName: file.name,
    fileSize: file.size,
    displayName,
    processLabel,
    versionOrType: parsed.versionOrType,
    paperEs,
    reciprocityExpIndex: parsed.reciprocityExpIndex,
    reciprocityGIndex: parsed.reciprocityGIndex,
    useReciprocity: parsed.useReciprocity,
    reciprocityCode,
    useReciprocityText,
    inferredProcessParts,
    name,
    developerName,
    dilution,
    temperatureText,
    keyValuesText,
    rawXdf,
    sourceFiles,
    chartData,
    efsPointCount: parsed.efsGPoints.length,
    devPointCount: parsed.devGPoints.length,
    efsRows: parsed.efsGPoints.map((point) => ({
      averageG: point.averageGradient,
      effectiveFilmSpeed: point.effectiveFilmSpeed,
    })),
    devRows: parsed.devGPoints.map((point) => ({
      averageG: point.averageGradient,
      developmentTime: point.developmentMinutes,
    })),
  };
}

export function buildImportedBtzsProfileCreate(
  preview: ImportedBtzsXdfPreview,
): BTZSDevelopmentProfileCreate {
  return {
    type: "btzs",
    name: preview.name,
    developerName: preview.developerName,
    dilution: preview.dilution || null,
    temperatureText: preview.temperatureText,
    keyValuesText: preview.keyValuesText,
    rawXdf: preview.rawXdf,
    chartData: preview.chartData,
    sourceFiles: preview.sourceFiles,
  };
}
