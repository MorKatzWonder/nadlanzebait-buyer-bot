// מכונת המצבים של שאלון הבוט.
// הערה: בשלב ה-MVP התשובות הן טקסט/מספר (1,2,3...) ולא כפתורי WhatsApp אמיתיים -
// כפתורים אמיתיים (Quick Reply / List) דורשים Twilio Content Templates מאושרים מראש
// על ידי מטא. ברגע שהתבניות יאושרו, אפשר להחליף את sendText בקריאות לתבניות.

const { searchExclusiveProperties, createLead } = require("./nadlanOneClient");
const { fetchNonExclusiveListings, filterListings } = require("./sheetsClient");
const { sendText } = require("./twilioClient");

const CITIES = ["תל אביב", "רמת גן", "גבעתיים"];
const ROOM_OPTIONS = ["1", "2", "3", "4", "5+"];

const ROOM_LABELS = { "1": "חדר", "2": "חדרים", "3": "חדרים", "4": "חדרים", "5+": "חדרים ומעלה" };

function citiesMenu() {
  return (
    'היי 👋 כאן אריק מ"נדל"ן זה בית".\nאשמח לעזור לך למצוא את הדירה הבאה שלך - כמה שאלות קצרות ונתחיל לחפש.\n\nבאיזו עיר מתעניינים?\n' +
    CITIES.map((c, i) => `${i + 1}️⃣ ${c}`).join("\n")
  );
}

function roomsMenu() {
  return (
    "כמה חדרים אתם מחפשים?\n" +
    ROOM_OPTIONS.map((r, i) => `${i + 1}️⃣ ${r} ${ROOM_LABELS[r]}`).join("\n")
  );
}

function parseChoice(text, options) {
  const trimmed = (text || "").trim();
  const asNumber = parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  // תמיכה גם בהקלדה חופשית של השם עצמו
  const match = options.find((o) => trimmed.includes(o));
  return match || null;
}

function formatProperty(p, index) {
  // תומך גם במבנה של נכס בלעדי (API) וגם בשורה מהגיליון (שת"פ) - בלי שם משרד/טלפון!
  const rooms = p.rooms || p.room || "";
  const price = p.price || "";
  const area = p.neighborhood || p.city || "";
  const desc = p.description || "";
  return `${index + 1}. ${area} | ${rooms} חדרים | ₪${price}\n${desc}`.trim();
}

