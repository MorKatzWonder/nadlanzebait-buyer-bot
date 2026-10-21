// קליינט לגיליון "mappedApt" - הגרסה הממופה/מובנית של נכסים שנאספו מקבוצות וואטסאפ
// של מתווכים (הגיליון המקורי "הודעות"/NonExclusiveApt מכיל טקסט חופשי בלבד; mappedApt
// כבר מכיל עמודות מובנות: עיר, שכונה, חדרים, מחיר וכו').
// דורש Service Account עם הרשאת צפייה על הגיליון (GOOGLE_SHEETS_SPREADSHEET_ID).
const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_NAME = "mappedApt";
// טווח רחב מספיק לכל 38 העמודות של mappedApt; שורה 1 = כותרות
const SHEET_RANGE = `${SHEET_NAME}!A1:AL`;

// שמות העמודות בגיליון בפועל (שורה 1), לפי הסדר שאומת מול הגיליון החי
const HEADER_MAP = {
  message: "הודעה",
  phone: "טלפון",
  group: "קבוצה",
  sender: "שולח",
  messageType: "סוג הודעה", // ביקוש (דרישה של קונה) | היצע (נכס אמיתי)
  dealType: "סוג עסקה", // מכירה | השכרה
  propertyType: "סוג נכס",
  city: "עיר",
  neighborhood: "שכונה",
  street: "רחוב ומספר",
  price: "מחיר",
  rooms: "חדרים",
  area: "שטח במ״ר",
  balconyArea: "שטח מרפסת במ״ר",
  floor: "קומה",
  floorsTotal: "מתוך כמה קומות",
  parking: "חניות",
  storage: "מחסן",
  elevator: "מעלית",
  condition: "מצב הנכס",
  features: "מאפיינים",
  pointsOfInterest: "נקודות עניין בסביבה",
};

let cachedClient = null;

function getAuthClient() {
  if (cachedClient) return cachedClient;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  cachedClient = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    // כתיבה (append ל"התאמות לפי לקוח") + קריאה (mappedApt) - דורש הרשאת Editor בגיליון, לא רק Viewer
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  return cachedClient;
}

const MATCH_SHEET = "'התאמות לפי לקוח'";

/**
 * שומר/מעדכן שורה בגיליון "התאמות לפי לקוח" לפי מספר הטלפון (עמודה B) -
 * נקרא אחרי כל תשובה בשאלון (גם רק שם, בלי כלום אחר), כדי שלא נאבד אף
 * לקוח חלקי. אם כבר יש שורה לטלפון הזה - מעדכן אותה במקום ליצור כפולה.
 * ממלא רק את העמודות שהבוט אחראי עליהן (לקוח, טלפון, דרישות); שאר
 * העמודות (סטטוס, טיוטות וכו') נשארות לצוות.
 */
async function upsertCustomerMatch({ name, phone, requirements }) {
  if (!SPREADSHEET_ID || !phone) return;
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${MATCH_SHEET}!B:B`,
  });
  const phoneColumn = (existing.data.values || []).map((r) => r[0]);
  const rowIndex = phoneColumn.indexOf(phone); // 0-based, שורה 1 = כותרות

  const values = [[name || "", phone || "", requirements || ""]];

  if (rowIndex > 0) {
    // שורה קיימת ללקוח הזה - מעדכנים A:C בלבד, לא נוגעים בעמודות שהצוות ממלא ידנית
    const rowNumber = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MATCH_SHEET}!A${rowNumber}:C${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${MATCH_SHEET}!A:C`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
  }
}

function parseNumber(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

/**
 * בונה תיאור "נקי" לנכס - בלי טלפון/שם משרד/קבוצה (אלו מגיעים מהעמודות
 * phone/sender/group ולעולם לא נכנסים לכאן, כנדרש ממדיניות הפרטיות שלנו).
 */
function buildDescription(item) {
  const parts = [];
  if (item.propertyType) parts.push(item.propertyType);
  if (item.area) parts.push(`${item.area} מ"ר`);
  if (item.floor) parts.push(`קומה ${item.floor}${item.floorsTotal ? `/${item.floorsTotal}` : ""}`);
  if (item.condition) parts.push(item.condition);
  if (item.features) parts.push(item.features);
  if (item.street) parts.push(item.street);
  return parts.filter(Boolean).join(" | ");
}

async function fetchNonExclusiveListings() {
  if (!SPREADSHEET_ID) return []; // עדיין לא חובר - אל תיפול, פשוט אל תחזיר תוצאות
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const headerRow = rows[0];
  // ממפה כל שם-שדה לאינדקס העמודה שלו לפי הכותרת בפועל, כך שהקוד לא נשבר
  // אם מישהו מוסיף/מזיז עמודות בגיליון
  const colIndex = {};
  Object.entries(HEADER_MAP).forEach(([key, hebrewHeader]) => {
    colIndex[key] = headerRow.indexOf(hebrewHeader);
  });

  const dataRows = rows.slice(1);
  const listings = dataRows
    .map((row) => {
      const get = (key) => {
        const idx = colIndex[key];
        return idx === -1 || idx === undefined ? "" : row[idx] || "";
      };
      return {
        messageType: get("messageType"),
        dealType: get("dealType"),
        propertyType: get("propertyType"),
        city: get("city"),
        neighborhood: get("neighborhood"),
        street: get("street"),
        price: parseNumber(get("price")),
        rooms: get("rooms"),
        area: get("area"),
        floor: get("floor"),
        floorsTotal: get("floorsTotal"),
        condition: get("condition"),
        features: get("features"),
      };
    })
    // רק נכסים אמיתיים למכירה - לא "ביקושים" (בקשות של קונים שפורסמו בקבוצה)
    .filter((item) => item.messageType === "היצע" && item.dealType === "מכירה");

  return listings.map((item) => ({
    city: item.city,
    neighborhood: item.neighborhood,
    rooms: item.rooms,
    price: item.price,
    description: buildDescription(item),
  }));
}

/**
 * מסנן את הנכסים שנאספו לפי קריטריוני הלקוח.
 * משווה עיר/שכונה טקסטואלית, חדרים ותקציב.
 */
function filterListings(listings, { city, neighborhood, rooms, budget }) {
  return listings.filter((item) => {
    if (city && item.city && !item.city.includes(city)) return false;
    if (neighborhood && item.neighborhood && !item.neighborhood.includes(neighborhood)) return false;
    if (rooms && item.rooms) {
      const wanted = rooms.replace("+", "");
      if (rooms.includes("+")) {
        if (Number(item.rooms) < Number(wanted)) return false;
      } else if (Number(item.rooms) !== Number(wanted)) {
        return false;
      }
    }
    if (budget && item.price && Number(item.price) > Number(budget)) return false;
    return true;
  });
}

module.exports = { fetchNonExclusiveListings, filterListings, upsertCustomerMatch };
