-- Improve the 20 canned responses: refined Taglish EN + real Japanese (keigo) JA.
-- Approved by Joey 2026-07-01 (see docs/superpowers/plans/artifacts/2026-07-01-template-rewrites.md).
-- Idempotent: keyed by name. A renamed/deleted template updates 0 rows (no insert).

UPDATE public.messaging_templates SET content_en = $$Good news po! ✅ Na-confirm na ng aming Accounting department ang inyong payment para sa Order {{order_code}}. Maraming salamat po sa inyong pagtitiwala! 😄$$,
content_ja = $$ご入金を確認いたしました。✅ ご注文番号 {{order_code}} のお支払いが弊社経理部にて確認できましたのでご連絡申し上げます。この度はご利用いただき誠にありがとうございます。😄$$,
updated_at = now() WHERE name = 'Acctg: Payment Confirmation';

UPDATE public.messaging_templates SET content_en = $$Para po mabayaran ang inyong order gamit ang PayPal, i-click lang po ang link na ito:

👉 https://www.paypal.com/ncp/payment/7H9LSXV87XQSE

Ito po ang instructions para sa pagbabayad via PayPal. Pagkatapos po magbayad, paki-send na lang po sa amin ang screenshot ng confirmation.

Maraming salamat po! 🙂$$,
content_ja = $$PayPal でのお支払いは、以下のリンクよりお願いいたします。

👉 https://www.paypal.com/ncp/payment/7H9LSXV87XQSE

こちらが PayPal でのお支払い手順です。お支払い完了後、確認画面のスクリーンショットをお送りくださいませ。

どうぞよろしくお願いいたします。🙂$$,
updated_at = now() WHERE name = 'Acctg: PayPal Payment';

UPDATE public.messaging_templates SET content_en = $$Ito po ang SmartPit details para sa inyong bayad:

SmartPit Number:
Amount: ¥

Pagkatapos po magbayad, paki-send na lang po sa amin ang resibo.

Maraming salamat po! 🙂$$,
content_ja = $$SmartPit でのお支払いに必要な情報は以下の通りです。

SmartPit番号：
金額：¥

お支払い後、領収書（レシート）をお送りくださいませ。

どうぞよろしくお願いいたします。🙂$$,
updated_at = now() WHERE name = 'Acctg: SmartPit Payment';

UPDATE public.messaging_templates SET content_en = $$Maraming salamat po sa inyong tiwala! 🙏 Malaking tulong po sa amin kung makakapag-iwan kayo ng maikling review sa aming Facebook page.

Nakakatulong po ito para magkaroon ng kumpiyansa ang ibang customers na safe at legit bumili sa Dealz. Bilang isang small business, napakahalaga po sa amin ng bawat review. 😊

👉 https://www.facebook.com/dealzjp

Salamat po! 🙇$$,
content_ja = $$この度はご利用いただき誠にありがとうございます。🙏 よろしければ、弊社 Facebook ページに短いレビューをいただけますと大変励みになります。

お客様のレビューは、Dealz で安心してお買い物いただけることを他のお客様にお伝えする大きな支えとなります。小さな会社ですので、一つひとつのレビューが本当に貴重です。😊

👉 https://www.facebook.com/dealzjp

よろしくお願いいたします。🙇$$,
updated_at = now() WHERE name = 'After: Feedback';

UPDATE public.messaging_templates SET content_en = $$May attempted delivery po ang inyong order {{order_code}} ngunit hindi ito na-receive. 🚚

Paki-check po ang inyong mailbox para sa Attempted Delivery Notice, at sundin po ang mga hakbang sa ibaba para mag-request ng redelivery. Maraming salamat po!$$,
content_ja = $$ご注文番号 {{order_code}} のお荷物について配達にお伺いしましたが、お受け取りいただけませんでした。🚚

郵便受けに「ご不在連絡票（Attempted Delivery Notice）」が入っておりますのでご確認いただき、下記の手順にて再配達をご依頼くださいませ。よろしくお願いいたします。$$,
updated_at = now() WHERE name = 'Concern: Redelivery';

UPDATE public.messaging_templates SET content_en = $$Paki-send po sa aming warehouse ang inyong unit. 📦 Ito po ang aming shipping details:

