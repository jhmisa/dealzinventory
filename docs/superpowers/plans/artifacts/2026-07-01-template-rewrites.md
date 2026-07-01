# Canned Response Rewrites — Review Table (Phase 0)

**Status:** AWAITING JOEY'S APPROVAL. Nothing is written to the DB until approved.
**Rules applied:** refine Taglish EN (tone/grammar/emoji/`po`, clearer CTAs, consistent greeting + sign-off); keep every fact/link/price/blank + `{{order_code}}`; rewrite JA as proper polite Japanese (keigo). No new `{{variables}}` introduced (deferred — see plan Task 0.5).
**Legend:** `ai_usage` = how the AI may use it · specialist = which playbook it's filed under.

---

### 1. Acctg: Payment Confirmation   [ai_usage: AUTO] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> Good news po! ✅ Na-confirm na ng aming Accounting department ang inyong payment para sa Order {{order_code}}. Maraming salamat po sa inyong pagtitiwala! 😄

**Proposed JA:**
> ご入金を確認いたしました。✅ ご注文番号 {{order_code}} のお支払いが弊社経理部にて確認できましたのでご連絡申し上げます。この度はご利用いただき誠にありがとうございます。😄

**Notes:** Kept `{{order_code}}`. Warmer opener + sign-off; JA now real keigo.

---

### 2. Acctg: PayPal Payment   [ai_usage: DRAFT] [specialist: order_tracking] [photos: 1]
**Proposed EN:**
> Para po mabayaran ang inyong order gamit ang PayPal, i-click lang po ang link na ito:
> 👉 https://www.paypal.com/ncp/payment/7H9LSXV87XQSE
> Ito po ang instructions para sa pagbabayad via PayPal. Pagkatapos po magbayad, paki-send na lang po sa amin ang screenshot ng confirmation.
> Maraming salamat po! 🙂

**Proposed JA:**
> PayPal でのお支払いは、以下のリンクよりお願いいたします。
> 👉 https://www.paypal.com/ncp/payment/7H9LSXV87XQSE
> こちらが PayPal でのお支払い手順です。お支払い完了後、確認画面のスクリーンショットをお送りくださいませ。
> どうぞよろしくお願いいたします。🙂

**Notes:** PayPal URL preserved exactly. DRAFT (AI proposes, human approves before a payment link goes out).

---

### 3. Acctg: SmartPit Payment   [ai_usage: REFERENCE] [specialist: order_tracking] [photos: 1]
**Proposed EN:**
> Ito po ang SmartPit details para sa inyong bayad:
> SmartPit Number:
> Amount: ¥
> Pagkatapos po magbayad, paki-send na lang po sa amin ang resibo.
> Maraming salamat po! 🙂

**Proposed JA:**
> SmartPit でのお支払いに必要な情報は以下の通りです。
> SmartPit番号：
> 金額：¥
> お支払い後、領収書（レシート）をお送りくださいませ。
> どうぞよろしくお願いいたします。🙂

**Notes:** Blanks (`SmartPit Number:` / `Amount: ¥`) preserved → REFERENCE so the AI never auto-sends a half-filled payment message.

---

### 4. After: Feedback   [ai_usage: AUTO] [specialist: aftersales] [photos: 0]
**Proposed EN:**
> Maraming salamat po sa inyong tiwala! 🙏 Malaking tulong po sa amin kung makakapag-iwan kayo ng maikling review sa aming Facebook page.
> Nakakatulong po ito para magkaroon ng kumpiyansa ang ibang customers na safe at legit bumili sa Dealz. Bilang isang small business, napakahalaga po sa amin ng bawat review. 😊
> 👉 https://www.facebook.com/dealzjp
> Salamat po! 🙇

**Proposed JA:**
> この度はご利用いただき誠にありがとうございます。🙏 よろしければ、弊社 Facebook ページに短いレビューをいただけますと大変励みになります。
> お客様のレビューは、Dealz で安心してお買い物いただけることを他のお客様にお伝えする大きな支えとなります。小さな会社ですので、一つひとつのレビューが本当に貴重です。😊
> 👉 https://www.facebook.com/dealzjp
> よろしくお願いいたします。🙇

**Notes:** FB link preserved.

---

### 5. Concern: Redelivery   [ai_usage: AUTO] [specialist: order_tracking] [photos: 1]
**Proposed EN:**
> May attempted delivery po ang inyong order {{order_code}} ngunit hindi ito na-receive. 🚚
> Paki-check po ang inyong mailbox para sa Attempted Delivery Notice, at sundin po ang mga hakbang sa ibaba para mag-request ng redelivery. Maraming salamat po!

