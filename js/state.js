// ============================================================
//  存檔、讀檔、以及時間推進。
//  「離線收益」和「切到背景再回來」在這裡是同一段邏輯。
// ============================================================

const State = (() => {
  // 刻意取一個跟主題無關的名字：content.js 的主題本來就是可以換的，
  // 換主題不該讓玩家的存檔消失。
  const SAVE_KEY = "idle-save-v1";

  // 讀進來的東西不一定是數字（存檔可能壞掉、或被人手動改過）。
  // NaN 一旦混進來會污染全部後續計算，而且畫面只會顯示 "NaN"，很難查。
  function num(v, fallback) {
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  // 境界索引必須夾在合法範圍內：你如果在 content.js 裡刪掉幾個境界，
  // 舊存檔的索引就會指到不存在的地方。
  function clampRealm(v) {
    const n = num(v, 0);
    return Math.min(Math.max(Math.floor(n), 0), CONTENT.realms.length - 1);
  }

  function create() {
    const owned = {};
    for (const gen of CONTENT.generators) owned[gen.id] = 0;
    return {
      money: 0,
      totalEarned: 0,
      clicks: 0,
      realm: 0,
      breakthroughs: 0,
      failures: 0,
      insight: 0,
      owned,
      techniques: {},  // 功法：靈氣買的，突破時清空
      treasures: {},   // 法寶：悟性買的，永遠保留
      consumables: {}, // 符籙：可以囤，用一張少一張
      // 歷練
      layer: 0,        // 打到第幾層
      kills: 0,        // 這層清掉幾隻小怪了
      dmg: 0,          // 對當前這隻累積的傷害
      bossTime: 0,     // 魔王已經打了幾秒（時限用）
      materials: {},   // 天才地寶
      pets: {},        // { petId: { level } }
      equipped: null,  // 身上帶的那一隻
      // 機緣
      buffs: {},          // { 機緣 id: 到期時間戳 }
      fortune: null,      // 當前飄著的那個 { id, expires, x, y }
      nextFortuneAt: 0,   // 下一個何時出現
      fortunesClaimed: 0, // 領過幾個（第一顆要來得快，用這個判斷）
      // 裝備與道侶
      equipment: {},   // { slotId: { id, rarity, level } } 身上穿的
      bag: [],         // backpack：打到但還沒穿的
      companions: {},  // { companionId: true } 已招募
      team: [],        // 出戰的道侶（最多 companionSlots 個）
      // 武學抽卡
      martials: {},    // { martialId: 等級（勾玉數） }
      pity: 0,         // 連續幾抽沒抽到新武學（保底計數）
      draws: 0,        // 總共抽過幾次
      redeemed: {},    // 用過的兌換碼雜湊，避免重複兌換
      lastSave: Date.now(),
    };
  }

  // 只留下 content.js 裡真的還存在的 id。
  // 你如果刪掉一個功法，存檔裡的殘留就會被丟掉，不會變成看不見的鬼加成。
  function pickOwned(data, list) {
    const out = {};
    if (data && typeof data === "object") {
      for (const item of list) if (data[item.id]) out[item.id] = true;
    }
    return out;
  }

  function save(state) {
    state.lastSave = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn("存檔失敗：", e);
      return false;
    }
  }

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.warn("存檔壞掉，重新開始：", e);
      return null;
    }
    if (!data || typeof data !== "object") return null;

    // 以一份全新的存檔為底再蓋上舊資料。
    // 這樣你在 content.js 加了新的產生器之後，舊存檔也不會炸掉，
    // 新產生器會自動以 0 個出現。
    const state = create();
    state.money = num(data.money, 0);
    state.totalEarned = num(data.totalEarned, 0);
    state.clicks = num(data.clicks, 0);
    state.realm = clampRealm(data.realm);
    state.breakthroughs = Math.max(0, Math.floor(num(data.breakthroughs, 0)));
    state.failures = Math.max(0, Math.floor(num(data.failures, 0)));
    state.insight = Math.max(0, Math.floor(num(data.insight, 0)));
    state.techniques = pickOwned(data.techniques, CONTENT.techniques);
    state.treasures = pickOwned(data.treasures, CONTENT.treasures);
    state.lastSave = num(data.lastSave, Date.now());

    // --- 歷練 ---
    // 層數要夾住：你如果在 content.js 刪掉幾層，舊存檔會指到不存在的地方
    state.layer = Math.min(
      Math.max(Math.floor(num(data.layer, 0)), 0),
      CONTENT.layers.length // 等於長度 = 全部通關，這是合法狀態
    );
    state.kills = Math.min(
      Math.max(Math.floor(num(data.kills, 0)), 0),
      CONTENT.combat.mobsPerLayer
    );
    state.dmg = Math.max(0, num(data.dmg, 0));
    state.bossTime = Math.min(
      Math.max(num(data.bossTime, 0), 0),
      CONTENT.combat.bossTimeLimit
    );

    if (data.materials && typeof data.materials === "object") {
      for (const m of CONTENT.materials) {
        const qty = Math.floor(num(data.materials[m.id], 0));
        if (qty > 0) state.materials[m.id] = qty;
      }
    }

    if (data.consumables && typeof data.consumables === "object") {
      for (const c of CONTENT.consumables) {
        const qty = Math.floor(num(data.consumables[c.id], 0));
        if (qty > 0) state.consumables[c.id] = qty;
      }
    }

    // 靈寵：等級要夾在 1..maxLevel。等級 0 等於沒收服，不該存在。
    if (data.pets && typeof data.pets === "object") {
      for (const p of CONTENT.pets) {
        const saved = data.pets[p.id];
        if (!saved) continue;
        const lv = Math.floor(num(saved.level, 0));
        if (lv >= 1) state.pets[p.id] = { level: Math.min(lv, p.maxLevel) };
      }
    }

    // 帶著的靈寵必須真的擁有 —— 否則加成會憑空出現。
    //
    // 這裡用 hasOwnProperty 而不是 state.pets[data.equipped]：
    // data.equipped 是存檔裡的字串，直接拿它當 key 索引的話，
    // 遇到 "__proto__" 會拿到 Object.prototype（truthy），判斷就失守了。
    state.equipped =
      typeof data.equipped === "string" &&
      Object.prototype.hasOwnProperty.call(state.pets, data.equipped)
        ? data.equipped
        : null;

    if (data.owned && typeof data.owned === "object") {
      for (const gen of CONTENT.generators) {
        state.owned[gen.id] = Math.max(0, Math.floor(num(data.owned[gen.id], 0)));
      }
    }

    // --- 裝備 ---
    // 只留 content.js 裡真的還存在的裝備，等級與稀有度都夾範圍
    const cleanItem = (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const base = Economy.equipById(raw.id);
      if (!base) return null;
      const rarity = CONTENT.rarities.some((r) => r.id === raw.rarity)
        ? raw.rarity : CONTENT.rarities[0].id;
      const level = Math.min(
        Math.max(Math.floor(num(raw.level, 0)), 0),
        CONTENT.refine.maxLevel
      );
      return { id: base.id, rarity, level };
    };

    if (data.equipment && typeof data.equipment === "object") {
      for (const slot of CONTENT.slots) {
        const it = cleanItem(data.equipment[slot.id]);
        // 穿在「兵器」欄的必須真的是兵器，否則加成會錯位
        if (it && Economy.equipById(it.id).slot === slot.id) state.equipment[slot.id] = it;
      }
    }
    if (Array.isArray(data.bag)) {
      state.bag = data.bag.map(cleanItem).filter(Boolean).slice(0, 60);
    }

    // --- 道侶 ---
    if (data.companions && typeof data.companions === "object") {
      for (const c of CONTENT.companions) {
        if (data.companions[c.id]) state.companions[c.id] = true;
      }
    }
    if (Array.isArray(data.team)) {
      // 出戰的必須真的招募過，而且不能重複、不能超過欄位數
      const seen = new Set();
      for (const id of data.team) {
        if (state.companions[id] && !seen.has(id)) { seen.add(id); state.team.push(id); }
      }
      state.team = state.team.slice(0, CONTENT.companionSlots);
    }

    // --- 武學 ---
    const martialMax = Economy.martialMaxLevel();
    if (data.martials && typeof data.martials === "object") {
      for (const m of CONTENT.martials) {
        const lv = Math.floor(num(data.martials[m.id], 0));
        if (lv >= 1) state.martials[m.id] = Math.min(lv, martialMax);
      }
    }
    // 保底計數要夾住：改壞了會讓玩家每抽必新
    state.pity = Math.min(
      Math.max(Math.floor(num(data.pity, 0)), 0),
      CONTENT.gacha.pityCount
    );
    state.draws = Math.max(0, Math.floor(num(data.draws, 0)));
    if (data.redeemed && typeof data.redeemed === "object") {
      for (const k of Object.keys(data.redeemed)) {
        if (data.redeemed[k]) state.redeemed[k] = true;
      }
    }

    // --- 機緣 ---
    // 只留還沒過期的增益。過期的留著只會讓存檔越長越肥。
    const now = Date.now();
    if (data.buffs && typeof data.buffs === "object") {
      for (const o of CONTENT.fortunes.outcomes) {
        const until = num(data.buffs[o.id], 0);
        if (until > now) state.buffs[o.id] = until;
      }
    }

    // 飄在畫面上的那個不跨越關閉存續。
    //
    // 排程要「接續」而不是「重來」：nextFortuneAt 若還在未來就留著，
    // 否則重新排隊。少了這行，重開 App 就等於刷機緣 —— 關掉再開、
    // 關掉再開，一直有新的可以點。
    state.fortune = null;
    state.fortunesClaimed = Math.max(0, Math.floor(num(data.fortunesClaimed, 0)));
    const nextAt = num(data.nextFortuneAt, 0);
    if (nextAt > now) state.nextFortuneAt = nextAt;
    else scheduleFortune(state, now);

    return state;
  }

  function clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      /* 無所謂 */
    }
  }

  // --- 存檔搬家 --------------------------------------------
  //
  // 存檔是綁在「網址」上的：瀏覽器眼中 http://192.168.1.107:8000 和
  // https://你.github.io/… 是兩個完全不同的世界，存檔不會自己跟過去。
  // 所以要能把它變成一串字，帶著走。

  function exportSave(state) {
    const json = JSON.stringify(state);
    // 先轉 UTF-8 再轉 base64 —— btoa 碰到非 ASCII 會直接拋例外
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  // 回傳讀進來的 state，失敗回傳 null（而不是把玩家現有的存檔弄壞）
  function importSave(text) {
    try {
      const bin = atob(String(text).trim());
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
      const data = JSON.parse(json);
      if (!data || typeof data !== "object") return null;

      // 走一趟 localStorage 再讀回來，才會套用 load() 的全部防呆與夾範圍 ——
      // 匯入的字串是使用者貼進來的，不能當成可信資料直接用
      const backup = localStorage.getItem(SAVE_KEY);
      localStorage.setItem(SAVE_KEY, json);
      const loaded = load();
      if (!loaded && backup !== null) localStorage.setItem(SAVE_KEY, backup);
      return loaded;
    } catch (e) {
      return null;
    }
  }

  // 讓時間往前走 seconds 秒，回傳這段時間賺到多少。
  // 主迴圈每一幀呼叫它（seconds 很小），
  // 離線結算也呼叫它（seconds 很大）—— 同一條路徑。
  function advance(state, seconds) {
    if (!(seconds > 0)) return 0;
    const earned = Economy.totalRate(state) * seconds;
    state.money += earned;
    state.totalEarned += earned;
    return earned;
  }

  // 突破境界。這是整個遊戲的主線，也是唯一會毀掉玩家資產的動作，
  // UI 一定要先跳確認框才能呼叫這裡。
  //
  // 成功：靈氣歸零、設施散去、功法散去，換來境界倍率與悟性。
  // 失敗：只有靈氣歸零 —— 境界、設施、功法全部保留。白跑一輪，不掉進度。
  //
  // rng 可以注入，否則隨機性沒辦法測。
  // useTalisman = 玩家在確認框勾了「使用渡劫符」。
  //
  // 條件不足回傳 null；否則回傳 { success, realm, insight, usedTalisman }。
  function breakthrough(state, rng = Math.random, useTalisman = false) {
    const next = Economy.nextRealm(state);
    if (!next || state.money < next.requirement) return null;

    let rate = Economy.successRate(state);
    const insight = Economy.insightGain(state);

    // 只有在「真的會用到」的時候才吃掉一張符：
    // 成功率本來就 100% 還消耗一張，玩家會很幹。
    //
    // Boolean() 不能省：talisman 可能是 undefined（你在 content.js 把渡劫符刪了），
    // 那樣這個運算式會回傳 undefined 而不是 false，回報出去就變成第三種值。
    const talisman = CONTENT.consumables.find((c) => c.effect === "guaranteeBreakthrough");
    const usedTalisman = Boolean(
      useTalisman && rate < 1 && talisman &&
      Economy.consumableCount(state, talisman.id) > 0
    );

    if (usedTalisman) {
      state.consumables[talisman.id] -= 1;
      rate = 1;
    }

    const success = rng() < rate;

    // 不管成敗，囤的靈氣都散了 —— 這就是渡劫的代價
    state.money = 0;

    if (!success) {
      state.failures += 1;
      return { success: false, realm: next, insight: 0, usedTalisman };
    }

    state.realm += 1;
    state.breakthroughs += 1;
    state.insight += insight;
    for (const gen of CONTENT.generators) state.owned[gen.id] = 0;
    state.techniques = {}; // 功法是這一世的積累，帶不走；法寶、靈寵、歷練進度都留著

    // totalEarned 是「歷代累計」，刻意不歸零 —— 那是玩家的總戰績
    return { success: true, realm: next, insight, usedTalisman };
  }

  // --- 機緣 ------------------------------------------------

  function scheduleFortune(state, now, rng = Math.random) {
    const f = CONTENT.fortunes;
    // 還沒領過任何機緣 → 用短間隔，讓玩家先學會這個機制的存在
    const secs = state.fortunesClaimed > 0
      ? f.minInterval + rng() * (f.maxInterval - f.minInterval)
      : f.firstInterval;
    state.nextFortuneAt = now + secs * 1000;
    state.fortune = null;
  }

  // 清掉過期的增益。buffMult 自己也會檢查到期，所以這裡純粹是
  // 不讓存檔裡堆一堆死掉的 key。
  function expireBuffs(state, now) {
    for (const id of Object.keys(state.buffs)) {
      if (!(state.buffs[id] > now)) delete state.buffs[id];
    }
  }

  // 主迴圈每幀呼叫：該生就生、飛走就重新排隊
  function tickFortune(state, now, rng = Math.random) {
    if (state.fortune) {
      if (now >= state.fortune.expires) scheduleFortune(state, now, rng);
      return;
    }
    if (now < state.nextFortuneAt) return;
    // 還沒有任何產量時不生 —— 那時「靈氣爆發」會爆出 0，只會讓人困惑
    if (!(Economy.totalRate(state) > 0)) return;

    const o = Economy.pickFortune(rng);
    state.fortune = {
      id: o.id,
      expires: now + CONTENT.fortunes.lifetime * 1000,
      // 相對位置 0~1，讓 UI 自己換算成像素 —— 存進存檔的不該是像素
      x: 0.12 + rng() * 0.76,
      y: 0.12 + rng() * 0.76,
    };
  }

  // 點到了。回傳 { outcome, amount, material } 給 UI 報喜（或報憂）。
  function claimFortune(state, now, rng = Math.random) {
    if (!state.fortune || now >= state.fortune.expires) return null;
    const o = Economy.fortuneOutcome(state.fortune.id);
    // 要在排程之前加，否則第一顆領完後還是會用短間隔再排一次
    state.fortunesClaimed += 1;
    scheduleFortune(state, now, rng);
    if (!o) return null;

    const result = { outcome: o, amount: 0, material: null };

    if (o.type === "instant") {
      const gain = Economy.totalRate(state) * o.seconds;
      state.money += gain;
      state.totalEarned += gain;
      result.amount = gain;
    } else if (o.type === "buff") {
      state.buffs[o.id] = now + o.duration * 1000;
    } else if (o.type === "materials") {
      // 掉當前這層的材料；全部通關後就給最後一層的
      const layer = Economy.layerAt(state.layer) || CONTENT.layers[CONTENT.layers.length - 1];
      const mat = layer.mobDrop.material;
      state.materials[mat] = (state.materials[mat] || 0) + o.qty;
      result.material = mat;
      result.amount = o.qty;
    }
    return result;
  }

  // --- 歷練（掛機打怪）--------------------------------------

  // 讓戰鬥往前跑 seconds 秒。跟靈氣走同一套時間戳邏輯，
  // 所以主迴圈每幀呼叫它（seconds 很小），離線結算也呼叫它（seconds 很大）。
  //
  // 迴圈是跑「事件」不是跑「幀」：層內的小怪血量都一樣，
  // 所以一次算一隻，總次數頂多是 層數 × (小怪數+1)，跟離線多久無關。
  function advanceCombat(state, seconds, rng = Math.random) {
    const out = { materials: {}, insight: 0, bosses: [], pets: [], drops: [] };
    const p = Economy.power(state);
    if (!(p > 0) || !(seconds > 0)) return out;

    const MOBS = CONTENT.combat.mobsPerLayer;
    const LIMIT = CONTENT.combat.bossTimeLimit;
    const dropMult = Economy.dropMultiplier(state);

    let remain = seconds;
    let guard = 0;

    while (remain > 0 && guard++ < 2000) {
      const layer = Economy.layerAt(state.layer);
      if (!layer) break; // 全部通關了，沒得打了

      const isBoss = state.kills >= MOBS;
      const hp = isBoss ? layer.bossHp : layer.mobHp;

      // Math.max(0, …) 不能省。存檔如果被改壞、讓 dmg 大於血量，
      // need 就會是負數，於是 remain -= need 反而讓剩餘時間變多 ——
      // 迴圈跑滿 2000 次，白送玩家 2000 隻的獎勵。
      // 夾在 0 之後，這種狀態會在下一次擊殺自動修好。
      const need = Math.max(0, (hp - state.dmg) / p); // 還要幾秒才殺得掉

      if (!isBoss) {
        if (need > remain) {
          state.dmg += p * remain;
          break;
        }
        remain -= need;
        state.kills++;
        state.dmg = 0;
        // 魔王上場，計時歸零 —— 不然壞存檔會讓牠一出場就只剩幾秒
        if (state.kills >= MOBS) state.bossTime = 0;
        const qty = Math.max(1, Math.floor(layer.mobDrop.qty * dropMult));
        state.materials[layer.mobDrop.material] =
          (state.materials[layer.mobDrop.material] || 0) + qty;
        out.materials[layer.mobDrop.material] =
          (out.materials[layer.mobDrop.material] || 0) + qty;

        // 小怪有機率掉裝備
        if (rng() < EQUIP_DROP_CHANCE) {
          const got = rollEquipDrop(state, state.layer, rng);
          if (got) out.drops.push(got);
        }
        continue;
      }

      // 戰力不足以在時限內擊殺 → 卡關。
      // 直接收工，不要模擬幾百次「打到超時→重來」，那只是白燒 CPU。
      if (!Economy.canBeatBoss(state, layer)) {
        const t = Math.min(remain, LIMIT - state.bossTime);
        state.dmg += p * t;
        state.bossTime += t;
        if (state.bossTime >= LIMIT - 1e-9) {
          state.dmg = 0;
          state.bossTime = 0;
        }
        break;
      }

      const timeLeft = LIMIT - state.bossTime;
      if (need <= Math.min(remain, timeLeft)) {
        remain -= need;
        state.insight += layer.insight;
        out.insight += layer.insight;
        out.bosses.push(layer);

        // 魔王必掉一件裝備
        const bossDrop = rollEquipDrop(state, state.layer, rng);
        if (bossDrop) out.drops.push(bossDrop);

        // 收服靈寵：打贏的魔王從此跟著你
        if (layer.petId && Economy.petLevel(state, layer.petId) < 1) {
          state.pets[layer.petId] = { level: 1 };
          out.pets.push(layer.petId);
          if (!state.equipped) state.equipped = layer.petId; // 第一隻自動帶上
        }

        state.layer++;
        state.kills = 0;
        state.dmg = 0;
        state.bossTime = 0;
      } else if (timeLeft <= remain) {
        // 超時 → 魔王回滿血重來。
        // 正常情況走不到這（上面已經確認打得動），
        // 但玩家可能打到一半突破，功法散去導致戰力暴跌。
        remain -= timeLeft;
        state.dmg = 0;
        state.bossTime = 0;
      } else {
        state.dmg += p * remain;
        state.bossTime += remain;
        break;
      }
    }
    return out;
  }

  // --- 裝備 ------------------------------------------------

  const BAG_MAX = 60;
  const EQUIP_DROP_CHANCE = 0.12; // 小怪掉裝備的機率（魔王必掉）

  // 打怪掉裝備。回傳掉到的那件（沒掉就 null）。
  function rollEquipDrop(state, layerIdx, rng = Math.random) {
    const pool = Economy.dropsOfLayer(layerIdx);
    if (!pool.length) return null;
    const base = pool[Math.floor(rng() * pool.length) % pool.length];
    const item = { id: base.id, rarity: Economy.pickRarity(rng).id, level: 0 };

    // 空手時自動穿上，省得玩家還要手動裝備第一件
    if (!state.equipment[base.slot]) {
      state.equipment[base.slot] = item;
      return item;
    }
    // 背包滿了就丟掉最差的那件，不要讓它無限長
    if (state.bag.length >= BAG_MAX) {
      const score = (x) => Economy.equipBonus(x, "power") + Economy.equipBonus(x, "rate") * 2;
      let worstAt = 0;
      for (let i = 1; i < state.bag.length; i++) {
        if (score(state.bag[i]) < score(state.bag[worstAt])) worstAt = i;
      }
      if (score(item) <= score(state.bag[worstAt])) return item; // 新的更差，直接不收
      state.bag.splice(worstAt, 1);
    }
    state.bag.push(item);
    return item;
  }

  // 從背包穿上。身上原本那件會回到背包，不會消失。
  function equipItem(state, bagIndex) {
    const it = state.bag[bagIndex];
    if (!it) return false;
    const base = Economy.equipById(it.id);
    if (!base) return false;
    state.bag.splice(bagIndex, 1);
    const old = state.equipment[base.slot];
    state.equipment[base.slot] = it;
    if (old) state.bag.push(old);
    return true;
  }

  function unequipItem(state, slotId) {
    const it = state.equipment[slotId];
    if (!it) return false;
    if (state.bag.length >= BAG_MAX) return false; // 背包滿了就先別脫，免得東西憑空消失
    delete state.equipment[slotId];
    state.bag.push(it);
    return true;
  }

  // 強化身上那件。吃該裝備所屬層數的天才地寶。
  function refineItem(state, slotId) {
    const it = state.equipment[slotId];
    if (!it) return false;
    const base = Economy.equipById(it.id);
    if (!base || it.level >= CONTENT.refine.maxLevel) return false;

    const layer = CONTENT.layers[base.tier];
    if (!layer) return false;
    const mat = layer.mobDrop.material;
    const cost = Economy.refineCost(it.level);
    if ((state.materials[mat] || 0) < cost) return false;

    state.materials[mat] -= cost;
    it.level += 1;
    return true;
  }

  function sellJunk(state) {
    // 把背包裡「比身上那件差」的全部丟掉，換一點悟性
    let n = 0;
    state.bag = state.bag.filter((it) => {
      if (Economy.isUpgrade(state, it)) return true;
      n++;
      return false;
    });
    if (n > 0) state.insight += Math.max(1, Math.floor(n / 3));
    return n;
  }

  // --- 武學抽卡 --------------------------------------------

  const MARTIAL_MAX = Economy.martialMaxLevel();

  // 抽一次的內部實作。回傳 { martial, level, isNew, byPity }。
  function drawOnce(state, rng) {
    const g = CONTENT.gacha;

    // 保底：連續 pityCount 抽沒抽到新的，這一抽強制從「還沒學過的」裡抽。
    // 全學完了 hasUnlearned 為 false，保底自然失效（也沒有意義）。
    const byPity = state.pity >= g.pityCount && Economy.hasUnlearned(state);
    const m = Economy.pickMartial(state, rng, byPity);
    if (!m) return null;

    const cur = state.martials[m.id] || 0;
    const isNew = cur < 1;
    // 重複就鑲一顆勾玉升級 —— 永遠不會白抽。滿級了就到頂不再加。
    state.martials[m.id] = Math.min(cur + 1, MARTIAL_MAX);
    state.draws += 1;

    // 抽到新的就把保底計數歸零，否則 +1（夾在上限，免得存檔壞掉時爆表）
    state.pity = isNew ? 0 : Math.min(state.pity + 1, g.pityCount);

    return { martial: m, level: state.martials[m.id], isNew, byPity };
  }

  // 抽卡。times 是 1 或 10。靈氣不夠回傳 null；否則回傳結果陣列。
  function draw(state, times, rng = Math.random) {
    const n = times >= 10 ? 10 : 1;
    const cost = Economy.drawCost(state, n);
    if (state.money < cost) return null;
    state.money -= cost;

    const results = [];
    for (let i = 0; i < n; i++) {
      const r = drawOnce(state, rng);
      if (r) results.push(r);
    }
    return results;
  }

  // --- 兌換碼 ----------------------------------------------
  //
  // 私人用。原始碼裡不放明碼 —— 只放雜湊值，玩家看原始碼不會直接看到 "5580"。
  // （提醒：這是單機網頁，決心破解的人仍能反推；這只是不讓它明晃晃地躺著。）

  // djb2 字串雜湊，回正整數
  function hashCode(str) {
    let h = 5381;
    const s = String(str).trim();
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }

  // "5580" 的雜湊。test.html 會驗證這個常數對不對，錯了它會紅字。
  const REDEEM_CODES = {
    2088437879: "draws1000", // → 免費叩問 1000 次
  };

  // 回傳 { ok, reason, gained }
  function redeem(state, code) {
    const h = hashCode(code);
    const action = REDEEM_CODES[h];
    if (!action) return { ok: false, reason: "無效的兌換碼" };
    if (!state.redeemed) state.redeemed = {};
    if (state.redeemed[h]) return { ok: false, reason: "這組兌換碼已經用過了" };

    let gained = 0;
    if (action === "draws1000") {
      for (let i = 0; i < CONTENT.redeemDraws; i++) drawOnce(state, Math.random);
      gained = CONTENT.redeemDraws;
    }
    state.redeemed[h] = true;
    return { ok: true, gained };
  }

  // --- 道侶 ------------------------------------------------

  function recruitCompanion(state, id) {
    const c = Economy.companionById(id);
    if (!c || state.companions[id]) return false;
    if (state.insight < c.cost) return false;
    state.insight -= c.cost;
    state.companions[id] = true;
    if (state.team.length < CONTENT.companionSlots) state.team.push(id); // 有空位就直接上場
    return true;
  }

  // 出戰／收回。回傳是否有變化。
  function toggleTeam(state, id) {
    if (!state.companions[id]) return false;
    const at = state.team.indexOf(id);
    if (at >= 0) { state.team.splice(at, 1); return true; }
    if (state.team.length >= CONTENT.companionSlots) return false;
    state.team.push(id);
    return true;
  }

  // --- 靈寵 ------------------------------------------------

  function equipPet(state, id) {
    if (Economy.petLevel(state, id) < 1) return false;
    state.equipped = id;
    return true;
  }

  function buyPet(state, id) {
    const pet = Economy.petById(id);
    if (!pet || !Economy.petBuyable(state, pet)) return false;
    if (state.insight < pet.cost) return false;
    state.insight -= pet.cost;
    state.pets[id] = { level: 1 };
    if (!state.equipped) state.equipped = id;
    return true;
  }

  function feedPet(state, id) {
    const pet = Economy.petById(id);
    if (!pet) return false;
    const lv = Economy.petLevel(state, id);
    if (lv < 1 || lv >= pet.maxLevel) return false;

    const cost = Economy.petUpgradeCost(pet, lv);
    if ((state.materials[pet.material] || 0) < cost) return false;

    state.materials[pet.material] -= cost;
    state.pets[id].level = lv + 1;
    return true;
  }

  // --- 商店 ------------------------------------------------

  function buyConsumable(state, id) {
    const c = CONTENT.consumables.find((x) => x.id === id);
    if (!c || state.insight < c.cost) return false;
    state.insight -= c.cost;
    state.consumables[id] = (state.consumables[id] || 0) + 1;
    return true;
  }

  function buyTechnique(state, id) {
    const f = CONTENT.techniques.find((x) => x.id === id);
    if (!f || !Economy.techniqueAvailable(state, f)) return false;
    if (state.money < f.cost) return false;
    state.money -= f.cost;
    state.techniques[f.id] = true;
    return true;
  }

  function buyTreasure(state, id) {
    const b = CONTENT.treasures.find((x) => x.id === id);
    if (!b || !Economy.treasureAvailable(state, b)) return false;
    if (state.insight < b.cost) return false;
    state.insight -= b.cost;
    state.treasures[b.id] = true;
    return true;
  }

  // 距離上次存檔過了多久（秒），已經套用上限與防呆
  function elapsedSinceSave(state, now) {
    return clampElapsed((now - state.lastSave) / 1000, state);
  }

  // 時間差的共用防呆：
  //  - 負數 = 使用者把系統時鐘往回調 → 一毛都不給
  //  - 超過上限 = 放太久 → 只給到上限為止（上限含法寶加的時數）
  function clampElapsed(seconds, state) {
    if (!(seconds > 0)) return 0;
    return Math.min(seconds, Economy.offlineCapSeconds(state));
  }

  return {
    create, save, load, clear,
    exportSave, importSave,
    advance, advanceCombat, breakthrough,
    buyTechnique, buyTreasure, buyConsumable,
    buyPet, feedPet, equipPet,
    rollEquipDrop, equipItem, unequipItem, refineItem, sellJunk,
    recruitCompanion, toggleTeam,
    draw, redeem,
    tickFortune, claimFortune, scheduleFortune, expireBuffs,
    elapsedSinceSave, clampElapsed,
  };
})();