📍 Name: Dealz K.K.
📍 Address: 121-0011 Tokyo-to Adachi-ku Chuohoncho 3-5-3 TF Biru B1F
📍 Japanese: 121-0011 東京都足立区中央本町 3-5-3 TF ビル B1F

Pagkatapos po ninyong maipadala, paki-send na lang po dito ang shipping label. Maraming salamat po!$$,
content_ja = $$お手数ですが、弊社倉庫まで商品をお送りくださいませ。📦 送付先は以下の通りです。

📍 宛名：Dealz K.K.
📍 住所：〒121-0011 東京都足立区中央本町 3-5-3 TFビル B1F

発送後、送り状（伝票）の控えをこちらにお送りくださいませ。よろしくお願いいたします。$$,
updated_at = now() WHERE name = 'Concern: Warehouse Address';

UPDATE public.messaging_templates SET content_en = $$Ito po ang ilang mahahalagang detalye para sa inyo:

📦 Shipping Fee: ¥1,000 lang po (except sa Island)
🚚 Delivery: 1 to 3 days depende sa inyong location

💳 Payment Options — pwede po kayong pumili sa mga sumusunod:
💴 Cash on Delivery
🪙 Credit Card on Delivery (+4%)
🛒 Konbini (Lawson / FamilyMart / Ministop)$$,
content_ja = $$主なご案内は以下の通りです。

📦 送料：¥1,000 のみ（離島を除く）
🚚 配送：お住まいの地域により1〜3日

💳 お支払い方法 — 以下からお選びいただけます：
💴 代金引換
🪙 クレジットカード（配達時・手数料 +4%）
🛒 コンビニ払い（ローソン／ファミリーマート／ミニストップ）$$,
updated_at = now() WHERE name = 'Info: Basic Greeting';

UPDATE public.messaging_templates SET content_en = $$📦 Express Shipping to the Philippines 🇵🇭
🏠 Door-to-door delivery — kami na po ang magdadala ng package diretso sa bahay ng inyong loved ones! 💝
📍 Para sa far/remote areas, sa pinakamalapit na LBC branch o warehouse na lang po i-pickup.
📱 Max 2 gadgets per order.
✅ All-inclusive rates — wala na pong babayaran ang receiver sa Pinas!
⏱️ Magsisimula po ang delivery count pagkatapos ma-confirm ang payment.$$,
content_ja = $$📦 フィリピン向けエクスプレス配送 🇵🇭
🏠 ドアツードア配送 — 大切なご家族のご自宅まで、弊社が直接お届けいたします！💝
📍 遠隔地の場合は、最寄りの LBC 支店または倉庫でのお受け取りとなります。
📱 1回のご注文につき最大2台まで。
✅ 料金はすべて込み — フィリピン側の受取人様に追加のお支払いは一切ございません！
⏱️ 配送日数のカウントは、お支払い確認後より開始いたします。$$,
updated_at = now() WHERE name = 'Info: Express Service';

UPDATE public.messaging_templates SET content_en = $$Marami po tayong available na gadget! Para po mas matulungan namin kayo, hihingi lang po kami ng kaunting detalye:

1️⃣ Magkano po ang inyong budget?
2️⃣ May specific na brand po ba kayong hinahanap?

Pagkasagot po ninyo, agad naming ipadadala ang mga available units na bagay sa inyo. 🤩$$,
content_ja = $$多数の商品をご用意しております！より的確にご案内するため、いくつかお伺いさせてください。

1️⃣ ご予算はどのくらいでしょうか？
2️⃣ ご希望のブランドはございますか？

ご回答いただき次第、お客様に合った在庫商品をすぐにお送りいたします。🤩$$,
updated_at = now() WHERE name = 'Info: Probing';

UPDATE public.messaging_templates SET content_en = $$Ito po ang ranking, description, at warranty information ng aming mga gadget. 📝$$,
content_ja = $$弊社商品のランク（状態）・説明・保証に関する情報は以下の通りです。📝$$,
updated_at = now() WHERE name = 'Info: Ranking and Warranty';