**Proposed JA:**
> ご注文番号 {{order_code}} のお荷物について配達にお伺いしましたが、お受け取りいただけませんでした。🚚
> 郵便受けに「ご不在連絡票（Attempted Delivery Notice）」が入っておりますのでご確認いただき、下記の手順にて再配達をご依頼くださいませ。よろしくお願いいたします。

**Notes:** Kept `{{order_code}}`; steps live in the attached photo.

---

### 6. Concern: Warehouse Address   [ai_usage: AUTO] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> Paki-send po sa aming warehouse ang inyong unit. 📦 Ito po ang aming shipping details:
> 📍 Name: Dealz K.K.
> 📍 Address: 121-0011 Tokyo-to Adachi-ku Chuohoncho 3-5-3 TF Biru B1F
> 📍 Japanese: 121-0011 東京都足立区中央本町 3-5-3 TF ビル B1F
> Pagkatapos po ninyong maipadala, paki-send na lang po dito ang shipping label. Maraming salamat po!

**Proposed JA:**
> お手数ですが、弊社倉庫まで商品をお送りくださいませ。📦 送付先は以下の通りです。
> 📍 宛名：Dealz K.K.
> 📍 住所：〒121-0011 東京都足立区中央本町 3-5-3 TFビル B1F
> 発送後、送り状（伝票）の控えをこちらにお送りくださいませ。よろしくお願いいたします。

**Notes:** Address preserved exactly (EN + JA).

---

### 7. Info: Basic Greeting   [ai_usage: AUTO] [specialist: sales] [photos: 0]
**Proposed EN:**
> Ito po ang ilang mahahalagang detalye para sa inyo:
> 📦 Shipping Fee: ¥1,000 lang po (except sa Island)
> 🚚 Delivery: 1 to 3 days depende sa inyong location
> 💳 Payment Options — pwede po kayong pumili sa mga sumusunod:
> 💴 Cash on Delivery
> 🪙 Credit Card on Delivery (+4%)
> 🛒 Konbini (Lawson / FamilyMart / Ministop)

**Proposed JA:**
> 主なご案内は以下の通りです。
> 📦 送料：¥1,000 のみ（離島を除く）
> 🚚 配送：お住まいの地域により1〜3日
> 💳 お支払い方法 — 以下からお選びいただけます：
> 💴 代金引換
> 🪙 クレジットカード（配達時・手数料 +4%）
> 🛒 コンビニ払い（ローソン／ファミリーマート／ミニストップ）

**Notes:** All prices/options preserved. (Overlaps KB → Phase 3 will trim the KB copy.)

---

### 8. Info: Express Service   [ai_usage: AUTO] [specialist: sales] [photos: 1]
**Proposed EN:**
> 📦 Express Shipping to the Philippines 🇵🇭
> 🏠 Door-to-door delivery — kami na po ang magdadala ng package diretso sa bahay ng inyong loved ones! 💝
> 📍 Para sa far/remote areas, sa pinakamalapit na LBC branch o warehouse na lang po i-pickup.
> 📱 Max 2 gadgets per order.
> ✅ All-inclusive rates — wala na pong babayaran ang receiver sa Pinas!
> ⏱️ Magsisimula po ang delivery count pagkatapos ma-confirm ang payment.

**Proposed JA:**
> 📦 フィリピン向けエクスプレス配送 🇵🇭
> 🏠 ドアツードア配送 — 大切なご家族のご自宅まで、弊社が直接お届けいたします！💝
> 📍 遠隔地の場合は、最寄りの LBC 支店または倉庫でのお受け取りとなります。
> 📱 1回のご注文につき最大2台まで。
> ✅ 料金はすべて込み — フィリピン側の受取人様に追加のお支払いは一切ございません！
> ⏱️ 配送日数のカウントは、お支払い確認後より開始いたします。

**Notes:** All rules preserved.

---

### 9. Info: Probing   [ai_usage: AUTO] [specialist: sales] [photos: 0]
**Proposed EN:**
> Marami po tayong available na gadget! Para po mas matulungan namin kayo, hihingi lang po kami ng kaunting detalye:
> 1️⃣ Magkano po ang inyong budget?
> 2️⃣ May specific na brand po ba kayong hinahanap?
> Pagkasagot po ninyo, agad naming ipadadala ang mga available units na bagay sa inyo. 🤩

**Proposed JA:**
> 多数の商品をご用意しております！より的確にご案内するため、いくつかお伺いさせてください。
> 1️⃣ ご予算はどのくらいでしょうか？
> 2️⃣ ご希望のブランドはございますか？
> ご回答いただき次第、お客様に合った在庫商品をすぐにお送りいたします。🤩

**Notes:** —

---

### 10. Info: Ranking and Warranty   [ai_usage: AUTO] [specialist: sales] [photos: 1]
**Proposed EN:**
> Ito po ang ranking, description, at warranty information ng aming mga gadget. 📝