async function handleIncomingMessage(phone, text, session, { updateSession }) {
  const msg = (text || "").trim();

  switch (session.step) {
    case "ASK_CITY": {
      await sendText(phone, citiesMenu());
      updateSession(phone, { step: "WAIT_CITY" });
      return;
    }

    case "WAIT_CITY": {
      const city = parseChoice(msg, CITIES);
      if (!city) {
        await sendText(phone, "לא זיהיתי את העיר, אפשר לבחור מספר מהרשימה:\n" + citiesMenu());
        return;
      }
      updateSession(phone, { answers: { ...session.answers, city }, step: "WAIT_NEIGHBORHOOD" });
      await sendText(
        phone,
        `מעולה, ${city} 🙌\nיש שכונה או אזור ספציפי שמעניין אתכם? אפשר לכתוב שם שכונה, או "לא משנה" אם פתוחים לכל האזור.`
      );
      return;
    }

    case "WAIT_NEIGHBORHOOD": {
      const neighborhood = msg === "לא משנה" ? "" : msg;
      updateSession(phone, { answers: { ...session.answers, neighborhood }, step: "WAIT_ROOMS" });
      await sendText(phone, roomsMenu());
      return;
    }

    case "WAIT_ROOMS": {
      const rooms = parseChoice(msg, ROOM_OPTIONS);
      if (!rooms) {
        await sendText(phone, "לא זיהיתי, אפשר לבחור מספר מהרשימה:\n" + roomsMenu());
        return;
      }
      updateSession(phone, { answers: { ...session.answers, rooms }, step: "WAIT_BUDGET" });
      await sendText(phone, "מה התקציב המקסימלי שלכם לרכישה? (בש״ח, למשל: 3500000)");
      return;
    }

    case "WAIT_BUDGET": {
      const budgetNum = parseInt(msg.replace(/[^\d]/g, ""), 10);
      if (!budgetNum) {
        await sendText(phone, "נא לשלוח תקציב כמספר, למשל: 3500000");
        return;
      }
      const answers = { ...session.answers, budget: budgetNum };
      updateSession(phone, { answers, step: "SHOWING_MATCHES" });
      await sendText(phone, "תודה! 🔍 מחפש בשבילכם נכסים שמתאימים בדיוק למה שסיפרתם לי, רגע...");
      await showMatches(phone, answers, updateSession, session);
      return;
    }

    case "WAIT_INTEREST": {
      const choiceNum = parseInt(msg, 10);
      const property = session.lastMatches[choiceNum - 1];
      if (!property) {
        await sendText(
          phone,
          'נא לשלוח את המספר של הנכס שמעניין אותך מהרשימה, או "חיפוש חדש" כדי להתחיל שוב.'
        );
        return;
      }

      await createLead({
        firstName: session.answers.name || "לקוח",
        phone,
        description: `מעוניין בנכס: ${property.description || ""}`,
        notes: `עיר: ${session.answers.city}, שכונה: ${session.answers.neighborhood}, חדרים: ${session.answers.rooms}, תקציב: ${session.answers.budget}`,
      }).catch((err) => console.error("NadlanOne lead error:", err.message));

      if (process.env.ARIK_NOTIFY_WHATSAPP) {
        await sendText(
          process.env.ARIK_NOTIFY_WHATSAPP,
          `🔔 לקוח חדש מעוניין בפרטים נוספים!\nטלפון: ${phone}\nנכס: ${property.description || property.price}\nקריטריונים: עיר ${session.answers.city}, ${session.answers.rooms} חדרים, עד ₪${session.answers.budget}`
        ).catch((err) => console.error("Notify Arik error:", err.message));
      }

      await sendText(
        phone,
        "קיבלתי! 🙌 אני אריק, אחזור אליכם בהקדם עם כל הפרטים על הנכס. אם יש משהו דחוף, אפשר גם ליצור איתי קשר ישירות."
      );
      updateSession(phone, { step: "DONE" });
      return;
    }

    case "DONE": {
      if (msg.includes("חיפוש חדש") || msg === "התחלה") {
        updateSession(phone, { step: "ASK_CITY", answers: {}, lastMatches: [] });
        await sendText(phone, citiesMenu());
        updateSession(phone, { step: "WAIT_CITY" });
        return;
      }
      await sendText(phone, 'אם תרצה לחפש דירה נוספת, שלח/י "חיפוש חדש".');
      return;
    }

    default: {
      updateSession(phone, { step: "ASK_CITY" });
      await sendText(phone, citiesMenu());
      updateSession(phone, { step: "WAIT_CITY" });
      return;
    }
  }
}

async function showMatches(phone, answers, updateSession, session) {
  const [exclusive, nonExclusiveRaw] = await Promise.all([
    searchExclusiveProperties({ rooms: answers.rooms, budget: answers.budget }).catch(() => []),
    fetchNonExclusiveListings().catch(() => []),
  ]);

  const nonExclusive = filterListings(nonExclusiveRaw, answers).map((item) => ({
    rooms: item.rooms,
    price: item.price,
    neighborhood: item.neighborhood || item.city,
    description: item.description,
  }));

  // חשוב: נכסי שת"פ מוצגים בלי שם משרד/טלפון - אלו נשארים פנימיים עד לפנייה של אריק למתווך המקורי
  const matches = [...exclusive, ...nonExclusive].slice(0, 8);

  if (matches.length === 0) {
    await sendText(
      phone,
      "כרגע אין לי נכס שמתאים בדיוק לקריטריונים שסיפקתם, אבל שמרתי את החיפוש שלכם - ברגע שמשהו מתאים ייכנס, אני אעדכן אתכם ראשונים 🙏"
    );
    updateSession(phone, { step: "DONE" });
    return;
  }

  const list = matches.map(formatProperty).join("\n\n");
  await sendText(
    phone,
    `מצאתי ${matches.length} נכסים שעונים על מה שחיפשתם 🏠\n\n${list}\n\nאחד מהם מעניין אתכם? שלחו את המספר שלו ואחזור אליכם עם כל הפרטים.`
  );
  updateSession(phone, { step: "WAIT_INTEREST", lastMatches: matches });
}

module.exports = { handleIncomingMessage };
