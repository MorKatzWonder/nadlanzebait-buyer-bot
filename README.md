# בוט וואטסאפ לקונים - נדל"ן זה בית

## מה זה עושה
לקוח פותח שיחה בוואטסאפ → נשאל עיר, שכונה, חדרים, תקציב → הבוט מציג נכסים מתאימים
(גם נכסים בלעדיים מ-API של נדל"ן 1, וגם נכסים משיתוף פעולה מהגיליון NonExclusiveApt,
**בלי** שם משרד/טלפון של המתווך המקורי) → אם הלקוח מעוניין, הוא נרשם אוטומטית כליד
ב-CRM, ואריק מקבל התראה כדי לפנות למתווך המקורי לתיאום שת"פ.

## התקנה

```bash
npm install
cp .env.example .env
```

מלאו ב-`.env`:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` - מתוך חשבון Twilio
- `NADLANONE_API_KEY`, `NADLANONE_LEAD_ENDPOINT`, `NADLANONE_PROP_KEY` - כבר ממולאים לפי צילומי המסך ששלחתם
- `GOOGLE_SHEETS_SPREADSHEET_ID` + פרטי Service Account - לחיבור לגיליון NonExclusiveApt
- `ARIK_NOTIFY_WHATSAPP` - המספר האישי של אריק לקבלת התראות

## הרצה מקומית
```bash
npm start
```
השרת עולה על `http://localhost:3000`. כדי ש-Twilio יוכל להגיע אליו, צריך לחשוף אותו
לאינטרנט (למשל עם `ngrok http 3000` בזמן פיתוח, ולאחר מכן אחסון קבוע כמו Render/Railway).

## חיבור ל-Twilio
1. ב-Twilio Console → WhatsApp Sandbox (לבדיקות) או WhatsApp Senders (לייצור)
2. הגדירו את ה-Webhook URL של "When a message comes in" לכתובת: `https://<הדומיין-שלכם>/webhook`
3. ודאו שהשיטה מוגדרת ל-`HTTP POST`

## מה עדיין חסר להשלמה
1. **חיבור בפועל לגיליון NonExclusiveApt** - צריך את ה-Spreadsheet ID ופרטי Service Account
   (יוצרים ב-Google Cloud Console, משתפים את הגיליון עם המייל של ה-Service Account כ"צופה")
2. **מיפוי city/hood IDs** - כרגע השאלון שולח את שם העיר כטקסט חופשי; כדי לנצל סינון מדויק
   מול `/apiv1/prop` צריך קודם לשלוף את רשימת הערים/שכונות מ-`/apiv1/Info` ולמפות אותן
3. **כפתורי בחירה אמיתיים** - כרגע הבחירה היא במספר (1,2,3) בטקסט רגיל. כפתורי WhatsApp
   אמיתיים (Quick Reply/List) דורשים הגשת Content Templates לאישור מטא דרך Twilio
4. **פריסה לאחסון קבוע** - Render/Railway/VPS כדי שהשרת ירוץ 24/7
5. **מעבר מ-session בזיכרון ל-DB קבוע** - כרגע session נמחק בכל הפעלה מחדש של השרת
