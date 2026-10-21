// מכונת המצבים של שאלון הבוט.
// הערה: בשלב ה-MVP התשובות הן טקסט/מספר (1,2,3...) ולא כפתורי WhatsApp אמיתיים -
// כפתורים אמיתיים (Quick Reply / List) דורשים Twilio Content Templates מאושרים מראש
// על ידי מטא. ברגע שהתבניות יאושרו, אפשר להחליף את sendText בקריאות לתבניות.

const { searchExclusiveProperties, createLead } = require("./nadlanOneClient");
const {
  fetchNonExclusiveListings,
  filterListings,
  upsertCustomerMatch,
  upsertQuestionnaireAnswers,
  writeClientDraft,
} = require("./sheetsClient");
const { sendText } = require("./twilioClient");

const CITIES = ["תל אביב", "רמת גן", "גבעתיים"];
const ROOM_OPTIONS = ["1", "2", "3", "4", "5+"];

const ROOM_LABELS = { "1": "חדר", "2": "חדרים", "3": "חדרים", "4": "חדרים", "5+": "חדרים ומעלה" };

function greeting() {
  return 'היי 👋 כאן גילי מ"נדל"ן זה בית".\nאשמח לעזור לך למצוא את הדירה הבאה שלך - כמה שאלות קצרות ונתחיל לחפש.\n\nמה השם שלך?';
}

function citiesMenu() {
  return "באיזו עיר מתעניינים?\n" + CITIES.map((c, i) => `${i + 1}️⃣ ${c}`).join("\n");
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

/**
 * בונה תקציר של מה שכבר ידוע על הלקוח, מכל שדה שכבר נענה (גם אם זה רק
 * השם, בלי כלום אחר עדיין) - כדי שתמיד נוכל לשמור התקדמות חלקית.
 */
function buildRequirements(answers) {
  const parts = [];
  if (answers.city) parts.push(`עיר: ${answers.city}`);
  if (answers.neighborhood) parts.push(`שכונה: ${answers.neighborhood}`);
  if (answers.rooms) parts.push(`${answers.rooms} חדרים`);
  if (answers.budget) parts.push(`עד ₪${answers.budget}`);
  return parts.join(", ");
}

/**
 * שומר/מעדכן את התקדמות הלקוח בגיליון "התאמות לפי לקוח" - נקרא אחרי כל
 * שלב בשאלון, גם אם הלקוח עוזב באמצע ולא משלים הכל (בקשה מפורשת, 21/10).
 */
function saveProgress(phone, answers) {
  upsertCustomerMatch({ name: answers.name, phone, requirements: buildRequirements(answers) }).catch(
    (err) => console.error("Sheets upsert error:", err.message)
  );
  // כל "שאלה" היא עמודה בטאב "תשובות שאלון בוט" - כל תשובה בפועל נכתבת
  // לעמודה המתאימה לה באותה שורת לקוח (לפי טלפון), לא כתמלול שיחה חופשי.
  upsertQuestionnaireAnswers({
    phone,
    name: answers.name,
    city: answers.city,
    neighborhood: answers.neighborhood,
    rooms: answers.rooms,
    budget: answers.budget,
  }).catch((err) => console.error("Questionnaire sheet upsert error:", err.message));
}

async function handleIncomingMessage(phone, text, session, { updateSession }) {
  const msg = (text || "").trim();

  switch (session.step) {
    case "ASK_NAME": {
      await sendText(phone, greeting());
      updateSession(phone, { step: "WAIT_NAME" });
      return;
    }

    case "WAIT_NAME": {
      const name = msg;
      if (!name) {
        await sendText(phone, "מה השם שלך?");
        return;
      }
      const answersWithName = { ...session.answers, name };
      updateSession(phone, { answers: answersWithName, step: "WAIT_CITY" });
      saveProgress(phone, answersWithName);
      await sendText(phone, `נעים להכיר, ${name}! ${citiesMenu()}`);
      return;
    }

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
      const answersWithCity = { ...session.answers, city };
      updateSession(phone, { answers: answersWithCity, step: "WAIT_NEIGHBORHOOD" });
      saveProgress(phone, answersWithCity);
      await sendText(
        phone,
        `מעולה, ${city} 🙌\nיש שכונה או אזור ספציפי שמעניין אתכם? אפשר לכתוב שם שכונה, או "לא משנה" אם פתוחים לכל האזור.`
      );
      return;
    }

    case "WAIT_NEIGHBORHOOD": {
      const neighborhood = msg === "לא משנה" ? "" : msg;
      const answersWithNeighborhood = { ...session.answers, neighborhood };
      updateSession(phone, { answers: answersWithNeighborhood, step: "WAIT_ROOMS" });
      saveProgress(phone, answersWithNeighborhood);
      await sendText(phone, roomsMenu());
      return;
    }

    case "WAIT_ROOMS": {
      const rooms = parseChoice(msg, ROOM_OPTIONS);
      if (!rooms) {
        await sendText(phone, "לא זיהיתי, אפשר לבחור מספר מהרשימה:\n" + roomsMenu());
        return;
      }
      const answersWithRooms = { ...session.answers, rooms };
      updateSession(phone, { answers: answersWithRooms, step: "WAIT_BUDGET" });
      saveProgress(phone, answersWithRooms);
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
      saveProgress(phone, answers);
      await sendText(phone, "תודה! 🔍 מחפש בשבילכם נכסים שמתאימים בדיוק למה שסיפרתם לי, רגע...");

      // שולחים ל-CRM רק עם שאלון מלא (לא על כל תשובה בודדת, כדי לא להציף את אריק בלידים חלקיים) -
      // השורה בגיליון מתעדכנת תמיד, גם חלקית, אבל נדל"ן 1 מקבל ליד רק כשיש תמונה מלאה
      createLead({
        firstName: answers.name || "לקוח",
        phone,
        description: "פנייה מהבוט - חיפוש דירה",
        notes: buildRequirements(answers),
      }).catch((err) => console.error("NadlanOne lead error:", err.message));

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

      // הליד כבר נוצר כשהלקוח השלים את השאלון (ראו WAIT_BUDGET) - כאן רק מעדכנים
      // את אריק שהלקוח בחר נכס ספציפי מהרשימה, בלי ליצור ליד כפול.
      if (process.env.ARIK_NOTIFY_WHATSAPP) {
        await sendText(
          process.env.ARIK_NOTIFY_WHATSAPP,
          `🔔 לקוח חדש מעוניין בפרטים נוספים!\nשם: ${session.answers.name || "לא צוין"}\nטלפון: ${phone}\nנכס: ${property.description || property.price}\nקריטריונים: עיר ${session.answers.city}, ${session.answers.rooms} חדרים, עד ₪${session.answers.budget}`
        ).catch((err) => console.error("Notify Arik error:", err.message));
      }

      await sendText(
        phone,
        "קיבלתי! 🙌 אני גילי, אחזור אליכם בהקדם עם כל הפרטים על הנכס. אם יש משהו דחוף, אפשר גם ליצור איתי קשר ישירות."
      );
      updateSession(phone, { step: "DONE" });
      return;
    }

    case "DONE": {
      if (msg.includes("חיפוש חדש") || msg === "התחלה") {
        // שומרים את השם (כבר מוכר), מאפסים רק את קריטריוני החיפוש
        const keepName = session.answers.name;
        updateSession(phone, { step: "WAIT_CITY", answers: { name: keepName }, lastMatches: [] });
        await sendText(phone, citiesMenu());
        return;
      }
      await sendText(phone, 'אם תרצה לחפש דירה נוספת, שלח/י "חיפוש חדש".');
      return;
    }

    default: {
      updateSession(phone, { step: "ASK_NAME" });
      await sendText(phone, greeting());
      updateSession(phone, { step: "WAIT_NAME" });
      return;
    }
  }
}