UPDATE public.messaging_templates SET content_en = $$Dahil po hindi namin natanggap ang inyong reply, isasara na po muna namin ang usapan sa ngayon.

Huwag po kayong mag-atubiling mag-message ulit anumang oras. Maraming salamat po! 🙇$$,
content_ja = $$ご返信をいただけませんでしたので、こちらのやり取りは一旦クローズさせていただきます。

またいつでもお気軽にご連絡くださいませ。ありがとうございました。🙇$$,
updated_at = now() WHERE name = 'Lost';

UPDATE public.messaging_templates SET content_en = $$📍 PAANO PUMUNTA SA OFFICE
Tokyo-to, Adachi-ku, Chuohoncho 3-5-3, TF Biru 1F
東京都足立区中央本町3-5-3 TFビル1F
🗺️ Google Maps: https://www.google.com/maps/search/?api=1&query=東京都足立区中央本町3-5-3
🚆 Nearest Station: Gotanno Station (五反野駅) — Tobu Skytree Line / Tobu Isesaki Line
🚶 ~780m (mga 10–12 minuto lakad)
Alternative: Umejima Station (梅島駅) — Tobu Skytree Line din, ~800m (~11 min lakad)
🚌 Bus (optional): Malapit lang po ang station (10 min lakad), pero kung gusto po ninyong mag-bus, pwede pong bumaba sa Adachi-kuyakusho (足立区役所) bus stop — ~370m na lang lakad papuntang office.
💬 Reminder: Paki-message po muna kami bago pumunta para sigurado pong may tao sa office. Salamat po! 🙏$$,
content_ja = $$📍 オフィスへのアクセス
〒121-0011 東京都足立区中央本町3-5-3 TFビル1F
🗺️ Googleマップ：https://www.google.com/maps/search/?api=1&query=東京都足立区中央本町3-5-3
🚆 最寄駅：五反野駅（東武スカイツリーライン／東武伊勢崎線）
🚶 徒歩約780m（10〜12分ほど）
別ルート：梅島駅（東武スカイツリーライン）約800m（徒歩約11分）
🚌 バス（任意）：駅から徒歩10分ほどですが、バスをご利用の場合は「足立区役所」バス停で下車いただくと、オフィスまで約370mです。
💬 ご注意：ご来社の前に、スタッフの在席確認のため事前にメッセージをお送りくださいませ。よろしくお願いいたします。🙏$$,
updated_at = now() WHERE name = 'Office Location';

UPDATE public.messaging_templates SET content_en = $$Madali at convenient lang po ang pag-checkout gamit ang aming order link. 🤗 Para po matulungan kayo, gumawa po kami ng tutorial video. 🎬 Panoorin lang po ang gabay dito:

👉 https://www.facebook.com/share/v/1Cr76PLTLA/

Kung may iba pa po kaming maitutulong sa checkout process, sabihin lang po sa amin!$$,
content_ja = $$注文リンクを使えば、チェックアウトは簡単・便利です。🤗 お手続きのご参考に、チュートリアル動画をご用意しました。🎬 こちらのガイドをご覧くださいませ。

👉 https://www.facebook.com/share/v/1Cr76PLTLA/

チェックアウトについて他にご不明な点がございましたら、お気軽にお知らせくださいませ。$$,
updated_at = now() WHERE name = 'Order: How to Checkout';

UPDATE public.messaging_templates SET content_en = $$Natanggap na po namin ang inyong Japan order. 🥰
Ito po ang inyong order details. 👇

✅ Paki-double check po kung tama ang lahat.

Maraming salamat po sa pag-order! 😄$$,
content_ja = $$ご注文（日本国内）を承りました。🥰
ご注文内容は以下の通りです。👇

✅ 内容にお間違いがないかご確認くださいませ。

ご注文いただき誠にありがとうございます！😄$$,
updated_at = now() WHERE name = 'Order: Japan Invoice';

UPDATE public.messaging_templates SET content_en = $$I-process na po natin ang inyong order! 🎉 Paki-send lang po ang inyong mga detalye:

1️⃣ Name:
2️⃣ Phone Number:
3️⃣ Email Address:
4️⃣ Complete Address:

