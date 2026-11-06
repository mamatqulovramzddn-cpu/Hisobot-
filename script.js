/* =====================================================================
   HISOBOT PRO MAX: script.js
   Bu fayl ichida 3 narsa bor: 1) ISHGA TUSHIRISH KO'RSATMASI, 2) SOZLAMALAR
   (faqat shu joyni to'ldirasiz), 3) ilovaning o'zi.

   ---------------------------------------------------------------------
   1) ISHGA TUSHIRISH (Gmail orqali Pro/Max berish uchun, hammasi bepul)
   ---------------------------------------------------------------------
   Gmail bilan kirish faqat INTERNETDAGI saytda ishlaydi (fayl sifatida
   ochilganda ishlamaydi). Sozlanmagan bo'lsa, sayt "mahalliy rejim"da
   ishlaydi: Sozlamalar ichida egasi paroli bilan shu qurilmada Max/Pro ni
   ko'rish va ishlatish mumkin.

   a) https://console.firebase.google.com da loyiha yarating (Add project).
   b) Build > Authentication > Get started > Sign-in method > Google >
      Enable > o'z Gmailingizni "support email" qiling > Save.
   c) Build > Firestore Database > Create database > Production rejimi.
      Keyin Rules bo'limiga pastdagi QOIDALARNI qo'ying,
      'sizning_gmailingiz@gmail.com' o'rniga o'z Gmailingizni KICHIK
      harflarda yozing va Publish bosing.
   d) Project settings > General > Your apps > Web (</>) > Register app.
      Ko'rsatilgan firebaseConfig dan apiKey, authDomain, projectId, appId ni
      pastdagi SOZLAMALAR ga ko'chiring. ownerEmail ga ham o'z Gmailingizni
      yozing (c bandidagi bilan bir xil).
   e) Saytni internetga joylang (Netlify Drop: https://app.netlify.com/drop,
      yoki Firebase Hosting, yoki GitHub Pages). index.html, style.css va
      script.js ni birga joylang.
   f) Authentication > Settings > Authorized domains > Add domain: sayt
      manzilingizni yozing (masalan mening-saytim.netlify.app).
   g) Saytni oching > Tariflar > "Gmail bilan kirish" (o'z Gmailingiz bilan) >
      Sozlamalar > "Obuna berish": mijozning Gmailini yozing, necha kun
      ekanini kiriting (bo'sh = muddatsiz), "Pro berish" yoki "Max berish".

   ---------------------------------------------------------------------
   FIRESTORE QOIDALARI (Firebase > Firestore > Rules ga shuni qo'ying):
   ---------------------------------------------------------------------
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       function signedIn() {
         return request.auth != null && request.auth.token.email_verified == true;
       }

       // MUHIM: shu yerga o'z Gmail manzilingizni kichik harflarda yozing (pastdagi SOZLAMALAR dagi ownerEmail bilan bir xil)
       function isOwner() {
         return signedIn() && request.auth.token.email.lower() == 'sizning_gmailingiz@gmail.com';
       }

       // Obunalar: har kim faqat o'zining obunasini o'qiydi, yozishni faqat egasi qila oladi
       match /subscriptions/{email} {
         allow read: if isOwner() || (signedIn() && request.auth.token.email.lower() == email);
         allow write: if isOwner();
       }

       // Hamma ko'radigan sozlamalar (narxlar, Telegram, reklama): yozishni faqat egasi qiladi
       match /public/{docId} {
         allow read: if true;
         allow write: if isOwner();
       }
     }
   }

   ---------------------------------------------------------------------
   Muhim: obunani faqat ownerEmail Gmaili bera oladi (tekshiruv Firebase
   qoidalarida, serverda). Kunlik yozuvlar hozircha har bir qurilmada alohida
   saqlanadi. Pro/Max imkoniyatlari brauzerda hisoblanadi.
   ===================================================================== */

/* ===================== 2) SOZLAMALAR (shu yerni to'ldiring) ===================== */
window.HPM_CONFIG = {
  /* Sizning (egasining) Google/Gmail manzilingiz. Faqat shu manzil obuna bera oladi. */
  ownerEmail: 'SIZNING_GMAILINGIZ@gmail.com',

  /* Firebase loyihangizdan ko'chirib olingan qiymatlar (yuqoridagi ko'rsatmaning d bandiga qarang) */
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT',
    appId: 'YOUR_APP_ID'
  }
};

