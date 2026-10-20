// קליינט לגיליון "NonExclusiveApt" - נכסים שנאספים מקבוצות וואטסאפ של מתווכים.
// דורש Service Account עם הרשאת צפייה על הגיליון (GOOGLE_SHEETS_SPREADSHEET_ID).
const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_RANGE = "NonExclusiveApt!A2:Z"; // דלג על שורת הכותרות

// עמודות צפויות (יש להתאים בפועל למבנה האמיתי של הגיליון):
// A: עיר | B: שכונה | C: חדרים | D: מחיר | E: תיאור | F: מקור/קבוצה | G: תאריך איסוף
const COLUMNS = ["city", "neighborhood", "rooms", "price", "description", "source", "collectedAt"];

let cachedClient = null;

function getAuthClient() {
  if (cachedClient) return cachedClient;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  cachedClient = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );
  return cachedClient;
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
  return rows.map((row) => {
    const obj = {};
    COLUMNS.forEach((key, i) => (obj[key] = row[i] || ""));
    return obj;
  });
}

/**
 * מסנן את הנכסים שנאספו לפי קריטריוני הלקוח.
 * משווה כעיר/שכונה טקסטואלית, חדרים ותקציב.
 */
function filterListings(listings, { city, neighborhood, rooms, budget }) {
  return listings.filter((item) => {
    if (city && item.city && !item.city.includes(city)) return false;
    if (neighborhood && item.neighborhood && !item.neighborhood.includes(neighborhood)) return false;
    if (rooms && item.rooms && Number(item.rooms) !== Number(rooms)) return false;
    if (budget && item.price && Number(item.price) > Number(budget)) return false;
    return true;
  });
}

module.exports = { fetchNonExclusiveListings, filterListings };
