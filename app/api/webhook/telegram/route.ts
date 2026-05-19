import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const maxDuration = 60; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-build-phase'; 
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// The top 10 predicted categories for the quick-add wizard grid
const MASTER_PREDICTIONS = [
  "Groceries", "Dining Out", "Online Groceries", "Online Food Orders",
  "Cab Services", "Personal Transportation", "Online Shopping", "Miscellaneous",
  "Entertainment", "Subscriptions"
];

const QUICK_CATEGORIES = [
  "Dining Out", "Online Food Orders", "Online Groceries", "Groceries",
  "Cab Services", "Personal Transportation", "Online Shopping", "Miscellaneous"
];

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // ─── 🔑 SHARED DATABASE-DRIVEN SECURITY LOOKUP HELPER ───
    const validateTelegramUser = async (tgUser: string) => {
      const cleanHandle = tgUser.replace(/@/g, '').trim().toLowerCase();
      if (!cleanHandle) return null;

      const { data: allProfiles, error } = await supabase
        .from('profiles')
        .select('household_id, display_name, telegram_username');

      if (error || !allProfiles) {
        console.error("Database connection failure during Telegram routing:", error);
        return null;
      }

      // Locate the row matching the clean handle match parameters using lowercase validation
      const match = allProfiles.find(p => 
        (p.telegram_username || '').replace(/@/g, '').trim().toLowerCase() === cleanHandle
      );

      if (!match) return null;

      return {
        householdId: match.household_id,
        senderIdentity: match.display_name === 'Partner B' ? 'Partner B' : 'Partner A'
      };
    };

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH A: INTERACTIVE CONTROL CONSOLE DISPATCH (CALLBACK QUERIES)
    // ────────────────────────────────────────────────────────────────────────
    if (payload.callback_query) {
      const callbackQuery = payload.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const dataStr = callbackQuery.data || '';
      const tgUser = callbackQuery.from.username || '';

      // Run our shared database check!
      const userContext = await validateTelegramUser(tgUser);

      if (!userContext) {
        await answerCallbackQuery(callbackQuery.id, "🚫 Unauthorized identity interaction. Linked profile missing.");
        return NextResponse.json({ ok: true });
      }

      // Success! Unpack your runtime identities dynamically from the cloud record match
      const hId = userContext.householdId;
      const senderIdentity = userContext.senderIdentity;

      // ─── WIZARD STEP 2: CATEGORY SELECTED -> CHOOSE ACCOUNT ───
      if (dataStr.startsWith('w_cat_')) {
        const [_, __, txId, catIndex] = dataStr.split('_');
        const chosenCategory = MASTER_PREDICTIONS[parseInt(catIndex, 10)];

        await supabase.from('transactions').update({ category: chosenCategory }).eq('id', txId);

        const { data: tx } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        let nameA = "Partner A"; 
        let nameB = "Partner B";
        if (tx?.household_id) {
          const { data: st = null } = await supabase.from('household_settings').select('settings_data').eq('household_id', tx.household_id).single();
          if (st?.settings_data) {
            const settings = typeof st.settings_data === 'string' ? JSON.parse(st.settings_data) : st.settings_data;
            nameA = settings.partnerAName || settings.partner_a_name || nameA;
            nameB = settings.partnerBName || settings.partner_b_name || nameB;
          }
        }

        const accountKeyboard = [
          [
            { text: `👤 ${nameA}`, callback_data: `w_acc_${txId}_PartnerA` },
            { text: `👤 ${nameB}`, callback_data: `w_acc_${txId}_PartnerB` }
          ],
          [{ text: "💳 Joint Account", callback_data: `w_acc_${txId}_Joint` }]
        ];

        await editTelegramMessageInline(chatId, messageId, `📦 <b>Category Set:</b> ${chosenCategory}\n\n🏧 <b>Next, choose the funding account used:</b>`, accountKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // ─── WIZARD STEP 3: ACCOUNT SELECTED -> CHOOSE SETTLEMENT ───
      if (dataStr.startsWith('w_acc_')) {
        const [_, __, txId, rawAccount] = dataStr.split('_');
        const normalizedAccount = rawAccount === 'PartnerA' ? 'Partner A' : rawAccount === 'PartnerB' ? 'Partner B' : 'Joint';

        await supabase.from('transactions').update({ account_used: normalizedAccount }).eq('id', txId);

        if (normalizedAccount === 'Joint') {
          await answerCallbackQuery(callbackQuery.id, "✅ Wizard Entry Finished!");
          return handleReturnToMenu(chatId, messageId, txId);
        }

        const settleKeyboard = [
          [
            { text: "⚠️ Yes, Joint Account", callback_data: `w_fin_${txId}_true` },
            { text: "✅ No, Personal Expense", callback_data: `w_fin_${txId}_false` }
          ]
        ];

        await editTelegramMessageInline(chatId, messageId, `🏧 <b>Account Set:</b> ${normalizedAccount}\n\n⚖️ <b>Should this out-of-pocket cost be settled by the joint pool?</b>`, settleKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // ─── WIZARD STEP 4: SETTLEMENT SET -> CONCLUDE AND SHOW MAIN DOCK ───
      if (dataStr.startsWith('w_fin_')) {
        const [_, __, txId, settleFlag] = dataStr.split('_');
        const toSettleValue = settleFlag === 'true';

        await supabase.from('transactions').update({ to_settle: toSettleValue }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, "🎉 Entry Successfully Compiled!");
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // --- STANDARD SUB-MENU: SHOW CATEGORY GRID ---
      if (dataStr.startsWith('s_cat_')) {
        const txId = dataStr.split('s_cat_')[1];
        const inlineKeyboard: any[] = [];
        for (let i = 0; i < QUICK_CATEGORIES.length; i += 2) {
          inlineKeyboard.push([
            { text: QUICK_CATEGORIES[i], callback_data: `v_cat_${txId}_${i}` },
            { text: QUICK_CATEGORIES[i+1], callback_data: `v_cat_${txId}_${i+1}` }
          ]);
        }
        inlineKeyboard.push([{ text: "◀ Return to Menu", callback_data: `menu_${txId}` }]);
        await editTelegramMessageInline(chatId, messageId, "✏️ <b>Select the replacement category below:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- STANDARD SUB-MENU: SHOW ACCOUNT SELECTION WITH DYNAMIC NAMES ---
      if (dataStr.startsWith('s_acc_')) {
        const txId = dataStr.split('s_acc_')[1];
        const { data: txRow } = await supabase.from('transactions').select('household_id').eq('id', txId).single();
        
        let nameA = "Partner A";
        let nameB = "Partner B";
        if (txRow?.household_id) {
          const { data: settingsRow } = await supabase.from('household_settings').select('settings_data').eq('household_id', txRow.household_id).single();
          if (settingsRow?.settings_data) {
            const settings = typeof settingsRow.settings_data === 'string' ? JSON.parse(settingsRow.settings_data) : settingsRow.settings_data;
            nameA = settings.partnerAName || settings.partner_a_name || nameA;
            nameB = settings.partnerBName || settings.partner_b_name || nameB;
          }
        }

        const inlineKeyboard = [
          [
            { text: `👤 ${nameA}`, callback_data: `v_acc_${txId}_PartnerA` },
            { text: `👤 ${nameB}`, callback_data: `v_acc_${txId}_PartnerB` }
          ],
          [{ text: "💳 Joint Account", callback_data: `v_acc_${txId}_Joint` }],
          [{ text: "◀ Return to Menu", callback_data: `menu_${txId}` }]
        ];
        
        await editTelegramMessageInline(chatId, messageId, "🏧 <b>Select the correct target funding account:</b>", inlineKeyboard);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- STANDARD ACTION: PROMPT USER FOR NOTE TEXT ---
      if (dataStr.startsWith('s_not_')) {
        const txId = dataStr.split('s_not_')[1];
        const promptMsg = `📝 <b>Editing Note for transaction reference:</b>\n<code>${txId}</code>\n\nPlease reply directly to this message block with your new custom note content.`;
        await sendTelegramForceReply(chatId, promptMsg);
        await answerCallbackQuery(callbackQuery.id);
        return NextResponse.json({ ok: true });
      }

      // --- STANDARD TOGGLE ACTION: SETTLEMENT STATUS SWITCH ---
      if (dataStr.startsWith('t_set_')) {
        const txId = dataStr.split('t_set_')[1];
        const { data: current } = await supabase.from('transactions').select('to_settle').eq('id', txId).single();
        if (current) {
          const nextState = !current.to_settle;
          await supabase.from('transactions').update({ to_settle: nextState }).eq('id', txId);
          await answerCallbackQuery(callbackQuery.id, `⚖️ Settlement flipped to: ${nextState ? 'Yes' : 'No'}`);
        }
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // --- STANDARD TOGGLE ACTION: EXPENSE ⇄ INCOME SWITCH ---
      if (dataStr.startsWith('t_typ_')) {
        const txId = dataStr.split('t_typ_')[1];
        const { data: current } = await supabase.from('transactions').select('type').eq('id', txId).single();
        if (current) {
          const nextType = current.type === 'expense' ? 'income' : 'expense';
          await supabase.from('transactions').update({ type: nextType }).eq('id', txId);
          await answerCallbackQuery(callbackQuery.id, `🔄 Flow type swapped to: ${nextType}`);
        }
        return handleReturnToMenu(chatId, messageId, txId);
      }

      // --- STANDARD VALUE EXECUTION RESOLUTIONS ---
      if (dataStr.startsWith('v_cat_')) {
        const [_, __, txId, indexStr] = dataStr.split('_');
        const targetCategory = QUICK_CATEGORIES[parseInt(indexStr, 10)];
        await supabase.from('transactions').update({ category: targetCategory }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, `📦 Updated to ${targetCategory}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      if (dataStr.startsWith('v_acc_')) {
        const [_, __, txId, rawAccount] = dataStr.split('_');
        const normalizedAccount = rawAccount === 'PartnerA' ? 'Partner A' : rawAccount === 'PartnerB' ? 'Partner B' : 'Joint';
        await supabase.from('transactions').update({ account_used: normalizedAccount }).eq('id', txId);
        await answerCallbackQuery(callbackQuery.id, `🏧 Account mapped: ${normalizedAccount}`);
        return handleReturnToMenu(chatId, messageId, txId);
      }

      if (dataStr.startsWith('d_')) {
        const txId = dataStr.split('d_')[1];
        await supabase.from('transactions').delete().eq('id', txId);
        await editTelegramMessageInline(chatId, messageId, "🗑️ <b>Transaction permanently deleted from cloud ledger.</b>", []);
        await answerCallbackQuery(callbackQuery.id, "Purged.");
        return NextResponse.json({ ok: true });
      }

      if (dataStr.startsWith('menu_')) {
        const txId = dataStr.split('menu_')[1];
        return handleReturnToMenu(chatId, messageId, txId);
      }

      return NextResponse.json({ ok: true });
    }

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH B: STANDARD MESSAGES & TEXT REPLY LISTENER HANDLERS
    // ────────────────────────────────────────────────────────────────────────
    if (payload.message) {
      const chatId = payload.message.chat.id;
      const tgUser = payload.message.from.username || '';
      const rawText = (payload.message.text || '').trim();
      
      // Run our shared database profile validation check
      const userContext = await validateTelegramUser(tgUser);
      
      if (!userContext) {
        await sendTelegramMessage(chatId, 
          `❌ <b>Access Denied</b>\n\n` +
          `The handle <code>@${tgUser}</code> is not linked to any active ledger profiles.\n\n` +
          `Please log into your web dashboard, go to Settings, and link your handle under the Sync card!`
        );
        return NextResponse.json({ ok: true });
      }

      // Success! Unpack your multi-tenant parameters instantly from the verified record match
      const householdId = userContext.householdId;
      const senderIdentity = userContext.senderIdentity;

      // --- INTERCEPT INLINE TEXT NOTE EDIT MODIFICATIONS ---
      if (payload.message.reply_to_message && payload.message.reply_to_message.text) {
        const replyText = payload.message.reply_to_message.text;
        if (replyText.includes('Editing Note for transaction reference:')) {
          const txId = replyText.split('\n')[1]?.trim();
          if (txId) {
            await supabase.from('transactions').update({ note: rawText }).eq('id', txId);
            await sendTelegramMessage(chatId, `📝 <b>Note updated successfully to:</b> "${rawText}"`);
            return handleReturnToMenu(chatId, payload.message.message_id - 1, txId);
          }
        }
      }

      if (rawText.startsWith('/start')) {
        await sendTelegramMessage(chatId, "👋 Welcome! Send a plain number (e.g., <code>500</code>) to trigger the interactive Wizard, or send a natural text description sentence to log automatically via AI.");
        return NextResponse.json({ ok: true });
      }

      const geminiKey = process.env.GEMINI_API_KEY;

      // ─── 💥 PATH 1: THE ZERO-COST INTERACTIVE WIZARD TRIGGER ───
      const cleanNumericAmount = Number(rawText);
      if (!isNaN(cleanNumericAmount) && cleanNumericAmount > 0) {
        const secureUuidFallback = crypto.randomUUID();

        const skeletonPayload = {
          id: secureUuidFallback,
          household_id: householdId, // Bound strictly to dynamic context
          date: new Date().toISOString().slice(0, 10),
          amount: cleanNumericAmount,
          category: 'Miscellaneous', 
          type: 'expense',
          account_used: 'Joint',     
          added_by: senderIdentity,
          note: 'Quick Wizard Log',
          to_settle: false,
          settled: false
        };

        await supabase.from('transactions').insert([skeletonPayload]);

        const categoryKeyboard: any[] = [];
        for (let i = 0; i < MASTER_PREDICTIONS.length; i += 2) {
          categoryKeyboard.push([
            { text: MASTER_PREDICTIONS[i], callback_data: `w_cat_${secureUuidFallback}_${i}` },
            { text: MASTER_PREDICTIONS[i+1], callback_data: `w_cat_${secureUuidFallback}_${i+1}` }
          ]);
        }

        const greetingHeader = `🔢 <b>Amount Logged:</b> ₹${cleanNumericAmount}\n\n📦 <b>Select a category below to compile entry data:</b>`;
        await sendTelegramMessageInline(chatId, greetingHeader, categoryKeyboard);
        return NextResponse.json({ ok: true });
      }

      // ─── 🤖 PATH 2: MULTI-ROW DYNAMIC TENANT NATURAL LANGUAGE PARSER ───
      let nameA = "Partner A";
      let nameB = "Partner B";
      
      if (householdId) {
        const { data: settingsRow } = await supabase
          .from('household_settings')
          .select('settings_data')
          .eq('household_id', householdId)
          .single();
          
        if (settingsRow?.settings_data) {
          const settings = typeof settingsRow.settings_data === 'string' 
            ? JSON.parse(settingsRow.settings_data) 
            : settingsRow.settings_data;
          
          nameA = settings.partnerAName || settings.partner_a_name || nameA;
          nameB = settings.partnerBName || settings.partner_b_name || nameB;
        }
      }

      // 2. Build the system configuration prompt injecting dynamic session variables
      const systemPrompt = `You are an expert personal finance clerk parsing ledger lines. 
      Analyze the text input and extract EVERY individual transaction item mentioned. 
      Map the entries into a valid JSON array of objects.
      
      VALID SYSTEM CATEGORIES & EXPLICIT PROCESSING RULES:
      - "Alcohol"              (Wine shops, Living Liquidz, pub/bar drinks, beer, whiskey, gin, vodka, specific alcohol logs)
      - "Dining Out"          (Restaurants, cafes, dine-in, fine dining, coffee shops, food at JP, JP food, physically eating out at a venue)
      - "Education"           (Course fees, certifications, books, training programs, upskilling materials)
      - "Entertainment"       (Movie tickets, Movie names, BookMyShow, gaming arcades, bowling alleys, concerts, events, fun outings)
      - "Groceries"           (Offline local kirana stores, Metro, Fruits, Grocery, physical vegetable/fruit markets, cash grocery purchases)
      - "Healthcare"          (Pharmacies, Medical, medical stores like Apollo, doctor, checkups, lab tests, dental treatments, medicines)
      - "Gifting"              (Buying gifts for friends, family members, relatives; shagun/cash envelopes for weddings or birthdays)
      - "Housing"              (Monthly house rent, society maintenance bills, Home loan EMI)
      - "Insurance"           (Health insurance premiums, car/bike motor insurance renewals, term life insurance policies)
      - "Investments"          (Mutual fund allocations, monthly SIPs, Smallcase, Zerodha, Gold coin, US stocks, IND Money, NJ E-wealth, SIP, direct stocks buying, gold purchases, PPF deposits, Index funds)
      - "Miscellaneous"       (Unexpected or unclassifiable payments, ATM cash withdrawals, random one-off pocket cash items)
      - "Offline Shopping"    (Physical retail checkout counters, apparel or footwear bought at a mall/store, lifestyle physical shopping)
      - "Online Shopping"     (Amazon, Flipkart, Myntra, Ajio, Tata CLiQ, non-grocery online courier packages, retail websites)
      - "Personal Care"       (Salon visits, haircuts, beauty parlour sessions, grooming products, spa, cosmetics, skincare items)
      - "Personal Transportation" (Petrol, Bike EMI, Helmet, car or motorcycle service/repairs, toll payments, fastag recharges, parking fees)
      - "Savings"              (Manual transfers to long-term cash reserves, emergency savings funds, specific sinking fund transfers)
      - "Subscriptions"       (Netflix, Amazon Prime, Google API, Spotify, iCloud storage, YouTube Premium, gym memberships, recurring software apps/services)
      - "Health & Fitness"    (Protein powder, gym supplements, Yoga classes, workout fitness gear, tracking straps, organic health food products)
      - "Taxes"               (Income tax filings, property tax payments, municipal or government duty filings)
      - "Technology"          (Software license keys, digital tools, cloud hosting packages, gadgets, computer/mobile electronic accessories)
      - "Travel"              (Flight tickets, hotel bookings, Airbnb stays, IRCTC train tickets, vacation bookings, luggage travel luggage bags)
      - "Utilities"           (Mobile recharges like Jio/Airtel/VI, home broadband Wi-Fi bills, electricity bills, piped gas, Laundry, Maid salary, Cook Salary)
      - "Online Food Orders"  (Zomato, Swiggy food, EatClub, Domino's, pizza/burger drops, cloud kitchen orders)
      - "Household Items"     (Household items, Kitchen items, Cleaning liquids, laundry/washing detergents, garbage bags, trash cans, mop replacements, house decor, bedsheets, Amazon orders)
      - "Cab Services"         (Uber rides, Ola bookings, Rapido, InDrive, auto, rickshaw, cab)
      - "Hosting Day"          (Ordering bulk food/alcohol/snacks specifically when friends, family, or guests are visiting the house for a social gathering)
      - "Online Groceries"    (Zepto orders, Blinkit orders, Swiggy Instamart delivery, BigBasket, daily milk/produce apps)
      - "Interest Earned"     (Bank savings account quarterly interest payouts, fixed deposit (FD) interest pay-ins)
      - "Spouse Gifting"      (Special anniversary gestures, flowers, birthday surprises, or customized items explicitly bought as a gift for your partner)
      - "Family payments"      (Sending money home to parents, financial support transfers to family members or siblings, names can include "mom", "dad", "mama", "sohan", "Kari mom", "Kari dad")
      
      ACCOUNT SELECTION & IDENTITY RULES:
      - Map to "Partner A" if text mentions or explicitly implies ${nameA}.
      - Map to "Partner B" if text mentions or explicitly implies ${nameB}.
      - Map to "Joint" if text says joint/joint account/wallet.
      - Default to "${senderIdentity}" if no distinct profile entity matching can be inferred from the text.

      ⚠️ LIVE USER SESSION CONTEXT:
      - The person physically writing this chat message right now is: ${senderIdentity}.
      - ADDED_BY FIELD: Always populate the "added_by" tracking field exactly as "${senderIdentity}".
      - SETTLEMENT MAPPING: "to_settle" is true if the text contains "to settle", "tosettle", "to be settled", "split", or "half". Otherwise false.
      - If "to_settle" is true, it explicitly means that ${senderIdentity} paid for this entire item out-of-pocket and the OTHER partner owes them their split share. Mark "account_used" as "${senderIdentity}".

      TYPE: "income" if text contains salary/bonus/credited/refund. Else "expense".

      CRUCIAL CLEANING RULE: The "note" field must contain ONLY the physical item description or store merchant name (e.g., "Savana", "Zepto", "Fuel"). Strikingly remove dynamic tracking names like "${nameA}", "${nameB}", "Joint" or settlement phrases from the final note string entirely. Do not put the category name inside the note, unless there is no other way to do it.`;

      // 3. Define the deterministic strict array object constraints schema blueprint
      const transactionSchema = {
        type: "ARRAY",
        description: "List of extracted financial transaction items from the user input sentence string",
        items: {
          type: "OBJECT",
          properties: {
            amount: { type: "NUMBER", description: "The exact numerical value of the transaction cost" },
            category: { type: "STRING", description: "The mapped valid expense/income category string name" },
            note: { type: "STRING", description: "Clean description of the merchant or item only" },
            type: { type: "STRING", description: "Must be exactly 'expense' or 'income'" },
            account: { type: "STRING", description: "Must be exactly 'Partner A', 'Partner B', or 'Joint'" },
            toSettle: { type: "BOOLEAN", description: "Set to true if tracking splits are requested, otherwise false" }
          },
          required: ["amount", "category", "note", "type", "account", "toSettle"]
        }
      };

      // 4. Dispatch call using native structural constraints enforcement
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Input: "${rawText}"` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: transactionSchema
          }
        })
      });
      
      const geminiData = await geminiRes.json();
      let rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (rawJsonText.includes('```')) {
        rawJsonText = rawJsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
      } else {
        rawJsonText = rawJsonText.trim();
      }

      if (!rawJsonText) {
        console.error("Gemini returned an empty response text context body string.");
        await sendTelegramMessage(chatId, "⚠️ AI configuration failed to map this sentence layout clearly. Please use short syntax elements.");
        return NextResponse.json({ ok: true });
      }
      
      const parsedTransactionsArray = JSON.parse(rawJsonText);
      
      if (!Array.isArray(parsedTransactionsArray)) {
        throw new Error("Gemini compile failure: Output did not resolve to an array matrix.");
      }

      // 5. Asynchronous sequential database commit mapping runner loop
      for (const parsedTx of parsedTransactionsArray) {
        const secureUuidFallback = crypto.randomUUID();
        
        // Normalize returned accounts into generic database-safe column values
        let dbAccountMapping = 'Joint';
        if (parsedTx.account === 'Partner A') dbAccountMapping = 'Partner A';
        if (parsedTx.account === 'Partner B') dbAccountMapping = 'Partner B';

        const insertPayload = {
          id: secureUuidFallback,
          household_id: householdId,
          date: new Date().toISOString().slice(0, 10),
          amount: Number(parsedTx.amount || 0),
          category: parsedTx.category || 'Miscellaneous',
          type: parsedTx.type || 'expense',
          account_used: dbAccountMapping,
          added_by: senderIdentity,
          note: parsedTx.note || 'Multi-log entry',
          to_settle: Boolean(parsedTx.toSettle),
          settled: false,
          settled_with: null
        };

        if (insertPayload.amount <= 0) continue; 

        const { data: dbRows } = await supabase.from('transactions').insert([insertPayload]).select();
        const realTx = dbRows && dbRows[0] ? dbRows[0] : insertPayload;
        const activeId = realTx.id;

        let accountDisplay = '💳 Joint Account';
        if (realTx.account_used === 'Partner A') accountDisplay = `👤 ${nameA}`;
        if (realTx.account_used === 'Partner B') accountDisplay = `👤 ${nameB}`;

        const responseMsg = `<b>📥 Transaction Item Logged!</b>\n\n💰 <b>Amount:</b> ₹${realTx.amount}\n📦 <b>Category:</b> ${realTx.category}\n🏧 <b>Account:</b> ${accountDisplay}\n⚖️ <b>To Settle:</b> ${realTx.to_settle ? '⚠️ Yes' : '✅ No'}\n🔄 <b>Flow Type:</b> ${realTx.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n📝 <b>Note:</b> ${realTx.note}`;
        
        const inlineKeyboard = [
          [
            { text: "📦 Category", callback_data: `s_cat_${activeId}` },
            { text: "🏧 Account", callback_data: `s_acc_${activeId}` },
            { text: "📝 Edit Note", callback_data: `s_not_${activeId}` }
          ],
          [
            { text: realTx.to_settle ? "⚖️ To Settle: Yes" : "⚖️ To Settle: No", callback_data: `t_set_${activeId}` },
            { text: realTx.type === 'expense' ? "🛑 Type: Expense" : "💸 Type: Income", callback_data: `t_typ_${activeId}` },
            { text: "🗑️ Delete", callback_data: `d_${activeId}` }
          ]
        ];

        await sendTelegramMessageInline(chatId, responseMsg, inlineKeyboard);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Core Webhook Route Operations Error Failure:', err);
    
    try {
      const requestPayload = JSON.parse(await request.clone().text()).catch(() => ({}));
      const chatId = requestPayload?.message?.chat?.id || requestPayload?.callback_query?.message?.chat?.id;
      
      if (chatId) {
        const failureAlert = `❌ <b>Transaction Logging Failed</b>\n\n⚠️ Your entry could not be processed automatically.\n\n🧐 <b>Error Context:</b> <code>${err?.message || 'Unknown Runtime Exception'}</code>\n\n<i>Please check your balance values or re-verify the text formatting structures.</i>`;
        
        const token = process.env.TELEGRAM_BOT_TOKEN;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: failureAlert, parse_mode: 'HTML' }),
        });
      }
    } catch (nestedNotificationError) {
      console.error('Failed to dispatch error alert callback payload back to Telegram:', nestedNotificationError);
    }

    return NextResponse.json({ ok: true }); 
  }
}

// ────────────────────────────────────────────────────────────────────────
// TELEGRAM CORE FRAMEWORK API PIPELINES
// ────────────────────────────────────────────────────────────────────────
async function handleReturnToMenu(chatId: number, messageId: number, txId: string) {
  const { data: txRows } = await supabase.from('transactions').select().eq('id', txId);
  if (txRows && txRows[0]) {
    const tx = txRows[0];
    
    let nameA = "Partner A";
    let nameB = "Partner B";
    
    if (tx.household_id) {
      const { data: settingsRow } = await supabase.from('household_settings').select('settings_data').eq('household_id', tx.household_id).single();
      
      if (settingsRow?.settings_data) {
        const settings = typeof settingsRow.settings_data === 'string' 
          ? JSON.parse(settingsRow.settings_data) 
          : settingsRow.settings_data;
        
        nameA = settings.partnerAName || settings.partner_a_name || nameA;
        nameB = settings.partnerBName || settings.partner_b_name || nameB;
      }
    }

    let accountDisplay = '💳 Joint Account';
    if (tx.account_used === 'Partner A') accountDisplay = `👤 ${nameA}`;
    if (tx.account_used === 'Partner B') accountDisplay = `👤 ${nameB}`;

    const baseBanner = `<b>📥 Transaction Successfully Recorded!</b>\n\n💰 <b>Amount:</b> ₹${tx.amount}\n📦 <b>Category:</b> ${tx.category}\n🏧 <b>Account:</b> ${accountDisplay}\n⚖️ <b>To Settle:</b> ${tx.to_settle ? '⚠️ Yes' : '✅ No'}\n🔄 <b>Flow Type:</b> ${tx.type === 'expense' ? '🛑 Expense' : '💸 Income'}\n📝 <b>Note:</b> ${tx.note}`;
    
    const inlineKeyboard = [
      [
        { text: "📦 Category", callback_data: `s_cat_${txId}` },
        { text: "🏧 Account", callback_data: `s_acc_${txId}` },
        { text: "📝 Edit Note", callback_data: `s_not_${txId}` }
      ],
      [
        { text: tx.to_settle ? "⚖️ To Settle: Yes" : "⚖️ To Settle: No", callback_data: `t_set_${txId}` },
        { text: tx.type === 'expense' ? "🛑 Type: Expense" : "💸 Type: Income", callback_data: `t_typ_${txId}` },
        { text: "🗑️ Delete", callback_data: `d_${txId}` }
      ]
    ];
    await editTelegramMessageInline(chatId, messageId, baseBanner, inlineKeyboard);
  }
  return NextResponse.json({ ok: true });
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' }),
  });
}

async function sendTelegramMessageInline(chatId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }),
  });
}

async function editTelegramMessageInline(chatId: number, messageId: number, text: string, keyboard: any[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }),
  });
}

async function sendTelegramForceReply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', reply_markup: { force_reply: true, selective: true } }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, alertText?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: alertText || "", show_alert: false }),
  });
}
