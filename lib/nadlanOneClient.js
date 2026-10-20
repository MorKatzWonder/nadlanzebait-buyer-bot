// קליינט ל-API של נדל"ן 1 (NadlanOne) - שליפת נכסים בלעדיים + רישום ליד.
const axios = require("axios");

const LEAD_ENDPOINT = process.env.NADLANONE_LEAD_ENDPOINT;
const PROP_KEY = process.env.NADLANONE_PROP_KEY;
const API_KEY = process.env.NADLANONE_API_KEY;

const PROP_BASE = "https://int.nadlanone.co.il/apiv1/prop";

/**
 * שולף נכסים בלעדיים של המשרד לפי קריטריונים.
 * cat=1 => נכסי "למכירה" (לפי התיעוד: cat תואם לערכים המוחזרים ב-Info; 1 נבדק כברירת מחדל).
 */
async function searchExclusiveProperties({ cityId, hoodId, rooms, budget } = {}) {
  const params = { key: PROP_KEY, lang: "he", cat: 1 };
  if (cityId) params.city = cityId;
  if (hoodId) params.hood = hoodId;
  if (rooms) params.room = rooms;
  if (budget) params.budget = budget;

  const res = await axios.get(PROP_BASE, {
    params,
    headers: { "X-API-KEY": API_KEY, Accept: "application/json" },
  });
  // ה-API מחזיר אובייקט/מערך של נכסים - מתאימים את הצורה בהתאם לתשובה בפועל
  return Array.isArray(res.data) ? res.data : res.data?.items || [];
}

/**
 * רושם ליד חדש אוטומטית ב-CRM של נדל"ן 1.
 */
async function createLead({ firstName, phone, description, notes, source = "WhatsApp Bot" }) {
  const payload = {
    email: `${phone}@donotreply.com`,
    FirstName: firstName || "לקוח",
    Phone1: phone,
    Description: description || "",
    Notes: notes || "",
    Source: source,
  };
  const res = await axios.post(LEAD_ENDPOINT, payload, {
    headers: { "Content-Type": "application/json", "X-API-KEY": API_KEY },
  });
  return res.data;
}

module.exports = { searchExclusiveProperties, createLead };
