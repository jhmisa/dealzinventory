-- Fix conflicting guardrail: selling prices ARE public (from sell_groups / shop page)
UPDATE knowledge_base
SET title   = 'Never share buying prices, costs, or supplier info',
    content = 'You must NEVER disclose buying prices, purchase costs, profit margins, supplier names, or cost information to customers. Selling prices from our shop are public and safe to share. If asked about costs or suppliers, say that information is internal.',
    updated_at = now()
WHERE title = 'Never share selling or buying prices';

-- Add guardrail: never expose internal metadata
INSERT INTO knowledge_base (entry_type, title, content, category, sort_order) VALUES
  ('guardrail', 'Never expose internal metadata',
   E'Never share the following internal data with customers:\n- Supplier names or purchase sources\n- Purchase prices or cost breakdowns\n- P-codes (internal item codes like P000123)\n- Staff names or internal contacts\n\nThe following ARE safe to share:\n- G-codes (sell group codes like G000123)\n- A-codes (accessory codes like A000012)\n- Selling prices listed in our shop\n- Condition grades and what they mean',
   'Security', 3);

-- Knowledge article: handling product inquiries
INSERT INTO knowledge_base (entry_type, title, content, category, sort_order) VALUES
  ('knowledge', 'Handling Product Inquiries',
   E'When a customer asks about available products, follow this flow:\n\n1. **Check Available Inventory** — Review the inventory context provided to you. Look for matching products by brand, category, or keywords.\n\n2. **Ask qualifying questions** if the request is vague:\n   - What type of device? (laptop, phone, tablet)\n   - Any brand preference?\n   - Budget range?\n   - Important specs? (storage, RAM, screen size)\n\n3. **Recommend matching products** — List relevant items with:\n   - Brand and model name\n   - Key specs (CPU/chipset, RAM, storage, OS)\n   - Condition grade and what it means (reference our grading system)\n   - Price in yen\n   - G-code for reference\n\n4. **Suggest accessories** — If relevant accessories are in stock (chargers, cases, screen protectors), mention them.\n\n5. **If nothing matches** — Let the customer know we don''t currently have what they''re looking for, and suggest they check back or ask to be notified when similar items arrive.\n\nAlways be helpful and conversational. Use the customer''s language (Filipino/Tagalog or English) to match their tone.',
   'Products', 5);

-- Knowledge article: Tagalog/Filipino text-speak guide
INSERT INTO knowledge_base (entry_type, title, content, category, sort_order) VALUES
  ('knowledge', 'Tagalog/Filipino Text-Speak Guide',
   E'Many customers message in Tagalog or Filipino text-speak. Here is a reference guide:\n\n**Common particles & words:**\n- po / ho — politeness marker (like "sir/ma''am")\n- lang — only, just\n- din / rin — also, too\n- naman — on the other hand, though\n- yung / yun — that, the one\n- ba — question marker\n- na — already, now\n- pa — still, more\n- pwede / puwede — can, possible\n- sige / sge / g — okay, go ahead\n- magkano / mkno — how much\n- meron / mron — there is, do you have\n- wala — none, nothing\n- kuha — get, take\n- bibili — will buy\n- avail — to claim/purchase (from "avail")\n- bili — buy\n- order — place an order\n- check / chk — to look at, verify\n\n**Common questions:**\n- "meron pa po ba?" — Do you still have (it)?\n- "magkano po yan?" — How much is that?\n- "may laptop po kayo?" — Do you have laptops?\n- "avail po" — I want to buy/claim this\n- "pa-reserve po" — Can you reserve this for me?\n- "anong available?" — What''s available?\n- "may stock pa?" — Is it still in stock?\n\n**Text-speak abbreviations:**\n- pls / plis — please\n- tnx / ty / tysm — thanks\n- q / ko — I, me, my\n- aq / ako — I, me\n- sge / g — sige (okay)\n- pde / pwd — pwede (can)\n- mkno — magkano (how much)\n- pra / para — for\n- lng — lang (only)\n- dn — din (also)\n- nmn — naman\n- san / sn — saan (where)\n\nWhen responding, match the customer''s language. If they write in Tagalog, reply in conversational Tagalog. Use "po" for politeness.',
   'Language', 6);