/* ===================== 3) ILOVA ===================== */
(function () {
  'use strict';
  var MONTHS = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  var WEEK = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  var KINDS = { sale: 'Sotildi', ret: 'Qaytdi', ans: 'Javob berildi', miss: 'Javobsiz' };
  var ORDER = ['sale', 'ret', 'ans', 'miss'];
  var LS = 'kunlik-hisobot:';
  var LSS = 'kunlik-hisobot-settings';

  /* Telegram va egasi sozlamalari (Gmail va Firebase sozlamalari fayl boshida) */
  var TG_DEFAULT = 'mamatqul0vvv';
  var OWN_KEY = 'hisobot-pro-max:owner';
  var OWN_PLAN_KEY = 'hisobot-pro-max:owner-plan';
  var OWNER_SALT = '3l39n8e76un4';
  var OWNER_HASH = 'f561d8db452ac29f56b2f444ba4be3135f0d713ed0be7e7db67fccbe597d990d';

  var db = null, dl = null, owner = false, ownerPlan = 2;
  var days = {};
  var PLANS = ['free', 'pro', 'max'];
  var PNAME = ['Bepul', 'Pro', 'Max'];
  var settings = { goal: 0, products: [], plan: 'free', proPrice: 39999, maxPrice: 59999, tg: TG_DEFAULT };
  var selected = today();
  var writing = Promise.resolve();
  var lastRemoved = null;
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dstr(new Date()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function shift(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return dstr(d); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function money(n) { return fmt(n) + ' so’m'; }
  function short(n) {
    var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + (Math.round(a / 1e5) / 10) + ' mln';
    if (a >= 1e3) return s + Math.round(a / 1e3) + ' ming';
    return s + Math.round(a);
  }
  function hhmm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dots(s) { var p = s.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function digits(v) { var n = parseInt(String(v || '').replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; }
  function entriesOf(date) { return days[date] || []; }

  function stats(entries) {
    var s = { sale: 0, ret: 0, ans: 0, miss: 0, saleSum: 0, retSum: 0, paid: 0, pending: 0 };
    var hours = {};
    entries.forEach(function (e) {
      s[e.kind] += 1;
      if (e.kind === 'sale') { s.saleSum += e.amount || 0; if (e.amount > 0) s.paid += 1; }
      if (e.kind === 'ret') s.retSum += e.amount || 0;
      if (e.kind === 'miss' && !e.done) s.pending += 1;
      var h = new Date(e.ts).getHours();
      hours[h] = (hours[h] || 0) + 1;
    });
    s.calls = s.ans + s.miss;
    s.rate = s.calls ? Math.round((s.ans / s.calls) * 100) : null;
    s.net = s.saleSum - s.retSum;
    s.hasMoney = s.saleSum > 0 || s.retSum > 0;
    s.avg = s.paid ? Math.round(s.saleSum / s.paid) : null;
    s.retShare = s.sale ? Math.round((s.ret / s.sale) * 100) : null;
    s.busy = null;
    var best = 0;
    Object.keys(hours).forEach(function (h) { if (hours[h] > best) { best = hours[h]; s.busy = +h; } });
    return s;
  }

  function setStatus(t) { $('status').textContent = t || ''; }

  /* storage */
  function save(date, entries) {
    days[date] = entries;
    render();
    if (db) {
      writing = writing
        .then(function () { return db.doc('days/' + date).set({ date: date, entries: entries }); })
        .catch(function () { setStatus('Saqlab bo’lmadi. Internetni tekshirib, qayta urinib ko’ring.'); });
    } else {
      try { localStorage.setItem(LS + date, JSON.stringify(entries)); } catch (e) {}
    }
  }
  function saveSettings() {
    render();
    if (fbOn && owner && fs) {
      fs.doc('public/settings').set({
        proPrice: settings.proPrice, maxPrice: settings.maxPrice, tg: settings.tg,
        adTitle: settings.adTitle || '', adText: settings.adText || '', adLink: settings.adLink || ''
      }, { merge: true }).catch(function () { setStatus('Narx va reklamani hamma uchun saqlab bo’lmadi (egasi ruxsati?).'); });
    }
    if (db) {
      var body = { goal: settings.goal, products: settings.products, plan: settings.plan, proPrice: settings.proPrice, maxPrice: settings.maxPrice, tg: settings.tg, adTitle: settings.adTitle || '', adText: settings.adText || '', adLink: settings.adLink || '' };
      writing = writing
        .then(function () { return db.doc('settings/main').set(body); })
        .catch(function () { setStatus('Sozlamalarni saqlab bo’lmadi.'); });
    } else {
      try { localStorage.setItem(LSS, JSON.stringify(settings)); } catch (e) {}
    }
  }
  function normSettings(v) {
    v = v || {};
    return {
      goal: +v.goal || 0,
      products: Array.isArray(v.products) ? v.products : [],
      plan: PLANS.indexOf(v.plan) >= 0 ? v.plan : 'free',
      proPrice: +v.proPrice || 39999,
      maxPrice: +v.maxPrice || 59999,
      tg: (typeof v.tg === 'string' && v.tg.trim()) ? v.tg : TG_DEFAULT,
      adTitle: typeof v.adTitle === 'string' ? v.adTitle : '',
      adText: typeof v.adText === 'string' ? v.adText : '',
      adLink: typeof v.adLink === 'string' ? v.adLink : ''
    };
  }
  /* ---------- Gmail bilan kirish va obuna (Firebase) ---------- */
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256hex(str) {
    var bytes = new TextEncoder().encode(str);
    var l = bytes.length, w = [], i, j;
    for (i = 0; i < l; i++) w[i >> 2] = (w[i >> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
    w[l >> 2] = (w[l >> 2] || 0) | (0x80 << (24 - (l % 4) * 8));
    var total = (((l + 8) >> 6) + 1) * 16;
    for (i = 0; i < total; i++) if (w[i] === undefined) w[i] = 0;
    w[total - 1] = l * 8;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for (var o = 0; o < total; o += 16) {
      var x = w.slice(o, o + 16), a = H.slice();
      for (j = 16; j < 64; j++) {
        var s0 = rotr(x[j - 15], 7) ^ rotr(x[j - 15], 18) ^ (x[j - 15] >>> 3);
        var s1 = rotr(x[j - 2], 17) ^ rotr(x[j - 2], 19) ^ (x[j - 2] >>> 10);
        x[j] = (x[j - 16] + s0 + x[j - 7] + s1) | 0;
      }
      for (j = 0; j < 64; j++) {
        var S1 = rotr(a[4], 6) ^ rotr(a[4], 11) ^ rotr(a[4], 25);
        var ch = (a[4] & a[5]) ^ (~a[4] & a[6]);
        var t1 = (a[7] + S1 + ch + SHA_K[j] + x[j]) | 0;
        var S0 = rotr(a[0], 2) ^ rotr(a[0], 13) ^ rotr(a[0], 22);
        var maj = (a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]);
        var t2 = (S0 + maj) | 0;
        a = [(t1 + t2) | 0, a[0], a[1], a[2], (a[3] + t1) | 0, a[4], a[5], a[6]];
      }
      for (j = 0; j < 8; j++) H[j] = (H[j] + a[j]) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }

  var CFG = window.HPM_CONFIG || {};
  var fbOn = false, auth = null, fs = null, user = null, sub = null, allSubs = [];
  var subOff = null, allOff = null;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ownerMail() { return String(CFG.ownerEmail || '').trim().toLowerCase(); }
  function tgName() { return String(settings.tg || '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, ''); }
  function cfgReady() {
    var c = CFG.firebase || {};
    return !!(c.apiKey && c.projectId && String(c.apiKey).indexOf('YOUR_') !== 0 && String(c.projectId).indexOf('YOUR_') !== 0 &&
      window.firebase && typeof window.firebase.initializeApp === 'function');
  }
  function normSub(d) {
    d = d || {};
    return { plan: d.plan === 'max' ? 'max' : (d.plan === 'pro' ? 'pro' : ''), exp: typeof d.expiresAt === 'string' ? d.expiresAt : '' };
  }
  function subLevel() {
    if (!sub || !sub.plan) return 0;
    if (sub.exp && sub.exp < today()) return 0;
    return sub.plan === 'max' ? 2 : 1;
  }
  function lvl() { return owner ? ownerPlan : subLevel(); }

  function loadOwnerPlan() {
    var p = lsGet(OWN_PLAN_KEY);
    if (p !== null && +p >= 0 && +p <= 2) ownerPlan = +p;
  }
  function initAuth() {
    fbOn = cfgReady();
    loadOwnerPlan();
    if (!fbOn) { owner = lsGet(OWN_KEY) === OWNER_HASH; return; }
    try {
      if (!(window.firebase.apps && window.firebase.apps.length)) window.firebase.initializeApp(CFG.firebase);
      auth = window.firebase.auth();
      fs = window.firebase.firestore();
    } catch (e) { fbOn = false; owner = lsGet(OWN_KEY) === OWNER_HASH; setStatus('Kirish tizimi ulanmadi.'); return; }
    auth.onAuthStateChanged(handleUser);
    fs.doc('public/settings').onSnapshot(function (s) {
      if (!s.exists) return;
      var d = s.data() || {};
      if (+d.proPrice) settings.proPrice = +d.proPrice;
      if (+d.maxPrice) settings.maxPrice = +d.maxPrice;
      if (typeof d.tg === 'string' && d.tg.trim()) settings.tg = d.tg;
      if (typeof d.adTitle === 'string') settings.adTitle = d.adTitle;
      if (typeof d.adText === 'string') settings.adText = d.adText;
      if (typeof d.adLink === 'string') settings.adLink = d.adLink;
      render();
    }, function () {});
  }
  function handleUser(u) {
    if (subOff) { subOff(); subOff = null; }
    if (allOff) { allOff(); allOff = null; }
    sub = null; allSubs = [];
    if (!u || !u.email) { user = null; owner = false; render(); return; }
    user = { email: String(u.email).toLowerCase(), name: u.displayName || '' };
    owner = !!ownerMail() && user.email === ownerMail();
    subOff = fs.collection('subscriptions').doc(user.email).onSnapshot(function (s) {
      sub = s.exists ? normSub(s.data()) : null;
      render();
    }, function () { setStatus('Obuna ma’lumotini o’qib bo’lmadi. Internetni tekshiring.'); });
    if (owner) {
      allOff = fs.collection('subscriptions').onSnapshot(function (qs) {
        var a = [];
        qs.forEach(function (d) { var v = normSub(d.data()); a.push({ email: d.id, plan: v.plan, exp: v.exp }); });
        a.sort(function (x, y) { return x.email < y.email ? -1 : 1; });
        allSubs = a;
        render();
      }, function () { setStatus('Obunalar ro’yxatini o’qib bo’lmadi. Firestore qoidalarini tekshiring.'); });
    }
    render();
  }
  function signIn() {
    if (!fbOn) return;
    var prov = new window.firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(prov).catch(function (e) {
      var code = (e && e.code) || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') auth.signInWithRedirect(prov);
      else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') toast('Kirib bo’lmadi: ' + (code || 'xato'), null, null, 5000);
    });
  }
  function writeSub(email, plan, exp, okMsg) {
    fs.collection('subscriptions').doc(email).set({
      plan: plan, expiresAt: exp, updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () { toast(okMsg, null, null, 3000); },
            function () { toast('Saqlab bo’lmadi. Firestore qoidalarini va egasi Gmail manzilini tekshiring.', null, null, 5000); });
  }
  function grant(plan) {
    if (!fbOn || !owner) return;
    var email = $('gMail').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Gmail manzilini to’g’ri yozing', null, null, 3000); return; }
    var n = digits($('gDays').value);
    var exp = n ? shift(today(), Math.min(n, 3650)) : '';
    writeSub(email, plan, exp, (plan === 'max' ? 'Max' : 'Pro') + ' berildi: ' + email);
    $('gMail').value = '';
  }
  function findSub(email) { return allSubs.filter(function (s) { return s.email === email; })[0]; }
  function extendSub(email) {
    if (!fbOn || !owner) return;
    var s = findSub(email);
    if (!s) return;
    if (!s.exp) { toast('Bu obuna muddatsiz', null, null, 2500); return; }
    var base = s.exp > today() ? s.exp : today();
    writeSub(email, s.plan, shift(base, 30), 'Muddat 30 kunga uzaytirildi: ' + email);
  }
  function revokeSub(email) {
    if (!fbOn || !owner) return;
    if (!window.confirm(email + ' obunasi olib tashlansinmi?')) return;
    fs.collection('subscriptions').doc(email).delete().then(
      function () { toast('Obuna olib tashlandi: ' + email, null, null, 3000); },
      function () { toast('O’chirib bo’lmadi. Firestore qoidalarini tekshiring.', null, null, 4500); });
  }
  function ownerLogin() {
    var pw = $('ownPw').value;
    if (!fbOn && pw && sha256hex(OWNER_SALT + pw) === OWNER_HASH) {
      owner = true; lsSet(OWN_KEY, OWNER_HASH); $('ownPw').value = '';
      render();
      toast('Egasi rejimi yoqildi', null, null, 2500);
    } else toast('Parol noto’g’ri', null, null, 2500);
  }
  function renderSubs() {
    $('subList').innerHTML = allSubs.length ? allSubs.map(function (s) {
      var lab = (s.plan === 'max' ? 'Max' : 'Pro') + ' · ' + (s.exp ? s.exp + ' gacha' + (s.exp < today() ? ' (tugagan)' : '') : 'muddatsiz');
      return '<li><span class="pn">' + esc(s.email) + '<br><small class="pp">' + lab + '</small></span>' +
        '<button class="btn alt" data-act="extend" data-email="' + esc(s.email) + '">+30 kun</button>' +
        '<button class="del" data-act="revoke" data-email="' + esc(s.email) + '" aria-label="Obunani olib tashlash">&times;</button></li>';
    }).join('') : '<li><span class="pp">Hali hech kimga obuna berilmagan</span></li>';
  }
  function renderAuth(cur) {
    var st;
    if (fbOn) {
      if (!user) st = 'Pro yoki Max olgan bo’lsangiz, Gmail bilan kiring: tarifingiz avtomatik ochiladi.';
      else if (owner) st = 'Egasi: ' + user.email + '. Hozir ' + PNAME[cur] + ' ko’rinishi yoqilgan.';
      else if (subLevel()) st = 'Kirdingiz: ' + user.email + '. Tarif: ' + PNAME[cur] + (sub.exp ? ', ' + sub.exp + ' gacha' : ', muddatsiz') + '.';
      else if (sub && sub.plan && sub.exp && sub.exp < today()) st = 'Kirdingiz: ' + user.email + '. Obuna muddati ' + sub.exp + ' kuni tugagan. Yangilash uchun Telegramga yozing.';
      else st = 'Kirdingiz: ' + user.email + '. Tarif: Bepul. Pro yoki Max olish uchun Telegramga yozing va shu Gmail manzilingizni yuboring.';
    } else if (owner) st = 'Egasi rejimi (faqat shu qurilmada): hozir ' + PNAME[cur] + ' ko’rinishi yoqilgan.';
    else st = 'Gmail bilan kirish hali ulanmagan: script.js boshidagi sozlamalar to’ldirilmagan.';
    $('authStatus').textContent = st;
    $('signInBtn').hidden = !fbOn || !!user;
    $('signOutBtn').hidden = !fbOn || !user;
    var tg = tgName();
    $('tgLink').hidden = owner || !tg;
    if (tg) $('tgLink').href = 'https://t.me/' + tg;
    $('ownerLogin').hidden = owner || fbOn;
    $('ownOut').hidden = fbOn;
    $('grantBox').hidden = !fbOn;
  }
  function has(n) { return lvl() >= n; }
  function lock(n, what) {
    return '<div class="lock"><div><b>' + PNAME[n] + '</b> tarifda ochiladi<span>' + what + '</span></div><button class="btn alt" data-act="plans">Tariflar</button></div>';
  }
  function loadLocal() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS) === 0) days[k.slice(LS.length)] = JSON.parse(localStorage.getItem(k)) || [];
      }
      var s = localStorage.getItem(LSS);
      if (s) settings = normSettings(JSON.parse(s)); else settings.plan = 'free';
    } catch (e) {}
  }

  function connect() {
    if (!(window.claude && window.claude.use)) { loadLocal(); setStatus('Hisobot shu brauzerda saqlanadi.'); render(); return; }
    window.claude.use('downloads').then(function (d) { dl = d; render(); }, function () {});
    window.claude.use('user').then(function (u) {
      if (!u) return;
      Promise.resolve(u.isOwner()).then(function (o) { owner = !!o; render(); });
    }, function () {});
    window.claude.use('db').then(function (d) {
      if (!d) { db = null; loadLocal(); setStatus('Hisobot shu brauzerda saqlanadi.'); render(); return; }
      db = d;
      var timer = setTimeout(function () { setStatus('Ma’lumotlarga hozircha ulanib bo’lmadi. Ko’rsatilgani eskirgan bo’lishi mumkin.'); }, 10000);
      var fail = function () { clearTimeout(timer); setStatus('Saqlash bilan aloqa uzildi. Sahifani qayta oching.'); };
      db.collection('days').where('date', '>=', shift(today(), -60)).onSnapshot(function (snap) {
        var m = {};
        snap.docs.forEach(function (doc) {
          var v = doc.data() || {};
          m[doc.id] = Array.isArray(v.entries) ? v.entries : [];
        });
        days = m;
        if (!snap.metadata.fromCache) { clearTimeout(timer); setStatus(''); }
        render();
      }, fail);
      db.doc('settings/main').onSnapshot(function (snap) {
        settings = normSettings(snap.exists ? snap.data() : null);
        render();
      }, function () {});
    }, function () { db = null; loadLocal(); setStatus('Hisobot shu brauzerda saqlanadi.'); render(); });
  }

  /* actions */
  function addEntry(kind, amountOverride, noteOverride) {
    var isMoney = kind === 'sale' || kind === 'ret';
    var amount = amountOverride != null ? amountOverride : (isMoney ? digits($('amount').value) : 0);
    var note = (noteOverride != null ? noteOverride : $('note').value).trim();
    var ts = selected === today() ? Date.now() : parse(selected).getTime() + 12 * 3600 * 1000;
    var entry = { id: rid(), kind: kind, amount: amount, ts: ts };
    if (note) entry.note = note;
    save(selected, entriesOf(selected).concat([entry]));
    if (amountOverride == null && isMoney) $('amount').value = '';
    if (noteOverride == null) $('note').value = '';
  }
  function removeEntry(id) {
    var list = entriesOf(selected), idx = -1;
    list.forEach(function (e, i) { if (e.id === id) idx = i; });
    if (idx < 0) return;
    lastRemoved = { date: selected, entry: list[idx], index: idx };
    save(selected, list.slice(0, idx).concat(list.slice(idx + 1)));
    toast('Yozuv o’chirildi', 'Qaytarish', 'undo', 6000);
  }
  function undo() {
    if (!lastRemoved) return;
    var r = lastRemoved; lastRemoved = null;
    var list = entriesOf(r.date).slice();
    list.splice(Math.min(r.index, list.length), 0, r.entry);
    save(r.date, list);
    $('toast').hidden = true;
  }
  function toggleDone(id) {
    save(selected, entriesOf(selected).map(function (e) {
      if (e.id !== id) return e;
      var c = {}; Object.keys(e).forEach(function (k) { c[k] = e[k]; });
      c.done = !e.done; return c;
    }));
  }
  function clearExamples() {
    Object.keys(days).forEach(function (d) {
      var l = days[d], n = l.filter(function (e) { return !e.example; });
      if (n.length !== l.length) save(d, n);
    });
    settings.products = settings.products.filter(function (p) { return !p.example; });
    saveSettings();
    toast('Namunalar tozalandi', null, null, 2500);
  }
  function addProduct() {
    var name = $('pname').value.trim(), price = digits($('pprice').value);
    if (!name || !price) { toast('Nomi va narxini kiriting', null, null, 2500); return; }
    settings.products = settings.products.concat([{ id: rid(), name: name, price: price }]);
    $('pname').value = ''; $('pprice').value = '';
    saveSettings();
  }
  function delProduct(id) {
    settings.products = settings.products.filter(function (p) { return p.id !== id; });
    saveSettings();
  }

  function toast(msg, btnLabel, act, ms) {
    var el = $('toast');
    el.innerHTML = '';
    var s = document.createElement('span'); s.textContent = msg; el.appendChild(s);
    if (btnLabel) { var b = document.createElement('button'); b.textContent = btnLabel; b.setAttribute('data-act', act); el.appendChild(b); }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 2500);
  }

  function reportText() {
    var s = stats(entriesOf(selected));
    var L = ['Kunlik hisobot — ' + dots(selected), ''];
    L.push('Sotildi: ' + s.sale + ' ta' + (s.saleSum ? ' (' + money(s.saleSum) + ')' : ''));
    L.push('Qaytdi: ' + s.ret + ' ta' + (s.retSum ? ' (' + money(s.retSum) + ')' : ''));
    if (s.hasMoney) L.push('Sof tushum: ' + money(s.net));
    if (has(2) && settings.goal && s.hasMoney) L.push('Reja: ' + Math.round((s.net / settings.goal) * 100) + '% (' + money(settings.goal) + ')');
    L.push('');
    L.push('Qo’ng’iroqlar: jami ' + s.calls);
    L.push('Javob berildi: ' + s.ans);
    L.push('Javobsiz: ' + s.miss + (s.miss ? ' (qayta qo’ng’iroq qilinmagan: ' + s.pending + ')' : ''));
    if (s.rate !== null) L.push('Javob berish darajasi: ' + s.rate + '%');
    return L.join('\n');
  }
  function copyReport() {
    var text = reportText();
    var ok = function () { toast('Hisobot nusxalandi', null, null, 2200); };
    var fb = function () {
      try {
        var r = document.createRange(); r.selectNodeContents($('report'));
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        toast('Matn belgilandi, nusxalang', null, null, 3000);
      } catch (e) {}
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fb); else fb();
  }
  function q(v) { v = String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv() {
    if (!dl) return;
    var rows = [['Sana', 'Vaqt', 'Turi', 'Summa', 'Izoh']];
    Object.keys(days).sort().forEach(function (d) {
      days[d].slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (e) {
        rows.push([d, hhmm(e.ts), KINDS[e.kind], e.amount || 0, e.note || '']);
      });
    });
    if (rows.length === 1) { toast('Yuklab olish uchun yozuv yo’q', null, null, 2500); return; }
    var data = '﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n');
    dl.save({ filename: 'hisobot-' + today() + '.csv', data: data }).then(function () {
      toast('Fayl saqlandi', null, null, 2200);
    }, function (e) {
      if (e && e.code === 'declined') return;
      toast('Faylni saqlab bo’lmadi', null, null, 2500);
    });
  }

  /* charts */
  function hourChart(list) {
    if (!list.length) return '<div class="empty">Yozuv qo’shilgach, soatlar bo’yicha grafik shu yerda chiqadi.</div>';
    var by = {}, lo = 8, hi = 20, maxTot = 1;
    list.forEach(function (e) {
      var h = new Date(e.ts).getHours();
      var b = by[h] || (by[h] = { sale: 0, ret: 0, call: 0 });
      if (e.kind === 'sale') b.sale++; else if (e.kind === 'ret') b.ret++; else b.call++;
      if (h < lo) lo = h; if (h > hi) hi = h;
    });
    Object.keys(by).forEach(function (h) { var t = by[h].sale + by[h].ret + by[h].call; if (t > maxTot) maxTot = t; });
    var W = 340, H = 150, pl = 24, pr = 4, pt = 10, pb = 22;
    var n = hi - lo + 1, slot = (W - pl - pr) / n, bw = Math.min(slot * 0.66, 22);
    var ph = H - pt - pb;
    function y(v) { return pt + ph - (v / maxTot) * ph; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Soatlar bo’yicha yozuvlar soni">';
    var ticks = maxTot >= 4 ? [0, Math.round(maxTot / 2), maxTot] : [0, maxTot];
    ticks.forEach(function (t) {
      s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t) + '" y2="' + y(t) + '"></line>';
      s += '<text class="ax" x="' + (pl - 6) + '" y="' + (y(t) + 3.5) + '" text-anchor="end">' + t + '</text>';
    });
    for (var h = lo; h <= hi; h++) {
      var b = by[h] || { sale: 0, ret: 0, call: 0 };
      var x = pl + (h - lo) * slot + (slot - bw) / 2, base = 0;
      [['sale', 'b-sale'], ['call', 'b-call'], ['ret', 'b-ret']].forEach(function (p) {
        var v = b[p[0]]; if (!v) return;
        var top = y(base + v), hgt = y(base) - top;
        s += '<rect class="' + p[1] + '" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(hgt - 1, 1).toFixed(1) + '" rx="2"></rect>';
        base += v;
      });
      if ((h - lo) % 2 === 0) s += '<text class="ax" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + h + '</text>';
    }
    s += '</svg>';
    return '<div class="card">' + s +
      '<div class="legend"><span><i class="b-sale" style="background:var(--sale)"></i>Sotildi</span><span><i style="background:var(--call)"></i>Qo’ng’iroq</span><span><i style="background:var(--ret)"></i>Qaytdi</span></div></div>';
  }

  function weekChart() {
    var t = today(), vals = [], useMoney = false, maxV = 0, i, ds, st;
    for (i = 6; i >= 0; i--) {
      ds = shift(t, -i); st = stats(entriesOf(ds));
      if (st.hasMoney) useMoney = true;
      vals.push({ ds: ds, st: st });
    }
    vals.forEach(function (v) { v.v = useMoney ? v.st.net : v.st.sale; if (v.v > maxV) maxV = v.v; });
    $('weekHint').textContent = useMoney ? 'sof tushum' : 'sotuvlar soni';
    var any = vals.some(function (v) { return v.st.sale || v.st.ret || v.st.calls; });
    if (!any) return '<div class="empty">Kunlar bo’yicha taqqoslash uchun hozircha yozuv yo’q.</div>';
    if (maxV <= 0) maxV = 1;
    var W = 340, H = 150, pt = 18, pb = 22, pl = 6, pr = 6;
    var slot = (W - pl - pr) / 7, bw = Math.min(slot * 0.62, 34), ph = H - pt - pb;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="So’nggi 7 kun">';
    s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (pt + ph) + '" y2="' + (pt + ph) + '"></line>';
    vals.forEach(function (v, k) {
      var x = pl + k * slot + (slot - bw) / 2;
      var hgt = Math.max((Math.max(v.v, 0) / maxV) * ph, v.v > 0 ? 2 : 0);
      var cls = v.ds === selected ? 'b-net' : 'b-dim';
      s += '<rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + (pt + ph - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="3"></rect>';
      if (v.v > 0) s += '<text class="ax' + (v.ds === selected ? ' axs' : '') + '" x="' + (x + bw / 2).toFixed(1) + '" y="' + (pt + ph - hgt - 4).toFixed(1) + '" text-anchor="middle">' + (useMoney ? short(v.v) : v.v) + '</text>';
      s += '<text class="ax' + (v.ds === selected ? ' axs' : '') + '" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + parse(v.ds).getDate() + '</text>';
    });
    return '<div class="card">' + s + '</svg></div>';
  }

  function weekAnalysis() {
    var t = today(), i, ds, l, st;
    var agg = { sale: 0, ret: 0, ans: 0, miss: 0, net: 0, pending: 0, money: false };
    var hours = {}, items = {}, best = null, worst = null, active = 0;
    for (i = 0; i < 7; i++) {
      ds = shift(t, -i); l = entriesOf(ds); st = stats(l);
      agg.sale += st.sale; agg.ret += st.ret; agg.ans += st.ans; agg.miss += st.miss; agg.net += st.net; agg.pending += st.pending;
      if (st.hasMoney) agg.money = true;
      if (l.length) {
        active++;
        var key = st.hasMoney ? st.net : st.sale, rec = { ds: ds, v: key, money: st.hasMoney };
        if (!best || key > best.v) best = rec;
        if (!worst || key <= worst.v) worst = rec;
      }
      l.forEach(function (e) {
        var h = new Date(e.ts).getHours();
        hours[h] = (hours[h] || 0) + 1;
        if (e.kind === 'sale' && e.note) {
          var k = e.note.trim().toLowerCase();
          var it = items[k] || (items[k] = { name: e.note.trim(), n: 0 });
          it.n++;
        }
      });
    }
    if (!active) return '<div style="color:var(--muted);padding:4px 2px 8px">Oxirgi 7 kunda yozuv yo’q. Yozuvlar paydo bo’lgach, bu yerda haftaning qisqa tahlili chiqadi.</div>';
    var prev = 0;
    for (i = 7; i < 14; i++) prev += stats(entriesOf(shift(t, -i))).net;
    var rows = [];
    function row(k, v, cls) { rows.push('<li><span class="k">' + k + '</span><span class="v num' + (cls ? ' ' + cls : '') + '">' + v + '</span></li>'); }
    function dayName(d) { var x = parse(d); return x.getDate() + '-' + MONTHS[x.getMonth()] + ', ' + WEEK[x.getDay()]; }
    row('Sotuvlar', agg.sale + ' ta' + (agg.money ? ' · ' + money(agg.net) : ''));
    if (agg.money && prev > 0) {
      var ch = Math.round(((agg.net - prev) / prev) * 100);
      row('Oldingi 7 kunga nisbatan', (ch >= 0 ? '+' : '') + ch + '%', ch >= 0 ? 'up' : 'down');
    }
    if (best) row('Eng yaxshi kun', dayName(best.ds) + ' (' + (best.money ? short(best.v) : best.v + ' ta') + ')');
    if (worst && active > 1 && worst.ds !== best.ds) row('Eng sust kun', dayName(worst.ds) + ' (' + (worst.money ? short(worst.v) : worst.v + ' ta') + ')');
    var bh = null, bn = 0;
    Object.keys(hours).forEach(function (h) { if (hours[h] > bn) { bn = hours[h]; bh = +h; } });
    if (bh !== null) row('Eng band soat', pad(bh) + ':00–' + pad((bh + 1) % 24) + ':00 (' + bn + ' yozuv)');
    var top = null;
    Object.keys(items).forEach(function (k) { if (!top || items[k].n > top.n) top = items[k]; });
    if (top) row('Eng ko’p sotilgan', esc(top.name) + ' (' + top.n + ' ta)');
    row('Qaytgan tovar', agg.ret + ' ta' + (agg.sale ? ' (' + Math.round((agg.ret / agg.sale) * 100) + '%)' : ''), agg.sale && agg.ret / agg.sale > 0.15 ? 'down' : '');
    var calls = agg.ans + agg.miss;
    row('Qo’ng’iroqlarga javob', calls ? Math.round((agg.ans / calls) * 100) + '% (' + agg.ans + ' / ' + calls + ')' : '—');
    if (agg.pending) row('Qayta qo’ng’iroq kutmoqda', agg.pending + ' ta', 'down');
    return '<ul class="alist">' + rows.join('') + '</ul>';
  }

  function renderAd() {
    var t = (settings.adTitle || '').trim(), x = (settings.adText || '').trim(), l = (settings.adLink || '').trim();
    var link = /^https:\/\//i.test(l) ? l : '';
    var empty = !t && !x;
    if (!(lvl() === 0 || owner) || (empty && !owner)) { $('adSec').hidden = true; return; }
    $('adSec').hidden = false;
    if (empty) { $('adBox').innerHTML = '<div class="ad-empty">Reklama joyi bo’sh. Sozlamalarda sarlavha, matn va havola kiriting.</div>'; return; }
    $('adBox').innerHTML = '<div class="ad"><div class="ad-tag">Reklama</div>' +
      (t ? '<div class="ad-t">' + esc(t) + '</div>' : '') +
      (x ? '<div class="ad-x">' + esc(x) + '</div>' : '') +
      (link ? '<a class="btn alt" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer sponsored">Batafsil</a>' : '') +
      (lvl() > 0 ? '<div class="ad-n">Buni faqat siz ko’rasiz. Reklama Bepul tarifdagilarga chiqadi.</div>' : '') + '</div>';
  }

  function renderPlans() {
    var cur = lvl();
    document.documentElement.setAttribute('data-plan', PLANS[cur]);
    renderAuth(cur);
    $('planBadge').textContent = PNAME[cur].toUpperCase();
    $('planNow').textContent = 'Sizning tarifingiz: ' + PNAME[cur];
    var feats = [
      ['Sotuv, qaytish va qo’ng’iroqlar hisobi', 'Summa va izoh', 'Kunlik hisobot va nusxalash', '7 kunlik jadval', 'Reklama ko’rsatiladi'],
      ['Bepul tarifdagi hammasi', 'Tez sotuv tugmalari', 'Ko’rsatkichlar: o’rtacha chek, qaytish ulushi', 'Soatlar va 7 kun grafiklari', 'Haftalik tahlil (7 kunlik hisobot)', 'Reklamasiz'],
      ['Pro tarifdagi hammasi', 'Excel (CSV) yuklab olish', 'Kunlik reja va progress', 'Qayta qo’ng’iroq ro’yxati', '30 kunlik tushum']
    ];
    var price = ['0 so’m', money(settings.proPrice) + ' / oy', money(settings.maxPrice) + ' / oy'];
    var tg = String(settings.tg || '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
    $('planCards').innerHTML = [0, 1, 2].map(function (i) {
      var cta = '';
      if (i === cur) cta = '<div class="plan-cur">Joriy tarif</div>';
      else if (i > cur) cta = tg
        ? '<a class="btn" href="https://t.me/' + tg + '" target="_blank" rel="noopener">Telegramda so’rash</a>'
        : '<div class="plan-cur">Obuna uchun egasiga murojaat qiling</div>';
      return '<div class="plan' + (i === cur ? ' on' : '') + '"><div class="plan-n">' + PNAME[i] + '</div><div class="plan-p num">' + price[i] + '</div><ul>' +
        feats[i].map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' + cta + '</div>';
    }).join('');

    $('ownerSet').hidden = !owner;
    if (owner) {
      renderSubs();
      Array.prototype.forEach.call($('planBtns').children, function (b, i) { b.className = 'btn' + (i === cur ? '' : ' alt'); });
      var act = document.activeElement;
      if (act !== $('proIn')) $('proIn').value = fmt(settings.proPrice);
      if (act !== $('maxIn')) $('maxIn').value = fmt(settings.maxPrice);
      if (act !== $('tgIn')) $('tgIn').value = settings.tg || '';
      if (act !== $('adT')) $('adT').value = settings.adTitle || '';
      if (act !== $('adX')) $('adX').value = settings.adText || '';
      if (act !== $('adL')) $('adL').value = settings.adLink || '';
    }
  }

  /* render */
  function render() {
    var t = today(), d = parse(selected), isToday = selected === t;
    $('dayLabel').textContent = d.getDate() + '-' + MONTHS[d.getMonth()];
    $('daySub').textContent = (isToday ? 'Bugun, ' : '') + WEEK[d.getDay()] + ', ' + d.getFullYear();
    $('todayBtn').hidden = isToday;
    $('nextBtn').disabled = selected >= t;
    $('logTitle').textContent = isToday ? 'Bugungi yozuvlar' : 'Shu kunning yozuvlari';
    $('heroK').textContent = isToday ? 'Bugungi sof tushum' : 'Kunning sof tushumi';

    var list = entriesOf(selected), s = stats(list);

    var hasEx = false;
    Object.keys(days).forEach(function (k) { days[k].forEach(function (e) { if (e.example) hasEx = true; }); });
    $('banner').hidden = !hasEx;

    /* hero */
    $('heroVal').innerHTML = fmt(s.net) + '<small>so’m</small>';
    var goal = has(2) ? settings.goal : 0, pct = goal ? Math.round((Math.max(s.net, 0) / goal) * 100) : 0;
    $('heroFill').style.width = Math.min(pct, 100) + '%';
    $('goalBtn').setAttribute('data-act', has(2) ? 'goal' : 'plans');
    if (!has(2)) {
      $('heroPct').textContent = 'Kunlik reja Max tarifda ochiladi';
      $('heroLeft').textContent = '';
      $('goalBtn').textContent = 'Tariflar';
    } else if (goal) {
      $('heroPct').innerHTML = '<b>' + pct + '%</b> rejadan';
      $('heroLeft').innerHTML = s.net >= goal ? 'Reja bajarildi' : 'Yana <b>' + money(goal - Math.max(s.net, 0)) + '</b> kerak';
      $('goalBtn').textContent = 'Reja ' + short(goal);
    } else {
      $('heroPct').textContent = 'Kunlik reja belgilanmagan';
      $('heroLeft').textContent = '';
      $('goalBtn').textContent = 'Reja qo’yish';
    }

    /* chips */
    if (!has(1)) {
      $('chips').innerHTML = lock(1, 'Tez sotuv tugmalari: mahsulotni bir bosishda yozish');
    } else if (settings.products.length) {
      $('chips').innerHTML = settings.products.map(function (p) {
        return '<button class="pchip" data-act="prod" data-id="' + esc(p.id) + '"><span class="pn">' + esc(p.name) + '</span><span class="pp num">' + money(p.price) + '</span></button>';
      }).join('');
    } else {
      $('chips').innerHTML = '<div class="chips-hint">Tez sotiladigan mahsulotlarni <button class="link" data-act="goal">Sozlamalar</button> ichida qo’shing, bir bosishda sotuv yoziladi.</div>';
    }

    /* tiles */
    var subs = {
      sale: s.saleSum ? money(s.saleSum) : (s.sale ? 'summa kiritilmagan' : ''),
      ret: s.retSum ? money(s.retSum) : (s.ret ? 'summa kiritilmagan' : ''),
      ans: s.rate !== null ? s.rate + '% javob' : '',
      miss: s.pending ? s.pending + ' ta qayta qo’ng’iroq kutmoqda' : (s.miss ? 'hammasiga qaytarildi' : '')
    };
    $('tiles').innerHTML = ORDER.map(function (k) {
      return '<button class="tile ' + k + '" data-act="add" data-kind="' + k + '"><span class="t-plus" aria-hidden="true">+</span>' +
        '<span class="t-label">' + KINDS[k] + '</span><span class="t-count num">' + s[k] + '</span><span class="t-sub">' + subs[k] + '</span></button>';
    }).join('');

    /* insights */
    $('insights').innerHTML = !has(1) ? lock(1, 'O’rtacha chek, qaytish ulushi, eng band soat') :
      ins('O’rtacha chek', s.avg !== null ? money(s.avg) : '—', s.paid ? s.paid + ' ta summali sotuv' : '') +
      ins('Qaytish ulushi', s.retShare !== null ? s.retShare + '%' : '—', s.sale ? s.ret + ' / ' + s.sale + ' ta' : '') +
      ins('Javob berish', s.rate !== null ? s.rate + '%' : '—', s.calls ? s.calls + ' ta qo’ng’iroqdan' : '') +
      ins('Eng band soat', s.busy !== null ? pad(s.busy) + ':00–' + pad((s.busy + 1) % 24) + ':00' : '—', '');
    function ins(k, v, n) { return '<div class="ins"><div class="k">' + k + '</div><div class="v num">' + v + '</div>' + (n ? '<div class="n">' + n + '</div>' : '') + '</div>'; }

    /* callbacks */
    var missed = list.filter(function (e) { return e.kind === 'miss'; });
    $('cbSec').hidden = !missed.length;
    $('cbHint').textContent = !has(2) ? '' : missed.length ? (s.pending ? s.pending + ' ta kutmoqda' : 'hammasi bajarildi') : '';
    $('cbList').innerHTML = !has(2) ? '<li class="cbrow" style="padding:10px">' + lock(2, 'Javobsiz qo’ng’iroqlarni qayta qo’ng’iroq ro’yxatida yuritish') + '</li>' : missed.map(function (e) {
      return '<li class="cbrow"><button class="cb' + (e.done ? ' done' : '') + '" data-act="done" data-id="' + esc(e.id) + '"><span class="box">' + (e.done ? '✓' : '') + '</span>' +
        '<span class="txt num">' + (dstr(new Date(e.ts)) === selected ? hhmm(e.ts) + ' · ' : '') + (e.note ? esc(e.note) : 'Raqam kiritilmagan') + '</span></button></li>';
    }).join('');

    /* charts */
    $('hourChart').innerHTML = has(1) ? hourChart(list) : lock(1, 'Soatlar bo’yicha yozuvlar grafigi');
    if (has(1)) { $('weekChart').innerHTML = weekChart(); } else { $('weekChart').innerHTML = lock(1, 'So’nggi 7 kunning tushum grafigi'); $('weekHint').textContent = ''; }
    $('weekAnalysis').innerHTML = has(1) ? weekAnalysis() : lock(1, 'Oxirgi 7 kunlik hisobot: eng yaxshi kun, eng band soat, eng ko’p sotilgan mahsulot');

    /* log */
    $('logHint').textContent = list.length ? list.length + ' ta' : '';
    if (!list.length) {
      $('log').innerHTML = '<div class="empty">Hali yozuv yo’q. Rangli katakdan birini bosing, har bosish bitta yozuv qo’shadi. Summa va izohni avval kiriting.</div>';
    } else {
      $('log').innerHTML = '<ul class="list">' + list.slice().reverse().map(function (e) {
        var showTime = dstr(new Date(e.ts)) === selected;
        return '<li><span class="time num">' + (showTime ? hhmm(e.ts) : '') + '</span><span class="pill ' + e.kind + '">' + KINDS[e.kind] + '</span>' +
          '<span class="who"><span class="amt num">' + (e.amount ? money(e.amount) : '') + '</span>' + (e.note ? '<span class="note">' + esc(e.note) + '</span>' : '') + '</span>' +
          '<button class="del" data-act="del" data-id="' + esc(e.id) + '" aria-label="Yozuvni o’chirish">&times;</button></li>';
      }).join('') + '</ul>';
    }

    $('report').textContent = reportText();
    $('csvBtn').hidden = !dl;
    $('csvBtn').setAttribute('data-act', has(2) ? 'csv' : 'plans');
    $('csvBtn').textContent = has(2) ? 'Excel uchun yuklab olish' : 'Excel yuklab olish (Max tarifda)';

    /* history */
    var rows = '<div class="hrow head"><span>Sana</span><span>Sotildi</span><span>Qaytdi</span><span>Javob</span><span>Javobsiz</span></div>';
    var cell = function (n) { return '<span class="' + (n ? '' : 'zero') + '">' + n + '</span>'; };
    for (var i = 0; i < 7; i++) {
      var ds = shift(t, -i), hs = stats(entriesOf(ds)), dd = parse(ds);
      var lab = i === 0 ? 'Bugun' : dd.getDate() + '-' + MONTHS[dd.getMonth()].slice(0, 3);
      rows += '<button class="hrow' + (ds === selected ? ' on' : '') + '" data-act="pick" data-date="' + ds + '"><span>' + lab + '</span>' + cell(hs.sale) + cell(hs.ret) + cell(hs.ans) + cell(hs.miss) + '</button>';
    }
    $('hist').innerHTML = rows;

    var n7 = 0, n30 = 0;
    for (var j = 0; j < 30; j++) { var nn = stats(entriesOf(shift(t, -j))).net; n30 += nn; if (j < 7) n7 += nn; }
    $('sums').innerHTML = ins('7 kunlik sof tushum', money(n7), '') + ins('30 kunlik sof tushum', has(2) ? money(n30) : 'Max tarifda', '');

    /* settings list */
    $('plist').innerHTML = settings.products.length ? settings.products.map(function (p) {
      return '<li><span class="pn">' + esc(p.name) + '</span><span class="pp num">' + money(p.price) + '</span><button class="del" data-act="delprod" data-id="' + esc(p.id) + '" aria-label="Mahsulotni o’chirish">&times;</button></li>';
    }).join('') : '<li><span class="pp">Hali mahsulot yo’q.</span></li>';
    renderPlans();
    renderAd();
  }

  /* events */
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if (act === 'add') addEntry(el.getAttribute('data-kind'));
    else if (act === 'prod') {
      var p = settings.products.filter(function (x) { return x.id === id; })[0];
      if (p) addEntry('sale', p.price, p.name);
    }
    else if (act === 'del') removeEntry(id);
    else if (act === 'undo') undo();
    else if (act === 'done') toggleDone(id);
    else if (act === 'prev') { selected = shift(selected, -1); render(); }
    else if (act === 'next') { if (selected < today()) { selected = shift(selected, 1); render(); } }
    else if (act === 'today') { selected = today(); render(); }
    else if (act === 'pick') { selected = el.getAttribute('data-date'); render(); window.scrollTo(0, 0); }
    else if (act === 'copy') copyReport();
    else if (act === 'csv') { if (has(2)) exportCsv(); }
    else if (act === 'savead') {
      if (!owner) return;
      var lnk = $('adL').value.trim();
      if (lnk && !/^https:\/\//i.test(lnk)) { toast('Havola https:// bilan boshlansin', null, null, 2800); return; }
      settings.adTitle = $('adT').value.trim().slice(0, 60);
      settings.adText = $('adX').value.trim().slice(0, 160);
      settings.adLink = lnk;
      saveSettings();
      toast('Reklama saqlandi', null, null, 2000);
    }
    else if (act === 'plans') { $('plans').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (act === 'setplan') {
      if (!owner) return;
      ownerPlan = Math.max(0, PLANS.indexOf(el.getAttribute('data-plan')));
      lsSet(OWN_PLAN_KEY, String(ownerPlan));
      render();
      toast('Ko’rinish: ' + PNAME[lvl()], null, null, 2000);
    }
    else if (act === 'signin') signIn();
    else if (act === 'signout') { if (auth) auth.signOut(); }
    else if (act === 'ownlogin') ownerLogin();
    else if (act === 'ownlogout') { owner = false; lsDel(OWN_KEY); render(); toast('Egasi rejimidan chiqildi', null, null, 2200); }
    else if (act === 'grantpro') grant('pro');
    else if (act === 'grantmax') grant('max');
    else if (act === 'extend') extendSub(el.getAttribute('data-email'));
    else if (act === 'revoke') revokeSub(el.getAttribute('data-email'));
    else if (act === 'saveprices') {
      if (!owner) return;
      settings.proPrice = digits($('proIn').value) || settings.proPrice;
      settings.maxPrice = digits($('maxIn').value) || settings.maxPrice;
      settings.tg = $('tgIn').value.trim();
      saveSettings();
      toast('Saqlandi', null, null, 2000);
    }
    else if (act === 'clearex') clearExamples();
    else if (act === 'goal') {
      $('settings').open = true;
      $('goalIn').value = settings.goal ? fmt(settings.goal) : '';
      $('settings').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('goalIn').focus();
    }
    else if (act === 'savegoal') { settings.goal = digits($('goalIn').value); saveSettings(); toast('Reja saqlandi', null, null, 2000); }
    else if (act === 'addprod') addProduct();
    else if (act === 'delprod') delProduct(id);
  });

  function moneyInput(el) {
    el.addEventListener('input', function () {
      var dg = this.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      this.value = dg ? fmt(parseInt(dg, 10)) : '';
    });
  }
  moneyInput($('amount')); moneyInput($('goalIn')); moneyInput($('pprice')); moneyInput($('proIn')); moneyInput($('maxIn'));

  $('ownPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') ownerLogin(); });

  initAuth();
  render();
  connect();
})();
