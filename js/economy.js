// ============================================================
//  經濟計算。這裡全部都是「純函式」：
//  同樣的輸入一定得到同樣的輸出，不碰畫面、不碰存檔。
//  所以 test.html 可以直接對這裡做驗算。
// ============================================================

const Economy = (() => {
  // --- 成本 ------------------------------------------------

  // 境界的「物價」。
  //
  // ★ 這是整個經濟能不能成立的關鍵。
  //
  // 設施的產量會乘上境界倍率，如果價格不跟著漲，回本時間就會隨境界暴跌 ——
  // 到飛昇時一座小千世界要 3.3 億、每秒產 2600 億，0.001 秒回本。
  // 那不叫重建，叫瞬間爆滿，於是後面每一關都只要十幾秒。
  //
  // 讓價格跟著倍率走，回本時間才會在每個境界都一樣，
  // 「重新爬一次」才有意義。
  function costScale(state) {
    return state ? realmMultiplier(state) : 1;
  }

  // 第 owned 個之後，「下一個」要多少錢
  // cost = baseCost × 境界物價 × growth^owned
  function costOf(gen, owned, state) {
    return gen.baseCost * costScale(state) * Math.pow(gen.costGrowth, owned);
  }

  // 一次買 n 個的總價。
  //
  // 這是等比級數和，不是 costOf × n —— 這是放置遊戲最經典的沉默 bug：
  // 算錯了遊戲照跑，但數值全歪，而且很難用肉眼看出來。
  //
  //   Σ(i = owned .. owned+n-1) baseCost × g^i
  //     = baseCost × g^owned × (g^n − 1) / (g − 1)
  function costOfN(gen, owned, n, state) {
    if (n <= 0) return 0;
    const g = gen.costGrowth;
    const base = gen.baseCost * costScale(state);
    // g = 1 表示不漲價，等比級數的公式會除以零，要另外處理
    if (g === 1) return base * n;
    return (base * Math.pow(g, owned) * (Math.pow(g, n) - 1)) / (g - 1);
  }

  // 手上有 money 的話，最多買得起幾個？
  //
  // 把 costOfN 反過來解 n，不要寫迴圈一個一個試 ——
  // 到後期一次買幾萬個時，迴圈會讓畫面卡住。
  //
  //   money ≥ baseCost × g^owned × (g^n − 1) / (g − 1)
  //   ⟹ n ≤ log( money × (g−1) / (baseCost × g^owned) + 1 ) / log(g)
  function maxAffordable(gen, owned, money, state) {
    if (money <= 0) return 0;
    const g = gen.costGrowth;
    const base = gen.baseCost * costScale(state);
    if (g === 1) return Math.floor(money / base);

    const ratio = (money * (g - 1)) / (base * Math.pow(g, owned)) + 1;
    if (ratio <= 1) return 0;

    let n = Math.floor(Math.log(ratio) / Math.log(g));
    if (!isFinite(n) || n < 0) return 0;

    // 浮點數誤差可能讓結果差一個，這裡往兩邊各校正一次，
    // 確保回傳的 n 真的買得起、而 n+1 真的買不起。
    while (n > 0 && costOfN(gen, owned, n, state) > money) n--;
    while (costOfN(gen, owned, n + 1, state) <= money) n++;

    return n;
  }

  // --- 境界 ------------------------------------------------

  // 依索引取境界。存檔可能壞掉，或你在 content.js 裡刪掉了幾個境界，
  // 所以這裡一律夾在合法範圍內，絕不讓它回傳 undefined。
  function realmAt(index) {
    const n = Number(index);
    const i = isFinite(n)
      ? Math.min(Math.max(Math.floor(n), 0), CONTENT.realms.length - 1)
      : 0;
    return CONTENT.realms[i];
  }

  function currentRealm(state) {
    return realmAt(state.realm);
  }

  // 下一個境界；已經是最高境界時回傳 null
  function nextRealm(state) {
    const n = Number(state.realm);
    const i = (isFinite(n) ? Math.floor(n) : 0) + 1;
    return i < CONTENT.realms.length ? CONTENT.realms[i] : null;
  }

  function realmMultiplier(state) {
    return currentRealm(state).multiplier;
  }

  // 突破看的是「當下手上的靈氣」，不是累計 ——
  // 所以靈氣拿去蓋設施、買功法就會離突破更遠，這個取捨是刻意的。
  function canBreakthrough(state) {
    const next = nextRealm(state);
    return next !== null && state.money >= next.requirement;
  }

  // 0 ~ 1，給進度條用
  function breakthroughProgress(state) {
    const next = nextRealm(state);
    if (!next || !(next.requirement > 0)) return 1;
    return Math.min(state.money / next.requirement, 1);
  }

  // 渡劫成功率：境界的基礎值 + 法寶的加成，最高 100%
  function successRate(state) {
    const next = nextRealm(state);
    if (!next) return 1;
    const base = next.successRate === undefined ? 1 : next.successRate;
    return Math.min(base + treasureSum(state, "tribulation"), 1);
  }

  // 突破能拿到多少悟性。
  //
  // 關鍵設計：悟性隨「突破時囤了多少靈氣」成長，但開根號遞減。
  // 所以「馬上衝關」和「多囤一點再衝」是進度與永久戰力之爭 ——
  // 囤 4 倍的靈氣只換到 2 倍悟性，不會失控。
  function insightGain(state) {
    const next = nextRealm(state);
    if (!next || !(next.insight > 0)) return 0;
    const bonus = companionMult(state, "insightGain")
      * martialTotal(state, "insightGain")
      * sectTotal(state, "insightGain");
    if (!(next.requirement > 0)) return Math.floor(next.insight * bonus);
    const ratio = Math.max(state.money / next.requirement, 1);
    return Math.max(1, Math.floor(next.insight * Math.sqrt(ratio) * bonus));
  }

  // --- 功法與法寶的加成 --------------------------------------

  // 功法：買了就生效，但突破時散去。
  // target 可以是修煉設施的 id、"click"（打坐）、"power"（戰力）或 "all"。
  //
  // "all" 只涵蓋修煉設施 —— 它的字面意思是「所有修煉設施」，
  // 不該連打坐和戰力一起加成。這裡明確檢查 target 是不是設施，
  // 而不是用「不等於 click」這種會隨著新目標增加而失守的寫法。
  function techniqueMult(state, target) {
    const owned = state.techniques || {};
    const isGenerator = CONTENT.generators.some((g) => g.id === target);
    let m = 1;
    for (const f of CONTENT.techniques) {
      if (!owned[f.id]) continue;
      if (f.target === target) m *= f.multiplier;
      else if (f.target === "all" && isGenerator) m *= f.multiplier;
    }
    return m;
  }

  // 法寶：永久不滅。乘法類的效果（click / allRate）
  function treasureMult(state, effect) {
    const owned = state.treasures || {};
    let m = 1;
    for (const b of CONTENT.treasures) {
      if (owned[b.id] && b.effect === effect) m *= b.value;
    }
    return m;
  }

  // 法寶：加法類的效果（offlineHours / tribulation / clickShare）
  function treasureSum(state, effect) {
    const owned = state.treasures || {};
    let s = 0;
    for (const b of CONTENT.treasures) {
      if (owned[b.id] && b.effect === effect) s += b.value;
    }
    return s;
  }

  // --- 機緣的增益 --------------------------------------------

  // state.buffs 是 { 機緣 id: 到期時間戳 }。
  // 這裡自己檢查到期，不依賴外面有沒有先清乾淨 ——
  // 過期的增益還在生效是最難查的那種 bug。
  // now 可以注入，否則測不了。
  function buffMult(state, effect, now = Date.now()) {
    const buffs = state.buffs || {};
    let m = 1;
    for (const o of CONTENT.fortunes.outcomes) {
      if (o.type !== "buff" || o.effect !== effect) continue;
      if (buffs[o.id] > now) m *= o.value;
    }
    return m;
  }

  function buffRemaining(state, id, now = Date.now()) {
    const until = (state.buffs || {})[id];
    return until > now ? (until - now) / 1000 : 0;
  }

  function fortuneOutcome(id) {
    return CONTENT.fortunes.outcomes.find((o) => o.id === id) || null;
  }

  // 依 weight 抽一個結果。rng 可以注入，否則隨機性沒辦法測。
  function pickFortune(rng = Math.random) {
    const list = CONTENT.fortunes.outcomes;
    const total = list.reduce((a, o) => a + o.weight, 0);
    let r = rng() * total;
    for (const o of list) {
      r -= o.weight;
      if (r < 0) return o;
    }
    return list[list.length - 1]; // 浮點數誤差的保險
  }

  // --- 靈寵 ------------------------------------------------

  function petById(id) {
    return CONTENT.pets.find((p) => p.id === id) || null;
  }

  // 靈寵的等級（沒養過就是 0 = 還沒收服）
  function petLevel(state, id) {
    const p = (state.pets || {})[id];
    return p ? p.level : 0;
  }

  // 加成 = base + perLevel × (等級 − 1)
  function petValue(pet, level) {
    if (!pet || level < 1) return 1;
    return pet.base + pet.perLevel * (level - 1);
  }

  // 升到下一級要幾個天才地寶
  function petUpgradeCost(pet, level) {
    return pet.materialCost * level;
  }

  function petMaxed(state, pet) {
    return petLevel(state, pet.id) >= pet.maxLevel;
  }

  // 只有「帶在身上」的那一隻才有效果，所以這裡不用把全部加總。
  // 御獸師（petBoost）會再放大靈寵的加成 —— 但只放大「超出 1 的那部分」，
  // 否則沒帶靈寵時也會憑空得到加成。
  function petBonus(state, effect) {
    const id = state.equipped;
    if (!id) return 1;
    const pet = petById(id);
    if (!pet || pet.effect !== effect) return 1;
    const lv = petLevel(state, id);
    if (lv < 1) return 1;
    const raw = petValue(pet, lv);
    return 1 + (raw - 1) * companionMult(state, "petBoost");
  }

  // --- 裝備 ------------------------------------------------

  function equipById(id) {
    return CONTENT.equipment.find((e) => e.id === id) || null;
  }

  function rarityById(id) {
    return CONTENT.rarities.find((r) => r.id === id) || CONTENT.rarities[0];
  }

  // 掉落時抽稀有度。rng 可注入，否則測不了。
  function pickRarity(rng = Math.random) {
    const list = CONTENT.rarities;
    const total = list.reduce((a, r) => a + r.weight, 0);
    let x = rng() * total;
    for (const r of list) {
      x -= r.weight;
      if (x < 0) return r;
    }
    return list[0];
  }

  // 強化倍率：每級 +20% 基礎值
  function refineMult(level) {
    return 1 + Math.max(0, level) * CONTENT.refine.perLevel;
  }

  function refineCost(level) {
    return CONTENT.refine.baseCost * (Math.max(0, level) + 1);
  }

  // 某件裝備「實際」給多少（比例）。it 是存檔裡的 { id, rarity, level }
  function equipBonus(it, kind) {
    const base = equipById(it.id);
    if (!base) return 0;
    const v = base[kind] || 0;
    if (!v) return 0;
    return v * rarityById(it.rarity).mult * refineMult(it.level || 0);
  }

  // 全身裝備的加成總和 → 回傳倍率（1 = 沒穿）
  function equipTotal(state, kind) {
    const worn = state.equipment || {};
    let sum = 0;
    for (const slot of CONTENT.slots) {
      const it = worn[slot.id];
      if (it) sum += equipBonus(it, kind);
    }
    return 1 + sum;
  }

  // 這件是不是比身上那件好？（換裝提示用）
  function isUpgrade(state, it) {
    const base = equipById(it.id);
    if (!base) return false;
    const cur = (state.equipment || {})[base.slot];
    if (!cur) return true;
    // 用「戰力 + 產量」的總和當粗略的強弱指標
    const score = (x) => equipBonus(x, "power") + equipBonus(x, "rate") * 2;
    return score(it) > score(cur);
  }

  // 哪些裝備會從這一層掉
  function dropsOfLayer(layerIdx) {
    return CONTENT.equipment.filter((e) => e.tier === layerIdx);
  }

  // --- 武學（抽卡）------------------------------------------

  const MARTIAL_MAX = CONTENT.gacha.beadsPerColor * CONTENT.gacha.beadTiers.length;

  function martialMaxLevel() { return MARTIAL_MAX; }

  function martialById(id) {
    return CONTENT.martials.find((m) => m.id === id) || null;
  }

  function martialCategory(id) {
    return CONTENT.martialCategories.find((c) => c.id === id) || CONTENT.martialCategories[0];
  }

  function martialLevel(state, id) {
    return (state.martials || {})[id] || 0;
  }

  // 勾玉的顏色與數量。level 1 = 1 顆藍；集滿 5 顆換下一色。
  //   回傳 { tierIdx, name, color, count, full }
  function beadInfo(level) {
    const g = CONTENT.gacha;
    if (level < 1) return { tierIdx: -1, name: "", color: "#3a3f4c", count: 0, full: false };
    const capped = Math.min(level, MARTIAL_MAX);
    const tierIdx = Math.floor((capped - 1) / g.beadsPerColor);
    const count = capped - tierIdx * g.beadsPerColor; // 1..beadsPerColor
    const t = g.beadTiers[tierIdx];
    return { tierIdx, name: t.name, color: t.color, count, full: capped >= MARTIAL_MAX };
  }

  // 等級加成：Lv1 是基礎值，之後每顆勾玉 +perLevel 的基礎值
  function martialValue(m, level) {
    if (level < 1) return 0;
    return m.value * (1 + (level - 1) * CONTENT.gacha.perLevel);
  }

  // 所有已學武學的加成總和 → 回傳倍率（1 = 什麼都沒學）
  function martialTotal(state, effect) {
    const owned = state.martials || {};
    let sum = 0;
    for (const m of CONTENT.martials) {
      if (m.effect !== effect) continue;
      const lv = owned[m.id] || 0;
      if (lv > 0) sum += martialValue(m, lv);
    }
    return 1 + sum;
  }

  // 抽一次要多少靈氣。乘境界物價，所以在每個境界都是有意義的消耗。
  function drawCost(state, times) {
    const g = CONTENT.gacha;
    const base = times >= 10 ? g.tenCost : g.singleCost * times;
    return base * costScale(state);
  }

  // 有沒有還沒學過的武學（保底要用）
  function hasUnlearned(state) {
    const owned = state.martials || {};
    return CONTENT.martials.some((m) => !(owned[m.id] > 0));
  }

  // 依 weight 抽一門武學。onlyNew = 只從「還沒學過的」裡面抽（保底用）。
  function pickMartial(state, rng = Math.random, onlyNew = false) {
    const owned = state.martials || {};
    let pool = CONTENT.martials;
    if (onlyNew) {
      const fresh = pool.filter((m) => !(owned[m.id] > 0));
      if (fresh.length) pool = fresh; // 全學完了就退回一般池
    }
    const total = pool.reduce((a, m) => a + m.weight, 0);
    let x = rng() * total;
    for (const m of pool) {
      x -= m.weight;
      if (x < 0) return m;
    }
    return pool[pool.length - 1];
  }

  // 距離保底還差幾抽
  function pityLeft(state) {
    return Math.max(0, CONTENT.gacha.pityCount - (state.pity || 0));
  }

  // --- 道侶 ------------------------------------------------

  function companionById(id) {
    return CONTENT.companions.find((c) => c.id === id) || null;
  }

  // 帶在身上的道侶（最多 companionSlots 個）的加成，乘起來
  function companionMult(state, effect) {
    const team = state.team || [];
    let m = 1;
    for (const id of team) {
      const c = companionById(id);
      if (c && c.effect === effect) m *= c.value;
    }
    return m;
  }

  function companionOwned(state, id) {
    return !!(state.companions || {})[id];
  }

  function teamFull(state) {
    return (state.team || []).length >= CONTENT.companionSlots;
  }

  // --- 宗門 ------------------------------------------------
  //
  // 弟子跟其他系統最大的不同：加成會「自己隨時間長」。
  // state.disciples 是 { 弟子 id: { cult: 累積修煉秒數 } }，
  // 有這個 key 就代表招募過。道行等級是從 cult 推出來的純函式，
  // 所以 test.html 驗算得到它，離線多久也只是 cult 多加了幾秒。

  function discipleById(id) {
    return CONTENT.disciples.find((d) => d.id === id) || null;
  }

  // 每升一級道行要幾秒（Lv1 在 0 秒）
  function sectSecondsPerLevel() {
    return CONTENT.sect.hoursPerLevel * 3600;
  }

  // 滿級需要累積多少秒 —— 超過這個數再存也沒意義，advanceSect 會夾在這裡
  function sectMaxCult() {
    return (CONTENT.sect.maxLevel - 1) * sectSecondsPerLevel();
  }

  // 弟子的道行等級。沒招募 = 0；招募後至少 Lv1，隨累積修煉時間往上爬。
  function discipleLevel(state, id) {
    const d = (state.disciples || {})[id];
    if (!d) return 0;
    const lv = 1 + Math.floor((d.cult || 0) / sectSecondsPerLevel());
    return Math.min(lv, CONTENT.sect.maxLevel);
  }

  // 加成 = base × (1 + (道行 − 1) × perLevel)。Lv0（沒招募）= 0。
  function discipleValue(disc, level) {
    if (!disc || level < 1) return 0;
    return disc.base * (1 + (level - 1) * CONTENT.sect.perLevel);
  }

  // 全宗門某種效果的加成總和 → 回傳倍率（1 = 沒有任何弟子加這種效果）
  function sectTotal(state, effect) {
    const owned = state.disciples || {};
    let sum = 0;
    for (const d of CONTENT.disciples) {
      if (d.effect !== effect || !owned[d.id]) continue;
      sum += discipleValue(d, discipleLevel(state, d.id));
    }
    return 1 + sum;
  }

  // 宗門等級 = 已招募的弟子數
  function sectRank(state) {
    const owned = state.disciples || {};
    let n = 0;
    for (const d of CONTENT.disciples) if (owned[d.id]) n++;
    return n;
  }

  function sectRankTitle(rank) {
    const list = CONTENT.sect.ranks;
    return list[Math.min(Math.max(Math.floor(rank), 0), list.length - 1)];
  }

  function discipleRecruited(state, id) {
    return !!(state.disciples || {})[id];
  }

  // 能不能招募：還沒收、而且宗門等級到了門檻。
  // 門檻用「已收弟子數」是刻意的 —— 一次攤開八個弟子只會讓人眼花，
  // 收一個解一個，宗門才有「一步步壯大」的感覺。
  function discipleAvailable(state, disc) {
    if (discipleRecruited(state, disc.id)) return false;
    return sectRank(state) >= (disc.requireRank || 0);
  }

  // 距離下一級道行還要幾秒（滿級或沒招募回 0）
  function discipleNextIn(state, id) {
    if (!discipleRecruited(state, id)) return 0;
    if (discipleLevel(state, id) >= CONTENT.sect.maxLevel) return 0;
    const per = sectSecondsPerLevel();
    return per - ((state.disciples[id].cult || 0) % per);
  }

  // --- 歷練 ------------------------------------------------

  function layerAt(index) {
    const n = Number(index);
    if (!isFinite(n) || n < 0 || n >= CONTENT.layers.length) return null;
    return CONTENT.layers[Math.floor(n)];
  }

  // 戰力 = 每秒傷害。境界打底，功法、法寶、靈寵、裝備、道侶各乘一層。
  function power(state) {
    return currentRealm(state).power
      * techniqueMult(state, "power")
      * treasureMult(state, "power")
      * petBonus(state, "power")
      * equipTotal(state, "power")
      * companionMult(state, "power")
      * martialTotal(state, "power")
      * sectTotal(state, "power");
  }

  // 天才地寶的掉落倍率（靈寵 + 道侶 + 武學 + 宗門）
  function dropMultiplier(state) {
    return petBonus(state, "drop")
      * companionMult(state, "drop")
      * martialTotal(state, "drop")
      * sectTotal(state, "drop");
  }

  // 打得動這一層的魔王嗎？時限本質上就是一道戰力門檻。
  function canBeatBoss(state, layer) {
    return power(state) * CONTENT.combat.bossTimeLimit >= layer.bossHp;
  }

  // --- 產量 ------------------------------------------------

  // 純粹的基礎產量，不含任何加成
  function rateOf(gen, owned) {
    return owned * gen.baseRate;
  }

  // 某個設施「實際」每秒產多少 —— 這才是玩家在那一列看到的數字。
  // 基礎 × 功法 × 境界 × 法寶 × 靈寵 × 機緣增益，六層都要算進去。
  function genRate(state, gen) {
    return rateOf(gen, state.owned[gen.id] || 0)
      * techniqueMult(state, gen.id)
      * realmMultiplier(state)
      * treasureMult(state, "allRate")
      * petBonus(state, "allRate")
      * buffMult(state, "allRate")
      * equipTotal(state, "rate")
      * companionMult(state, "allRate")
      * martialTotal(state, "allRate")
      * sectTotal(state, "allRate");
  }

  // 全部加起來每秒產多少
  function totalRate(state) {
    let sum = 0;
    for (const gen of CONTENT.generators) sum += genRate(state, gen);
    return sum;
  }

  // 一次打坐能拿到「幾秒的產量」。法寶可以往上加。
  function clickShare(state) {
    return CONTENT.clickShare + treasureSum(state, "clickShare");
  }

  // 打坐一下得多少。
  //
  // 關鍵在後面那一項：打坐要拿「一段時間的產量」，不能只是個定額。
  // 定額在指數成長的產量面前會迅速歸零 —— 到金丹時，
  // 全滿的定額加成（×90）也只值 0.006 秒的產量。
  //
  // 前面的定額項是前期的底線：那時 totalRate 還是 0，分成算出來也是 0。
  function clickPower(state) {
    // 定額項也要乘境界物價。
    // 少了這個，突破到飛昇後第一座聚靈陣要 9000 萬，而你打坐一次只有 1 ——
    // 手上又是 0 靈氣，等於永遠買不起第一座設施，直接卡死。
    // 乘上去之後，「開局要點幾下才買得起第一座」在每個境界都一樣。
    const flat = CONTENT.clickPower
      * costScale(state)
      * techniqueMult(state, "click")
      * treasureMult(state, "click")
      * companionMult(state, "click")
      * martialTotal(state, "click")
      * sectTotal(state, "click");
    return (flat + totalRate(state) * clickShare(state)) * buffMult(state, "click");
  }

  // 離線收益上限（秒）。基礎值 + 法寶加的小時數。
  function offlineCapSeconds(state) {
    const bonus = state ? treasureSum(state, "offlineHours") : 0;
    return (CONTENT.offlineCapHours + bonus) * 3600;
  }

  // --- 數字顯示 --------------------------------------------

  const SUFFIXES = [
    "", "K", "M", "B", "T",
    "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc",
  ];

  // 1234 → "1.23K"，1234567 → "1.23M"
  function formatNumber(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + formatNumber(-n);
    if (n === 0) return "0";
    if (n < 1) return n.toFixed(2);
    if (n < 1000) {
      // 個位數到百位數：小的時候顯示小數，大的時候不用
      return n < 10 ? n.toFixed(1) : Math.floor(n).toString();
    }

    let tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIXES.length) return n.toExponential(2).replace("e+", "e");

    let text = (n / Math.pow(1000, tier)).toFixed(2);

    // 必須拿「四捨五入之後」的字串來判斷要不要跳階，不能拿原始值。
    // 例：999999.9999 / 1000 = 999.9999…，它沒有 >= 1000，
    // 但 toFixed(2) 會把它捨入成 "1000.00"，於是顯示出 "1000.00K" 這種怪東西。
    if (parseFloat(text) >= 1000 && tier + 1 < SUFFIXES.length) {
      tier++;
      text = (n / Math.pow(1000, tier)).toFixed(2);
    }
    return text + SUFFIXES[tier];
  }

  // 倍率專用。formatNumber 對小於 10 的數會補一位小數（那是為了讓靈氣
  // 看得出來在跳），但倍率是整數，「×3.0」只是雜訊，「×3」才對。
  function formatMultiplier(n) {
    if (isFinite(n) && n < 1000 && Number.isInteger(n)) return String(n);
    return formatNumber(n);
  }

  // 整數數量專用（悟性、次數…）。理由同上：悟性是整數，「6.0」只是雜訊。
  function formatCount(n) {
    if (isFinite(n) && n < 1000) return String(Math.floor(n));
    return formatNumber(n);
  }

  // 0.85 → "85%"
  function formatPercent(n) {
    return Math.round(n * 100) + "%";
  }

  // --- 商店的上架判斷 ----------------------------------------

  // 功法要不要出現在商店：還沒買，而且已經擁有足夠數量的加成目標。
  // 一開始就把二十個功法全攤出來，玩家只會眼花。
  function techniqueAvailable(state, f) {
    if ((state.techniques || {})[f.id]) return false;
    const req = f.requireOwned || 0;
    if (req <= 0) return true;
    return (state.owned[f.target] || 0) >= req;
  }

  function treasureAvailable(state, b) {
    return !(state.treasures || {})[b.id];
  }

  // 商店靈寵：有 cost 的才在商店賣，沒 cost 的要靠打魔王收服
  function petBuyable(state, pet) {
    return pet.cost > 0 && petLevel(state, pet.id) < 1;
  }

  function consumableCount(state, id) {
    return (state.consumables || {})[id] || 0;
  }

  // 把秒數講成人話：3725 → "1 小時 2 分"
  function formatDuration(seconds) {
    const s = Math.floor(seconds);
    if (s < 60) return `${s} 秒`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} 分 ${s % 60} 秒`;
    const h = Math.floor(m / 60);
    return `${h} 小時 ${m % 60} 分`;
  }

  return {
    costOf,
    costOfN,
    maxAffordable,
    costScale,
    realmAt,
    currentRealm,
    nextRealm,
    realmMultiplier,
    canBreakthrough,
    breakthroughProgress,
    successRate,
    insightGain,
    techniqueMult,
    treasureMult,
    treasureSum,
    techniqueAvailable,
    treasureAvailable,
    petBuyable,
    consumableCount,
    petById,
    petLevel,
    petValue,
    petUpgradeCost,
    petMaxed,
    petBonus,
    equipById, rarityById, pickRarity,
    refineMult, refineCost, equipBonus, equipTotal, isUpgrade, dropsOfLayer,
    companionById, companionMult, companionOwned, teamFull,
    discipleById, discipleLevel, discipleValue, sectTotal, sectRank, sectRankTitle,
    discipleRecruited, discipleAvailable, discipleNextIn, sectSecondsPerLevel, sectMaxCult,
    martialById, martialCategory, martialLevel, martialValue, martialTotal,
    martialMaxLevel, beadInfo, drawCost, hasUnlearned, pickMartial, pityLeft,
    layerAt,
    power,
    dropMultiplier,
    canBeatBoss,
    buffMult,
    buffRemaining,
    fortuneOutcome,
    pickFortune,
    rateOf,
    genRate,
    totalRate,
    clickShare,
    clickPower,
    offlineCapSeconds,
    formatNumber,
    formatMultiplier,
    formatCount,
    formatPercent,
    formatDuration,
  };
})();