**Proposed JA:**
> 弊社商品のランク（状態）・説明・保証に関する情報は以下の通りです。📝

**Notes:** Detail lives in the attached photo.

---

### 11. Lost   [ai_usage: AUTO] [specialist: aftersales] [photos: 0]
**Proposed EN:**
> Dahil po hindi namin natanggap ang inyong reply, isasara na po muna namin ang usapan sa ngayon.
> Huwag po kayong mag-atubiling mag-message ulit anumang oras. Maraming salamat po! 🙇

**Proposed JA:**
> ご返信をいただけませんでしたので、こちらのやり取りは一旦クローズさせていただきます。
> またいつでもお気軽にご連絡くださいませ。ありがとうございました。🙇

**Notes:** —

---

### 12. Office Location   [ai_usage: AUTO] [specialist: generalist] [photos: 0]
**Proposed EN:**
> 📍 PAANO PUMUNTA SA OFFICE
> Tokyo-to, Adachi-ku, Chuohoncho 3-5-3, TF Biru 1F
> 東京都足立区中央本町3-5-3 TFビル1F
> 🗺️ Google Maps: https://www.google.com/maps/search/?api=1&query=東京都足立区中央本町3-5-3
> 🚆 Nearest Station: Gotanno Station (五反野駅) — Tobu Skytree Line / Tobu Isesaki Line
> 🚶 ~780m (mga 10–12 minuto lakad)
> Alternative: Umejima Station (梅島駅) — Tobu Skytree Line din, ~800m (~11 min lakad)
> 🚌 Bus (optional): Malapit lang po ang station (10 min lakad), pero kung gusto po ninyong mag-bus, pwede pong bumaba sa Adachi-kuyakusho (足立区役所) bus stop — ~370m na lang lakad papuntang office.
> 💬 Reminder: Paki-message po muna kami bago pumunta para sigurado pong may tao sa office. Salamat po! 🙏

**Proposed JA:**
> 📍 オフィスへのアクセス
> 〒121-0011 東京都足立区中央本町3-5-3 TFビル1F
> 🗺️ Googleマップ：https://www.google.com/maps/search/?api=1&query=東京都足立区中央本町3-5-3
> 🚆 最寄駅：五反野駅（東武スカイツリーライン／東武伊勢崎線）
> 🚶 徒歩約780m（10〜12分ほど）
> 別ルート：梅島駅（東武スカイツリーライン）約800m（徒歩約11分）
> 🚌 バス（任意）：駅から徒歩10分ほどですが、バスをご利用の場合は「足立区役所」バス停で下車いただくと、オフィスまで約370mです。
> 💬 ご注意：ご来社の前に、スタッフの在席確認のため事前にメッセージをお送りくださいませ。よろしくお願いいたします。🙏

**Notes:** All station/map/bus details + link preserved.

---

### 13. Order: How to Checkout   [ai_usage: AUTO] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> Madali at convenient lang po ang pag-checkout gamit ang aming order link. 🤗 Para po matulungan kayo, gumawa po kami ng tutorial video. 🎬 Panoorin lang po ang gabay dito:
> 👉 https://www.facebook.com/share/v/1Cr76PLTLA/
> Kung may iba pa po kaming maitutulong sa checkout process, sabihin lang po sa amin!

**Proposed JA:**
> 注文リンクを使えば、チェックアウトは簡単・便利です。🤗 お手続きのご参考に、チュートリアル動画をご用意しました。🎬 こちらのガイドをご覧くださいませ。
> 👉 https://www.facebook.com/share/v/1Cr76PLTLA/
> チェックアウトについて他にご不明な点がございましたら、お気軽にお知らせくださいませ。

**Notes:** Video link preserved.

---

### 14. Order: Japan Invoice   [ai_usage: REFERENCE] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> Natanggap na po namin ang inyong Japan order. 🥰
> Ito po ang inyong order details. 👇
>
> ✅ Paki-double check po kung tama ang lahat.
> Maraming salamat po sa pag-order! 😄

**Proposed JA:**
> ご注文（日本国内）を承りました。🥰
> ご注文内容は以下の通りです。👇
>
> ✅ 内容にお間違いがないかご確認くださいませ。
> ご注文いただき誠にありがとうございます！😄

**Notes:** Blank order-details block preserved → REFERENCE (human pastes the invoice).

---

### 15. Order: Manual Process   [ai_usage: REFERENCE] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> I-process na po natin ang inyong order! 🎉 Paki-send lang po ang inyong mga detalye:
> 1️⃣ Name:
> 2️⃣ Phone Number:
> 3️⃣ Email Address:
> 4️⃣ Complete Address:
> Pakisagutan din po ang inyong preferred na:
> 📅 Delivery Date:
> 🕒 Delivery Time: 9AM–12PM / 2PM–4PM / 4PM–6PM / 6PM–8PM / 7PM–9PM

