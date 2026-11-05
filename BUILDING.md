# بناء Upgrade AI Mobile

## المتطلبات

ثبّت الاعتماديات عبر `yarn install`، ثم تحقّق من الأنواع باستخدام `yarn typecheck`. ويمكن تشغيل `yarn lint` للفحص الإضافي. يتطلب بناء Android تثبيت Android SDK/NDK وضبط `ANDROID_HOME` أو `android/local.properties`. ويتطلب بناء iOS جهاز macOS مع Xcode وPods.

معرّف التطبيق في Android وiOS هو `com.upgradeai.mobile`. لإصدار Android موقّع، أنشئ مفتاحاً جديداً باسم `android/app/upgradeai-upload-key.keystore` والـalias `upgradeai-keystore`، ثم اضبط كلمتي المرور عبر المتغيرين في `.env.example`. لا يحتوي المشروع على مفتاح إصدار. في iOS، اختر فريق المطوّر الخاص بك في Xcode قبل النشر على جهاز فعلي أو إعداد إصدار المتجر.

## Firebase وRTL

لا تعِد استخدام إعداد Firebase الخاص بالتطبيق الأصلي. لتفعيل Firebase، أضف `android/app/google-services.json` الخاص بتطبيق `com.upgradeai.mobile` وملف `ios/AnythingLLM/GoogleService-Info.plist` الخاص به إلى هدف iOS. إعداد Android يتجاوز تلقائياً ملف JSON الذي لا يطابق معرّف التطبيق الجديد.

عند اختيار العربية، يفعّل التطبيق `I18nManager` لاتجاه RTL. قد يتطلب تطبيق الاتجاه بالكامل إغلاق التطبيق وإعادة فتحه، وفق سلوك React Native.
