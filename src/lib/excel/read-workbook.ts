import ExcelJS from "exceljs";
import type { Cell, Grid } from "./cells";

export type Workbook = { sheets: { name: string; grid: Grid }[] };

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}

function parseCsv(input: string): Grid {
  const rows: Grid = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function readWorkbook(fileName: string, data: ArrayBuffer): Promise<Workbook> {
  if (/\.csv$/i.test(fileName)) {
    const textContent = new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
    return { sheets: [{ name: fileName, grid: parseCsv(textContent) }] };
  }
  if (!/\.xlsx$/i.test(fileName)) {
    throw new Error("รองรับเฉพาะไฟล์ .xlsx หรือ .csv (ถ้าเป็น .xls ให้เปิดใน Excel แล้ว “บันทึกเป็น” .xlsx)");
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheets = wb.worksheets
    .filter((ws) => ws.state === "visible" || ws.state === undefined)
    .map((ws) => {
      const grid: Grid = [];
      const colCount = Math.min(ws.columnCount || 0, 40);
      for (let r = 1; r <= Math.min(ws.rowCount, 2000); r++) {
        const row = ws.getRow(r);
        const cells: Cell[] = [];
        for (let c = 1; c <= colCount; c++) {
          const cell = row.getCell(c);
          // a merged cell repeats the master's value — keep it only in the master
          if (cell.isMerged && cell.master && cell.master.address !== cell.address) cells.push(null);
          else cells.push(cellValue(cell.value));
        }
        grid.push(cells);
      }
      return { name: ws.name, grid };
    });
  return { sheets };
}
