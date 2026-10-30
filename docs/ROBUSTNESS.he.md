# רובסטיות הפרויקט: איפה כל דבר נמצא

מפה מהסטנדרטים של המצגת "רובסטיות הפרויקט" אל הקבצים שמממשים אותם, כדי שאפשר יהיה לבדוק כל סעיף ישירות.

## גישה מרוכזת לחומרה דרך אובייקטים

**בקושחה**, כל גישה לחומרה עוברת דרך מחלקה אחת שזה התפקיד שלה. ה-`node.h` עצמו לא קורא לשום פונקציית חומרה.

| חומרה | המחלקה | הקובץ |
| --- | --- | --- |
| חיישני ה-IR (ה-ADC) | `PinAnalogReader`: הקריאה היחידה ל-`analogRead()` | [`hardware_io.h`](../hardware/smart_parking/hardware_io.h) |
| כפתור ה-BOOT | `PinButtonReader` | [`hardware_io.h`](../hardware/smart_parking/hardware_io.h) |
| חיבור ה-USB למחשב | `UsbSerialPort`: השימוש היחיד ב-`Serial` | [`hardware_io.h`](../hardware/smart_parking/hardware_io.h) |
| שעון, הגדרת ADC, אתחול | `Esp32Board` | [`hardware_io.h`](../hardware/smart_parking/hardware_io.h) |
| פס הלדים | `StatusLeds` | [`status_leds.h`](../hardware/smart_parking/status_leds.h) |
| זיכרון ה-flash | `SettingsStore` | [`settings_store.h`](../hardware/smart_parking/settings_store.h) |
| WiFi (אופציונלי) | `WifiService` | [`wifi_service.h`](../hardware/smart_parking/wifi_service.h) |

כל הלוגיקה בנויה ממחלקות בלי קוד Arduino בכלל: זיהוי מכונית, זיהוי חיישן תקול, פענוח פקודות, מכונת מצבים, ניטור הקשר. לכן היא נבדקת על מחשב רגיל, ב-24,115 בדיקות יחידה.

**באתר**, רק [`deviceLink.ts`](../src/hardware/deviceLink.ts) נוגע ב-Web Serial, ו-[`useHardware.ts`](../src/hardware/useHardware.ts) נותן לשאר האפליקציה ממשק אחד, בין אם הנתונים מגיעים מלוח אמיתי או מאמולטור.

## מצבי mock לחומרה

| איפה | איך מפעילים | מה קורה |
| --- | --- | --- |
| הלוח | הפקודה `MOCK ON`, מתג באתר, או לחיצה קצרה על כפתור ה-BOOT | הלוח מייצר בעצמו תרחיש של מכונית שמגיעה, חונה ויוצאת, בלי לקרוא את החיישנים. הלד האחרון סגול, כדי שאף אחד לא יתבלבל בין נתונים מדומים לאמיתיים ([`mock_source.h`](../hardware/smart_parking/mock_source.h)) |
| האתר | "No board? Emulate the sensors" בלוח החומרה | אמולטור של שני החיישנים עם מחוונים, שעובר בדיוק באותו מסלול כמו לוח אמיתי |
| הבדיקות | [`fake-board.js`](../tests/e2e/fake-board.js), ו-Arduino מדומה ב-[`arduino_stubs`](../hardware/tests/arduino_stubs) | לוח מדומה לבדיקות הדפדפן, ו-Arduino מדומה שמריץ את כל הקושחה על המחשב |

## ניהול מצבים מסודר ומתועד

- **הלוח:** [`state_machine.h`](../hardware/smart_parking/state_machine.h) הוא המקום היחיד שמחליט על מצב העבודה: עולה, עובד, מכייל, או תקלה בחיישן.
- **הקשר עם האפליקציה:** [`link_monitor.h`](../hardware/smart_parking/link_monitor.h), עם שלושה מצבים: עצמאי, מחובר, אבד הקשר.
- **החיבור באתר:** [`deviceLink.ts`](../src/hardware/deviceLink.ts), עם המצבים idle, connecting, connected ו-error.
- **הנסיעה של מכונית:** [`App.tsx`](../src/App.tsx), עם המצבים idle, detecting, searching, navigating ו-arrived.
- **תיעוד:** כל ארבעת מכונות המצבים מתועדות עם תרשימים ב-[STATE_MACHINE.md](STATE_MACHINE.md).

## דף הנחיות למשתמש

- [מדריך למשתמש בעברית](USER_GUIDE.he.md) ו-[באנגלית](USER_GUIDE.md): חיבור, שימוש, משמעות הלדים, כפתור ה-BOOT, הגדרות, ומה עושים כשמשהו לא עובד.
- הקישורים למדריכים נמצאים גם בתפריט הצד של [האתר](https://technionparking.vercel.app).
- [איך המערכת עובדת](HOW_IT_WORKS.he.md): הסבר מקצה לקצה, בעברית.

## ריכוז פרמטרים ומפתחות גישה בקבצים מתאימים

| מה | איפה |
| --- | --- |
| כל הגדרות הלוח: פינים, זמנים, ספים, מתג WiFi | [`config.h`](../hardware/smart_parking/config.h) |
| סיסמאות WiFi ו-OTA | `secrets.h`, שלא נכנס ל-git ([`.gitignore`](../.gitignore)); במאגר יש רק תבנית: [`secrets.h.example`](../hardware/smart_parking/secrets.h.example) |
| כל הזמנים והספים של האתר | [`src/config/constants.ts`](../src/config/constants.ts) |
| הגדרות ההדגמה והזמנים של מקרי הקצה | [`src/config/demoSettings.ts`](../src/config/demoSettings.ts) |
| כל ההנחות של מחקר הסימולציה | [`src/sim/params.ts`](../src/sim/params.ts) |
| הגדרות שנשמרות בדפדפן, עם בדיקת תקינות | [`src/config/storedSettings.ts`](../src/config/storedSettings.ts) |

אין במאגר מפתחות או סיסמאות.

## ובנוסף

- **[45 מקרי קצה](EDGE_CASES.md):** לכל אחד מה המשתמש רואה, איך המערכת מתאוששת, ואיך זה נבדק.
- **[ארכיטקטורה](ARCHITECTURE.md):** קובץ-קובץ, ומי מחליט מה.
- **[חומרה](HARDWARE.md):** חלקים, חיווט, הזנה, העלאת הקושחה וכיול.
- **[בדיקות](TESTING.md):** 50 בדיקות לאפליקציה, 24,194 בדיקות לקושחה ו-61 בדיקות בדפדפן, ורשימת בדיקה ידנית לחומרה.
- **בכל push** (GitHub Actions): lint, build, כל הבדיקות, והידור הקושחה ל-ESP32.