Pakisagutan din po ang inyong preferred na:
📅 Delivery Date:
🕒 Delivery Time: 9AM–12PM / 2PM–4PM / 4PM–6PM / 6PM–8PM / 7PM–9PM$$,
content_ja = $$ご注文の手続きを進めさせていただきます！🎉 お手数ですが、以下の情報をお送りくださいませ。

1️⃣ お名前：
2️⃣ 電話番号：
3️⃣ メールアドレス：
4️⃣ ご住所（詳細まで）：

また、ご希望の配送日時もお知らせくださいませ。
📅 配達希望日：
🕒 配達希望時間：9〜12時／14〜16時／16〜18時／18〜20時／19〜21時$$,
updated_at = now() WHERE name = 'Order: Manual Process';

UPDATE public.messaging_templates SET content_en = $$Para po ma-checkout ang inyong order, bisitahin lang po ang link na ito:
👉

Paki-order po agad dahil first-come, first-served po ang link. 🛍️

Maraming salamat po!$$,
content_ja = $$ご注文のお手続きは、以下のリンクよりお願いいたします。
👉

リンクは先着順となりますので、お早めのご注文をおすすめいたします。🛍️

よろしくお願いいたします！$$,
updated_at = now() WHERE name = 'Order: Offer Link';

UPDATE public.messaging_templates SET content_en = $$Natanggap na po namin ang inyong order. 🥰
Ito po ang inyong order details. 👇

✅ Paki-double check po kung tama ang lahat.

Please note na sisimulan lang po naming i-process ang inyong order kapag bayad na po ito.

Maraming salamat po sa pag-order! 😄$$,
content_ja = $$ご注文を承りました。🥰
ご注文内容は以下の通りです。👇

✅ 内容にお間違いがないかご確認くださいませ。

なお、ご注文の処理はお支払い完了後に開始いたしますので、ご了承くださいませ。

ご注文いただき誠にありがとうございます！😄$$,
updated_at = now() WHERE name = 'Order: Philippines Invoice';

UPDATE public.messaging_templates SET content_en = $$Ang unit po na gusto ninyo ay para sa special order request. Ito po ang mga detalye:

Unit:
Price:
Downpayment:

Sabihin lang po sa amin kung ipapa-restock ninyo ito para maibigay namin ang payment details.
Pakitandaan po na non-refundable ang downpayment. Kapag na-confirm na po ang order, hindi na po ito maka-cancel o mapapalitan ang unit.$$,
content_ja = $$ご希望の商品はお取り寄せ注文となります。詳細は以下の通りです。

商品：
価格：
前金（デポジット）：

お取り寄せをご希望の場合はお知らせくださいませ。お支払い情報をご案内いたします。
なお、前金は返金不可となります。ご注文確定後のキャンセルや商品の変更はお受けできませんので、ご了承くださいませ。$$,
updated_at = now() WHERE name = 'Order: Special Request';

UPDATE public.messaging_templates SET content_en = $$Dumating na po sa aming courier partner sa Japan ang inyong package for shipment. 📦 Ito po ang mga detalye:

#️⃣ Tracking Number:
✈️ Courier: LBC Express
📅 Delivery Date (on or before):

Pwede po ninyong i-track ang order dito:
https://www.lbcexpress.com/track/

Maraming salamat po sa inyong order! 🥰$$,
content_ja = $$お客様のお荷物が、日本の配送パートナーに到着し発送準備が整いました。📦 詳細は以下の通りです。

#️⃣ 追跡番号：
✈️ 配送業者：LBC Express
📅 お届け予定日（〜まで）：

以下のリンクよりお荷物を追跡いただけます。
https://www.lbcexpress.com/track/

ご注文いただき誠にありがとうございます！🥰$$,
updated_at = now() WHERE name = 'Tracking: LBC';

UPDATE public.messaging_templates SET content_en = $$Na-ship out na po namin ang inyong order. 📦🚚 Ito po ang mga detalye: 👇

Maraming salamat po sa inyong order! 🥰$$,
content_ja = $$ご注文の商品を発送いたしました。📦🚚 詳細は以下の通りです。👇

ご注文いただき誠にありがとうございます！🥰$$,
updated_at = now() WHERE name = 'Tracking: Yamato';
