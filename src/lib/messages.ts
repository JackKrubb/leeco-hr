// Thai messages for the error codes raised by the hr_* database functions.
const MESSAGES: Record<string, string> = {
  INVALID_LOGIN: "รหัสพนักงานหรือ PIN ไม่ถูกต้อง",
  LOCKED: "ใส่ PIN ผิดหลายครั้ง บัญชีถูกล็อก 15 นาที — หรือให้ HR รีเซ็ต PIN",
  NO_PIN: "ยังไม่มี PIN — ติดต่อ HR เพื่อรับ PIN",
  UNAUTHORIZED: "หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่",
  FORBIDDEN: "เฉพาะผู้ดูแลระบบ",
  WRONG_PIN: "PIN เดิมไม่ถูกต้อง",
  PIN_FORMAT: "PIN ต้องเป็นตัวเลข 4–6 หลัก",
  PIN_WEAK: "PIN ง่ายเกินไป (ห้ามเลขซ้ำทั้งหมด, เรียงกัน หรือเหมือนเดิม)",
  NOT_TRACKED: "บัญชีนี้ไม่ได้ใช้ลงเวลา",
  LOCATION_REQUIRED: "ต้องเปิดตำแหน่ง (GPS) เพื่อลงเวลา",
  OUTSIDE_SITE: "อยู่นอกพื้นที่บริษัท",
  ALREADY_CHECKED_IN: "วันนี้ลงเวลาเข้างานแล้ว",
  NOT_CHECKED_IN: "ยังไม่ได้ลงเวลาเข้างานวันนี้",
  ALREADY_CHECKED_OUT: "วันนี้ลงเวลาออกงานแล้ว",
  BAD_RANGE: "ช่วงวันที่ไม่ถูกต้อง",
  BAD_INPUT: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  DUPLICATE_CODE: "รหัสพนักงานนี้มีอยู่แล้ว",
  DUPLICATE_HOLIDAY: "มีวันหยุดชื่อนี้ในวันนั้นแล้ว",
  FIRST_NAME_REQUIRED: "ต้องใส่ชื่อ",
  CANNOT_DEMOTE_SELF: "ไม่สามารถปิดหรือลดสิทธิ์บัญชีของตัวเองได้",
  NOT_FOUND: "ไม่พบข้อมูล",
  OUT_BEFORE_IN: "เวลาออกต้องหลังเวลาเข้า",
};

export function errorMessage(code: string, detail?: string): string {
  if (code === "OUTSIDE_SITE" && detail) return `อยู่นอกพื้นที่บริษัท (ห่าง ${Number(detail).toLocaleString("th-TH")} เมตร)`;
  return MESSAGES[code] ?? `เกิดข้อผิดพลาด (${code})`;
}
