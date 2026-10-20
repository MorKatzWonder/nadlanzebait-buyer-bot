// ניהול session פשוט בזיכרון, מפתח = מספר הטלפון של הלקוח.
// הערה: זיכרון נמחק בכל הפעלה מחדש של השרת. לייצור אמיתי כדאי להחליף
// ל-Redis או טבלה קטנה ב-DB, אבל לשלב ה-MVP זה מספיק.

const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      phone,
      step: "ASK_CITY",
      answers: {},
      lastMatches: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return sessions.get(phone);
}

function updateSession(phone, patch) {
  const session = getSession(phone);
  Object.assign(session, patch, { updatedAt: new Date() });
  sessions.set(phone, session);
  return session;
}

function resetSession(phone) {
  sessions.delete(phone);
  return getSession(phone);
}

module.exports = { getSession, updateSession, resetSession };