**Proposed JA:**
> ご注文の手続きを進めさせていただきます！🎉 お手数ですが、以下の情報をお送りくださいませ。
> 1️⃣ お名前：
> 2️⃣ 電話番号：
> 3️⃣ メールアドレス：
> 4️⃣ ご住所（詳細まで）：
> また、ご希望の配送日時もお知らせくださいませ。
> 📅 配達希望日：
> 🕒 配達希望時間：9〜12時／14〜16時／16〜18時／18〜20時／19〜21時

**Notes:** All fields/time slots preserved.

---

### 16. Order: Offer Link   [ai_usage: REFERENCE] [specialist: sales] [photos: 0]
**Proposed EN:**
> Para po ma-checkout ang inyong order, bisitahin lang po ang link na ito:
> 👉
> Paki-order po agad dahil first-come, first-served po ang link. 🛍️
> Maraming salamat po!

**Proposed JA:**
> ご注文のお手続きは、以下のリンクよりお願いいたします。
> 👉
> リンクは先着順となりますので、お早めのご注文をおすすめいたします。🛍️
> よろしくお願いいたします！

**Notes:** Blank link line preserved → REFERENCE (human pastes the offer link).

---

### 17. Order: Philippines Invoice   [ai_usage: REFERENCE] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> Natanggap na po namin ang inyong order. 🥰
> Ito po ang inyong order details. 👇
>
> ✅ Paki-double check po kung tama ang lahat.
> Pakitandaan po na sisimulan lang naming i-process ang inyong order kapag bayad na po ito.
> Maraming salamat po sa pag-order! 😄

**Proposed JA:**
> ご注文を承りました。🥰
> ご注文内容は以下の通りです。👇
>
> ✅ 内容にお間違いがないかご確認くださいませ。
> なお、ご注文の処理はお支払い完了後に開始いたしますので、ご了承くださいませ。
> ご注文いただき誠にありがとうございます！😄

**Notes:** ⚠️ FIXED a likely copy-paste bug — the original PH invoice opened with "Natanggap na po namin ang inyong **Japan** order." Changed to "inyong order" (neutral). Please confirm this is correct.

---

### 18. Order: Special Request   [ai_usage: REFERENCE] [specialist: sales] [photos: 1]
**Proposed EN:**
> Ang unit po na gusto ninyo ay para sa special order request. Ito po ang mga detalye:
> Unit:
> Price:
> Downpayment:
> Sabihin lang po sa amin kung ipapa-restock ninyo ito para maibigay namin ang payment details.
> Pakitandaan po na non-refundable ang downpayment. Kapag na-confirm na po ang order, hindi na po ito maka-cancel o mapapalitan ang unit.

**Proposed JA:**
> ご希望の商品はお取り寄せ注文となります。詳細は以下の通りです。
> 商品：
> 価格：
> 前金（デポジット）：
> お取り寄せをご希望の場合はお知らせくださいませ。お支払い情報をご案内いたします。
> なお、前金は返金不可となります。ご注文確定後のキャンセルや商品の変更はお受けできませんので、ご了承くださいませ。

**Notes:** Blanks + non-refundable terms preserved.

---

### 19. Tracking: LBC   [ai_usage: REFERENCE] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> Dumating na po sa aming courier partner sa Japan ang inyong package for shipment. 📦 Ito po ang mga detalye:
> #️⃣ Tracking Number:
> ✈️ Courier: LBC Express
> 📅 Delivery Date (on or before):
> Pwede po ninyong i-track ang order dito:
> https://www.lbcexpress.com/track/
> Maraming salamat po sa inyong order! 🥰

**Proposed JA:**
> お客様のお荷物が、日本の配送パートナーに到着し発送準備が整いました。📦 詳細は以下の通りです。
> #️⃣ 追跡番号：
> ✈️ 配送業者：LBC Express
> 📅 お届け予定日（〜まで）：
> 以下のリンクよりお荷物を追跡いただけます。
> https://www.lbcexpress.com/track/
> ご注文いただき誠にありがとうございます！🥰

**Notes:** Tracking blanks + LBC link preserved → REFERENCE.

---

### 20. Tracking: Yamato   [ai_usage: REFERENCE] [specialist: order_tracking] [photos: 0]
**Proposed EN:**
> Na-ship out na po namin ang inyong order. 📦🚚 Ito po ang mga detalye: 👇
>
> Maraming salamat po sa inyong order! 🥰

**Proposed JA:**
> ご注文の商品を発送いたしました。📦🚚 詳細は以下の通りです。👇
>
> ご注文いただき誠にありがとうございます！🥰

**Notes:** Blank details block preserved → REFERENCE (human pastes the Yamato tracking).
