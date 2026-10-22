// Usage: npx tsx scripts/try-import.mts <file.xlsx> [sheet index]
import { readFile } from "node:fs/promises";
import { readWorkbook } from "../src/lib/excel/read-workbook";
import { parseEmployeeGrid } from "../src/lib/excel/employees";

const [file, idx = "0"] = process.argv.slice(2);
const buf = await readFile(file);
const wb = await readWorkbook(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const sheet = wb.sheets[Number(idx)];
const res = parseEmployeeGrid(sheet.grid);
console.log(`sheet: ${sheet.name} — ${res.rows.length} employees`);
console.table(res.rows.map(({ _row, sort_order, prefix, first_name, last_name, nickname, work_group, department, position, company, start_date, note }) =>
  ({ _row, sort_order, prefix, first_name, last_name, nickname, work_group, department, position, company, start_date, note })));
console.log("ignored columns:", res.ignoredColumns);
for (const i of res.issues) console.log(`row ${i.row} [${i.level}] ${i.message}`);
