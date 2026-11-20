# GR2 Live — Neon İngilizce Etkinlik Platformu

Lefke Avrupa Üniversitesi Hazırlık Sınıfı Grup 2 için, Firebase Realtime Database ile eş zamanlı çalışan canlı etkinlik uygulaması.

## Çalıştırma

Bu proje derleme aracı gerektirmez. Dosyaları yerel bir sunucuyla açın; örneğin Visual Studio Code içindeki **Live Server** eklentisiyle `index.html` dosyasını çalıştırın. GitHub Pages, Firebase Hosting veya Netlify üzerinde doğrudan yayımlanabilir.

> `file://` ile çift tıklayarak açmak yerine bir web sunucusu kullanın. Firebase modülleri ve tarayıcı güvenlik kuralları bunu gerektirir.

## Firebase Console kurulumu (zorunlu)

1. **Authentication → Sign-in method** menüsünde **Email/Password** ve **Anonymous** yöntemlerini etkinleştirin.
2. Authentication → Users bölümünden üç yönetici kullanıcısını oluşturun. Uygulama, yönetici kullanıcı adını dahili olarak `kullaniciadi@eulgr2.local` biçiminde Firebase e-postasına dönüştürür. Örneğin kullanıcı adı `pembehoca` olan hesap, Firebase'de `pembehoca@eulgr2.local` olmalıdır.
3. Her kullanıcı oluşturulduktan sonra UID değerini kopyalayın ve Realtime Database'de `roles/UID` altına rolünü yazın. Parolaları yalnızca Firebase Authentication ekranında tanımlayın; bu projeye veya Realtime Database'e asla yazmayın.

Örnek rol kayıtları:

```json
{
  "roles": {
    "PEMBE_HOCA_UID": {
      "admin": true,
      "canAuthor": true,
      "displayName": "Pembe Hoca"
    },
    "BERAT_UID": {
      "admin": true,
      "canAuthor": false,
      "displayName": "Berat"
    },
    "IBRAHIM_UID": {
      "admin": true,
      "canAuthor": false,
      "displayName": "İbrahim"
    }
  }
}
```

`canAuthor: true` yalnızca Pembe Hoca için soru yazma yetkisini açar. Diğer iki yönetici, etkinliği başlatabilir ve ayrıntılı analizleri inceleyebilir; soru editörü kilitli görünür.

## Realtime Database güvenlik kuralları

Firebase Console → Realtime Database → Rules bölümündeki kuralları aşağıdaki temel sürümle değiştirin. Bu kurallar öğrencilerin yalnızca kendi gerçek ad/soyad, takma ad ve cevap kayıtlarına erişmesine izin verir; doğru şıklar ile tüm sınıfın gerçek adları sadece yöneticilere açıktır. Dağıtımdan önce kurum alan adınız için ek App Check ve API anahtarı kısıtlaması uygulayın.

```json
{
  "rules": {
    ".read": false,
    "activeEvent": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('roles').child(auth.uid).child('admin').val() === true"
    },
    "roles": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": false
      }
    },
    "events": {
      ".read": "auth != null && root.child('roles').child(auth.uid).child('admin').val() === true",
      "$eventId": {
        ".write": "auth != null && root.child('roles').child(auth.uid).child('admin').val() === true",
        "meta": { ".read": "auth != null" },
        "public": { ".read": "auth != null" },
        "leaderboard": { ".read": "auth != null" },
        "roundResults": { ".read": "auth != null" },
        "celebration": { ".read": "auth != null" },
        "kicked": {
          "$uid": {
            ".read": "auth != null && (auth.uid === $uid || root.child('roles').child(auth.uid).child('admin').val() === true)"
          }
        },
        "private": { ".read": "auth != null && root.child('roles').child(auth.uid).child('admin').val() === true" },
        "participants": {
          "$uid": {
            ".read": "auth != null && (auth.uid === $uid || root.child('roles').child(auth.uid).child('admin').val() === true)",
            ".write": "auth != null && (root.child('roles').child(auth.uid).child('admin').val() === true || (auth.uid === $uid && !data.exists() && newData.child('fullName').isString() && newData.child('ready').val() === false && newData.child('score').val() === 0))",
            ".validate": "newData.hasChildren(['fullName']) || root.child('roles').child(auth.uid).child('admin').val() === true",
            "ready": {
              ".write": "auth != null && auth.uid === $uid && data.exists()"
            },
            "readyAt": {
              ".write": "auth != null && auth.uid === $uid && newData.isNumber()"
            },
            "answers": {
              "$question": {
                ".write": "auth != null && auth.uid === $uid && !data.exists() && root.child('events').child($eventId).child('meta').child('status').val() === 'live' && root.child('events').child($eventId).child('meta').child('phase').val() === 'question' && now <= root.child('events').child($eventId).child('rounds').child($question).child('startedAt').val() + root.child('events').child($eventId).child('meta').child('timeLimit').val() * 1000",
                ".validate": "newData.hasChildren(['option','answeredAt']) && newData.child('option').isNumber() && newData.child('option').val() >= 0 && newData.child('option').val() < root.child('events').child($eventId).child('meta').child('optionCount').val() && newData.child('answeredAt').val() === now"
              }
            }
          }
        }
      }
    }
  }
}
```

> Bu uygulamanın istemci tarafında puan hesaplaması yalnızca yönetici hesabı tarafından tetiklenir. Yarışma sonuçlarını kötü niyetli değiştirmeye karşı tamamen korumak için ikinci aşamada Firebase Cloud Functions ile yanıt doğrulama ve puanlama eklenmelidir.

## Kısa akış

1. Pembe Hoca, **Yeni etkinlik oluştur** ekranından çift sayı olacak şekilde soru sayısını ve soru süresini, ayrıca 4/5 seçeneğini belirler; her sorunun doğru cevabını işaretler.
2. Etkinlik katılıma açılır. Öğrenciler gerçek ad-soyadlarıyla girip **Hazırım** der.
3. Yönetici etkinliği istediği anda başlatır. Her turun ardından ilk 10 ekranı gösterilir.
4. Bitince ödül ekranı, öğrenci analizi ve soru analizi oluşur.