async function showMatches(phone, answers, updateSession, session) {
  const [exclusive, nonExclusiveRaw] = await Promise.all([
    searchExclusiveProperties({ rooms: answers.rooms, budget: answers.budget }).catch((err) => {
      console.error("NadlanOne search error:", err.message);
      return [];
    }),
    fetchNonExclusiveListings().catch((err) => {
      console.error("Sheets fetch error:", err.message);
      return [];
    }),
  ]);

  const nonExclusive = filterListings(nonExclusiveRaw, answers).map((item) => ({
    rooms: item.rooms,
    price: item.price,
    neighborhood: item.neighborhood || item.city,
    description: item.description,
  }));

  // חשוב: נכסי שת"פ מוצגים בלי שם משרד/טלפון - אלו נשארים פנימיים עד לפנייה של אריק למתווך המקורי
  const matches = [...exclusive, ...nonExclusive].slice(0, 8);

  // כותבים ישר לעמודה O (טיוטה) ב"התאמות לפי לקוח" את אותה רשימת התאמות
  // שכבר נשלחה ללקוח בוואטסאפ - כך הלקוח מופיע מיידית בדאשבורד ("הצעות
  // ללקוחות" מוצג רק כש-O לא ריק), ואריק יכול להמשיך את השיחה ממספר אחר
  // עם טקסט מוכן (קישור wa.me בעמודה P), בלי לחכות שMAGIC 9/13 ירוצו.
  writeClientDraft({
    name: answers.name,
    phone,
    matches,
    requirements: buildRequirements(answers),
  }).catch((err) => console.error("Client draft write error:", err.message));

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
