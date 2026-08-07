# Transformation OS

**وصف المشروع**
- Transformation OS هو تطبيق ويب واحد الصفحة مبني بReact + Vite + TailwindCSS.
- كيوفر واجهة لإدارة التذكيرات، تقويم يومي، وحساب "momentum" للمهام.
- الكود الرئيسي موجود في [src/App.jsx](src/App.jsx) والمنطق في [src/utils/appLogic.js](src/utils/appLogic.js).

**المميزات الأساسية**
- تقويم يومي وواجهات تذكيرات.
- منطق تجاري مع اختبارات في [src/utils/appLogic.test.js](src/utils/appLogic.test.js).
- دعم Service Worker (PWA) عبر `public/sw.js`.
- تكامل مُخطط مع Firebase (auth + Firestore) عبر [src/firebase.js](src/firebase.js).

**المتطلبات**
- Node.js >= 16
- npm أو yarn

**تشغيل محلي (التطوير)**
- تثبيت الحزم:

```bash
npm install
```

- تشغيل السيرفر التطويري:

```bash
npm run dev
```

- فتح المتصفح على http://localhost:5173 (أو العنوان الذي يطبع Vite).

**بناء للإنتاج**

```bash
npm run build
npm run preview
```

**تهيئة Firebase**
- ملف التهيئة الرئيسي: [src/firebase.js](src/firebase.js).
- استعمال متغيرات بيئية مُوصى به عبر Vite: ضع مفاتيح Firebase في ملف `.env` أو في إعدادات الاستضافة. مثال:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

- بعد تغيير المتغيرات، أعد تشغيل السيرفر التطويري.
- تأكد من إعدادات OAuth Redirect URIs في Firebase Console لتطابق عنوان الاستضافة/التطوير.

**اختبارات**
- لتشغيل الاختبارات (لو مهيئة بـ `npm`):

```bash
npm run test
```

**تصحيح المشاكل الشائعة**
- لو واجهت أخطاء جافاسكريبت: فتح Console فالمتصفح، ستجد سجلات بفضل الـ handlers في `src/main.jsx`.
- لو التطبيق يقدم نسخة قديمة: جرّب تعطيل/إزالة Service Worker (ملف `public/sw.js`) أو مسح الكاش.
- لو مشاكل المصادقة: تحقق من `authDomain` وRedirect URI في Firebase Console.

**هيكل ملفات مهم**
- [src/main.jsx](src/main.jsx) — نقطة الدخول، تسجيل SW، handlers عالمية للأخطاء.
- [src/App.jsx](src/App.jsx) — الحالة الرئيسية وواجهة المستخدم.
- [src/utils/appLogic.js](src/utils/appLogic.js) — منطق التطبيق واختبارات.
- [public/sw.js](/public/sw.js) — Service Worker (PWA).

**المساهمة**
- فتح Issue لو عندك خطأ أو اقتراح.
- عمل Fork ثم PR لتغييرات صغيرة.
