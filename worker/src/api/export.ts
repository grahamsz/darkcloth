import { Hono } from "hono";
import { Env } from "../index";
import { authMiddleware, getUserId } from "./middleware";

type ExportCell = string | number | boolean | null;
type ExportRow = Record<string, ExportCell | Record<string, unknown> | unknown[] | undefined>;

type ExportSheet = {
  name: string;
  rows: ExportRow[];
};

const dataExport = new Hono<{ Bindings: Env }>();

dataExport.use("*", authMiddleware);

function sanitizeSheetName(name: string, usedNames: Set<string>) {
  const clean = name.replace(/[\]\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = clean;
  let index = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` ${index}`;
    candidate = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function normalizeCellValue(value: ExportRow[string]): ExportCell {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function getSheetHeaders(rows: ExportRow[]) {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

function sheetXml(rows: ExportRow[]) {
  const headers = getSheetHeaders(rows);
  const allRows = [
    Object.fromEntries(headers.map((header) => [header, header])),
    ...rows,
  ];

  const rowXml = allRows.map((row, rowIndex) => {
    const cells = headers.map((header, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      const value = normalizeCellValue(row[header]);
      if (value == null) return `<c r="${reference}"/>`;
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${reference}"><v>${value}</v></c>`;
      }
      const text = typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
      return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(text)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function workbookXml(sheets: ExportSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
  </sheets>
</workbook>`;
}

function workbookRelationshipsXml(sheets: ExportSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`;
}

function contentTypesXml(sheets: ExportSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function buildZip(files: Array<{ path: string; content: string }>) {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, checksum);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, checksum);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);

    localChunks.push(local, data);
    centralChunks.push(central);
    offset += local.length + data.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, offset);
  writeUint16(end, 20, 0);

  return concatBytes([...localChunks, centralDirectory, end]);
}

function buildWorkbook(sheets: ExportSheet[]) {
  const files = [
    { path: "[Content_Types].xml", content: contentTypesXml(sheets) },
    { path: "_rels/.rels", content: rootRelationshipsXml() },
    { path: "xl/workbook.xml", content: workbookXml(sheets) },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelationshipsXml(sheets) },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: sheetXml(sheet.rows),
    })),
  ];
  return buildZip(files);
}

async function allRows<T extends ExportRow>(env: Env, sql: string, ...bindings: unknown[]) {
  const rows = await env.DB.prepare(sql).bind(...bindings).all<T>();
  return rows.results;
}

dataExport.get("/xlsx", async (c) => {
  const userId = getUserId(c);
  const usedNames = new Set<string>();

  const [
    users,
    cameras,
    lenses,
    cameraLenses,
    filters,
    filterLenses,
    films,
    developmentProfiles,
    filmHolders,
    filmHolderCameraApplicability,
    filmHolderLoads,
    rolls,
    photographs,
    photographFilters,
    photographImages,
  ] = await Promise.all([
    allRows(c.env, "SELECT id, email, default_timezone, auto_use_current_location, created_at, updated_at FROM users WHERE id = ?", userId),
    allRows(c.env, "SELECT * FROM cameras WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM lenses WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM camera_lenses WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM filters WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM filter_lenses WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM films WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM development_profiles WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM film_holders WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM film_holder_camera_applicability WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM film_holder_loads WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM rolls WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM photographs WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(c.env, "SELECT * FROM photograph_filters WHERE user_id = ? ORDER BY created_at ASC", userId),
    allRows(
      c.env,
      `SELECT pi.id, pi.photograph_id, pi.content_type, pi.width, pi.height,
              pi.thumbnail_content_type, pi.thumbnail_width, pi.thumbnail_height,
              pi.original_content_type, pi.original_width, pi.original_height,
              pi.original_filename, pi.created_at
         FROM photograph_images pi
         JOIN photographs p ON p.id = pi.photograph_id
        WHERE p.user_id = ?
        ORDER BY pi.created_at ASC`,
      userId,
    ),
  ]);

  const sheets: ExportSheet[] = [
    { name: "profile", rows: users },
    { name: "cameras", rows: cameras },
    { name: "lenses", rows: lenses },
    { name: "camera_lenses", rows: cameraLenses },
    { name: "filters", rows: filters },
    { name: "filter_lenses", rows: filterLenses },
    { name: "film_stocks", rows: films },
    { name: "development_profiles", rows: developmentProfiles },
    { name: "film_holders", rows: filmHolders },
    { name: "holder_camera_links", rows: filmHolderCameraApplicability },
    { name: "film_holder_loads", rows: filmHolderLoads },
    { name: "rolls", rows: rolls },
    { name: "photographs", rows: photographs },
    { name: "photograph_filters", rows: photographFilters },
    { name: "reference_images", rows: photographImages },
  ].map((sheet) => ({ ...sheet, name: sanitizeSheetName(sheet.name, usedNames) }));

  const workbook = buildWorkbook(sheets);
  const today = new Date().toISOString().slice(0, 10);
  return new Response(workbook, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="darkcloth-export-${today}.xlsx"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

export default dataExport;
