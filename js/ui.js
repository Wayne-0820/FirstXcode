// ============================================================
//  畫面。DOM 只在一開始建一次，之後每幀只改文字與 class，
//  不重建節點（重建會讓捲動位置跳掉，也很吃效能）。
//
//  商店各分頁的列也是一次全建好，用 .hidden 開關 ——
//  上架條件會隨玩家進度變動，但節點本身不用動。
// ============================================================

const UI = (() => {
  const el = {};
  const genRows = new Map();
  const techRows = new Map();
  const treaRows = new Map();
  const consRows = new Map();
  const petRows = new Map();
  const matRows = new Map();

  let useTalisman = false;

  const EFFECT_LABEL = {
    power: "戰力",
    allRate: "靈氣產量",
    drop: "天才地寶",
  };

  function $(sel) { return document.querySelector(sel); }

  // --- 建立畫面 --------------------------------------------

  function build(handlers) {
    document.title = CONTENT.title;
    $("#game-title").textContent = CONTENT.title;
    $("#click-button-label").textContent = CONTENT.clickLabel;
    $("#currency-name").textContent = CONTENT.currency.name;
    $("#currency-symbol").textContent = CONTENT.currency.symbol;
    $("#insight-symbol").textContent = CONTENT.insightCurrency.symbol;
    $("#version").textContent = CONTENT.version || "";

    el.money = $("#money");
    el.rate = $("#rate");
    el.realmName = $("#realm-name");
    el.realmMult = $("#realm-mult");
    el.insight = $("#insight");
    el.clickButton = $("#click-button");
    el.clickFx = $("#click-fx");
    el.btButton = $("#breakthrough-button");
    el.btFill = $("#bt-fill");
    el.btLabel = $("#bt-label");
    el.btRate = $("#bt-rate");
    el.btProgress = $("#bt-progress");
    el.buyAmount = $("#buy-amount");
    el.shopHint = $("#shop-hint");
    el.buffs = $("#buffs");
    el.portrait = $("#portrait");
    el.heroPower = $("#hero-power");
    el.heroTeam = $("#hero-team");
    el.fortune = $("#fortune");
    el.fortuneIcon = $("#fortune-icon");
    el.fortuneIcon.textContent = CONTENT.fortunes.icon;

    el.battleLayer = $("#battle-layer");
    el.battlePower = $("#battle-power");
    el.enemyIcon = $("#enemy-icon");
    el.enemyName = $("#enemy-name");
    el.enemyHpFill = $("#enemy-hpfill");
    el.enemyHpText = $("#enemy-hptext");
    el.bossTimer = $("#boss-timer");
    el.battleStuck = $("#battle-stuck");
    el.battleProgress = $("#battle-progress");

    buildClickButton(handlers.onClick);
    buildBuyAmountPicker(handlers.onBuyAmountChange);
    buildTabs();
    buildGeneratorRows(handlers.onBuy);
    buildItemRows("#panel-tech", CONTENT.techniques, techRows, handlers.onBuyTechnique,
      "多蓋幾座修煉設施，就會有對應的功法可以參悟。");
    buildConsumableRows(handlers.onBuyConsumable);
    buildItemRows("#panel-trea", CONTENT.treasures, treaRows, handlers.onBuyTreasure, null);
    buildPetRows(handlers);
    buildMaterialRows();
    buildSlots(handlers);
    buildCompanionRows(handlers);
    $("#sell-junk").addEventListener("click", handlers.onSellJunk);

    // 機緣是限時的，用 pointerdown 才不會慢半拍
    el.fortune.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handlers.onClaimFortune();
    });

    el.btButton.addEventListener("click", handlers.onBreakthroughRequest);
    $("#confirm-cancel").addEventListener("click", () => hideModal("#confirm-modal"));
    $("#confirm-ok").addEventListener("click", () => {
      hideModal("#confirm-modal");
      handlers.onBreakthroughConfirm(useTalisman);
    });
    $("#confirm-talisman").addEventListener("click", () => {
      useTalisman = !useTalisman;
      $("#confirm-talisman").classList.toggle("on", useTalisman);
      $("#talisman-box").textContent = useTalisman ? "✔" : "";
    });
    $("#realmup-ok").addEventListener("click", () => hideModal("#realmup-modal"));
    $("#fail-ok").addEventListener("click", () => hideModal("#fail-modal"));
    $("#offline-ok").addEventListener("click", () => hideModal("#offline-modal"));
    $("#reset-button").addEventListener("click", handlers.onReset);

    $("#transfer-button").addEventListener("click", handlers.onTransferOpen);
    $("#transfer-close").addEventListener("click", () => hideModal("#transfer-modal"));
    $("#transfer-import").addEventListener("click", () =>
      handlers.onTransferImport($("#transfer-text").value));
    $("#transfer-copy").addEventListener("click", copyTransfer);

    setTab("gen");
  }

  function buildClickButton(onClick) {
    // 用 pointerdown 而不是 click：點擊遊戲要的是「手指一碰就有反應」。
    // preventDefault 是必要的，否則 iOS 會再補一個 click，變成點一下加兩次。
    el.clickButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      spawnClickFx(e, onClick());
    });
  }

  function spawnClickFx(e, gained) {
    const fx = document.createElement("div");
    fx.className = "fx";
    fx.textContent = "+" + Economy.formatNumber(gained);
    const rect = el.clickButton.getBoundingClientRect();
    fx.style.left = ((e.clientX || rect.left + rect.width / 2) - rect.left) + "px";
    fx.style.top = ((e.clientY || rect.top + rect.height / 2) - rect.top) + "px";
    el.clickFx.appendChild(fx);
    fx.addEventListener("animationend", () => fx.remove()); // 不然節點會無限累積
  }

  function buildBuyAmountPicker(onChange) {
    for (const a of [
      { value: 1, label: "x1" }, { value: 10, label: "x10" },
      { value: 100, label: "x100" }, { value: "max", label: "最大" },
    ]) {
      const btn = document.createElement("button");
      btn.className = "amount-btn";
      btn.textContent = a.label;
      if (a.value === 1) btn.classList.add("active");
      btn.addEventListener("click", () => {
        el.buyAmount.querySelectorAll(".amount-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        onChange(a.value);
      });
      el.buyAmount.appendChild(btn);
    }
  }

  function buildTabs() {
    for (const tab of document.querySelectorAll("#shop-tabs .tab")) {
      tab.addEventListener("click", () => setTab(tab.dataset.tab));
    }
  }

  function setTab(name) {
    for (const tab of document.querySelectorAll("#shop-tabs .tab")) {
      tab.classList.toggle("active", tab.dataset.tab === name);
    }
    for (const p of ["gen", "tech", "trea", "battle", "gear", "pet", "team"]) {
      $("#panel-" + p).classList.toggle("hidden", p !== name);
    }
    // 數量選擇只對修煉設施有意義：其他東西都是一次一個
    el.buyAmount.classList.toggle("hidden", name !== "gen");
    el.shopHint.textContent =
      name === "tech" ? "靈氣購買・突破後散去"
      : name === "trea" ? "悟性購買・永久保留"
      : name === "battle" ? "掛著它自己會打・離線也在打"
      : name === "gear" ? "打怪掉落・魔王必掉"
      : name === "pet" ? "只能帶一隻・餵天才地寶升級"
      : name === "team" ? `最多帶 ${CONTENT.companionSlots} 位・悟性招募`
      : "";
  }

  function buildGeneratorRows(onBuy) {
    const panel = $("#panel-gen");
    for (const gen of CONTENT.generators) {
      const row = document.createElement("button");
      row.className = "gen-row";
      row.innerHTML = `
        <div class="gen-icon"></div>
        <div class="gen-main">
          <div class="gen-line1"><span class="gen-name"></span><span class="gen-owned"></span></div>
          <div class="gen-desc"></div>
          <div class="gen-line3"><span class="gen-cost"></span><span class="gen-rate"></span></div>
        </div>`;
      row.querySelector(".gen-icon").textContent = gen.icon;
      row.querySelector(".gen-name").textContent = gen.name;
      row.querySelector(".gen-desc").textContent = gen.desc;
      row.addEventListener("click", () => onBuy(gen.id));
      panel.appendChild(row);
      genRows.set(gen.id, {
        root: row,
        owned: row.querySelector(".gen-owned"),
        cost: row.querySelector(".gen-cost"),
        rate: row.querySelector(".gen-rate"),
      });
    }
  }

  // 功法和法寶的列長得一樣，共用一個建構器
  function buildItemRows(panelSel, list, store, onBuy, emptyText) {
    const panel = $(panelSel);
    for (const item of list) {
      const row = document.createElement("button");
      row.className = "item-row";
      row.innerHTML = `
        <div class="item-icon"></div>
        <div class="item-main"><div class="item-name"></div><div class="item-desc"></div></div>
        <div class="item-cost"></div>`;
      row.querySelector(".item-icon").textContent = item.icon;
      row.querySelector(".item-name").textContent = item.name;
      row.querySelector(".item-desc").textContent = item.desc;
      row.addEventListener("click", () => onBuy(item.id));
      panel.appendChild(row);
      store.set(item.id, { root: row, cost: row.querySelector(".item-cost") });
    }
    if (emptyText) {
      const empty = document.createElement("div");
      empty.className = "panel-empty";
      empty.textContent = emptyText;
      panel.appendChild(empty);
      store.set("__empty", { root: empty });
    }
  }

  // 符籙放在法寶分頁最上面。它跟法寶不同：可以重複買、會被用掉。
  function buildConsumableRows(onBuy) {
    const panel = $("#panel-trea");
    const head = document.createElement("div");
    head.className = "section-head";
    head.textContent = "符籙・可囤積";
    panel.appendChild(head);

    for (const c of CONTENT.consumables) {
      const row = document.createElement("button");
      row.className = "item-row";
      row.innerHTML = `
        <div class="item-icon"></div>
        <div class="item-main">
          <div class="item-name"><span class="cons-name"></span><span class="cons-count"></span></div>
          <div class="item-desc"></div>
        </div>
        <div class="item-cost"></div>`;
      row.querySelector(".item-icon").textContent = c.icon;
      row.querySelector(".cons-name").textContent = c.name;
      row.querySelector(".item-desc").textContent = c.desc;
      row.addEventListener("click", () => onBuy(c.id));
      panel.appendChild(row);
      consRows.set(c.id, {
        root: row,
        cost: row.querySelector(".item-cost"),
        count: row.querySelector(".cons-count"),
      });
    }

    const head2 = document.createElement("div");
    head2.className = "section-head";
    head2.textContent = "法寶・永久保留";
    panel.appendChild(head2);
  }

  function buildPetRows(handlers) {
    const panel = $("#panel-pet");
    for (const pet of CONTENT.pets) {
      const row = document.createElement("div");
      row.className = "pet-row";
      row.innerHTML = `
        <div class="pet-icon"></div>
        <div class="pet-main">
          <div class="pet-line1"><span class="pet-name"></span><span class="pet-lv"></span></div>
          <div class="pet-desc"></div>
          <div class="pet-effect"></div>
        </div>
        <div class="pet-actions">
          <button class="pet-equip"></button>
          <button class="pet-feed"></button>
        </div>`;
      row.querySelector(".pet-icon").textContent = pet.icon;
      row.querySelector(".pet-name").textContent = pet.name;
      row.querySelector(".pet-desc").textContent = pet.desc;

      const equipBtn = row.querySelector(".pet-equip");
      const feedBtn = row.querySelector(".pet-feed");
      // 同一顆鈕在「還沒收服」時是請回（花悟性），收服後是帶上。
      // 模式由 render 寫在 dataset 上 —— UI 不該反過來去偷看遊戲狀態。
      equipBtn.addEventListener("click", () => {
        if (equipBtn.dataset.mode === "buy") handlers.onBuyPet(pet.id);
        else handlers.onEquipPet(pet.id);
      });
      feedBtn.addEventListener("click", () => handlers.onFeedPet(pet.id));

      panel.appendChild(row);
      petRows.set(pet.id, {
        root: row,
        lv: row.querySelector(".pet-lv"),
        effect: row.querySelector(".pet-effect"),
        equip: equipBtn,
        feed: feedBtn,
      });
    }
  }

  function buildMaterialRows() {
    const list = $("#materials-list");
    for (const m of CONTENT.materials) {
      const chip = document.createElement("div");
      chip.className = "mat-chip";
      chip.innerHTML = `<span class="mat-icon"></span><span class="mat-name"></span><span class="mat-qty"></span>`;
      chip.querySelector(".mat-icon").textContent = m.icon;
      chip.querySelector(".mat-name").textContent = m.name;
      list.appendChild(chip);
      matRows.set(m.id, { root: chip, qty: chip.querySelector(".mat-qty") });
    }
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "打小怪就會掉。";
    list.appendChild(empty);
    matRows.set("__empty", { root: empty });
  }

  // --- 裝備 ------------------------------------------------

  const slotRows = new Map();

  function buildSlots(handlers) {
    const wrap = $("#slots");
    for (const slot of CONTENT.slots) {
      const row = document.createElement("div");
      row.className = "slot-row";
      row.innerHTML = `
        <div class="slot-icon"></div>
        <div class="slot-main">
          <div class="slot-line1"><span class="slot-name"></span><span class="slot-lv"></span></div>
          <div class="slot-stat"></div>
        </div>
        <button class="slot-refine"></button>`;
      row.querySelector(".slot-icon").textContent = slot.icon;
      row.querySelector(".slot-refine").addEventListener("click", () => handlers.onRefine(slot.id));
      wrap.appendChild(row);
      slotRows.set(slot.id, {
        root: row,
        icon: row.querySelector(".slot-icon"),
        name: row.querySelector(".slot-name"),
        lv: row.querySelector(".slot-lv"),
        stat: row.querySelector(".slot-stat"),
        refine: row.querySelector(".slot-refine"),
      });
    }
  }

  function statText(it) {
    const p = Economy.equipBonus(it, "power");
    const r = Economy.equipBonus(it, "rate");
    const parts = [];
    if (p > 0) parts.push("戰力 +" + Math.round(p * 100) + "%");
    if (r > 0) parts.push("靈氣 +" + Math.round(r * 100) + "%");
    return parts.join("　") || "—";
  }

  function renderSlots(state) {
    let canRefine = 0;
    for (const slot of CONTENT.slots) {
      const r = slotRows.get(slot.id);
      const it = (state.equipment || {})[slot.id];

      if (!it) {
        r.root.classList.add("empty");
        r.icon.textContent = slot.icon;
        r.icon.style.color = "";
        r.name.textContent = slot.name;
        r.name.style.color = "";
        r.lv.textContent = "";
        r.stat.textContent = "尚未穿戴";
        r.refine.textContent = "";
        r.refine.className = "slot-refine hidden";
        continue;
      }

      const base = Economy.equipById(it.id);
      const rar = Economy.rarityById(it.rarity);
      r.root.classList.remove("empty");
      r.icon.textContent = base.icon;
      r.name.textContent = rar.name + base.name;
      r.name.style.color = rar.color;
      r.lv.textContent = it.level > 0 ? "+" + it.level : "";
      r.stat.textContent = statText(it);

      if (it.level >= CONTENT.refine.maxLevel) {
        r.refine.textContent = "已滿";
        r.refine.className = "slot-refine";
        r.refine.disabled = true;
      } else {
        const layer = CONTENT.layers[base.tier];
        const mat = CONTENT.materials.find((m) => m.id === layer.mobDrop.material);
        const cost = Economy.refineCost(it.level);
        const can = (state.materials[mat.id] || 0) >= cost;
        if (can) canRefine++;
        r.refine.textContent = `強化 ${mat.icon}${cost}`;
        r.refine.className = "slot-refine" + (can ? " can" : "");
        r.refine.disabled = !can;
      }
    }
    return canRefine;
  }

  // 背包只有內容變了才重建 —— 但可換裝的數量要記住，
  // 否則沒重建的那幾幀徽章會歸零，看起來像在閃。
  let lastBagKey = "";
  let lastUpgrades = 0;

  function renderBag(state, handlers) {
    const bag = state.bag || [];
    $("#bag-count").textContent = bag.length ? `${bag.length} 件` : "";

    const key = bag.map((i) => i.id + i.rarity + i.level).join(",")
      + "|" + CONTENT.slots.map((s) => {
          const it = (state.equipment || {})[s.id];
          return it ? it.id + it.rarity + it.level : "-";
        }).join(",");
    if (key === lastBagKey) return lastUpgrades;
    lastBagKey = key;

    const wrap = $("#bag");
    wrap.innerHTML = "";
    let upgrades = 0;

    if (!bag.length) {
      const empty = document.createElement("div");
      empty.className = "panel-empty";
      empty.textContent = "打怪就會掉。魔王必掉一件。";
      wrap.appendChild(empty);
      lastUpgrades = 0;
      return 0;
    }

    bag.forEach((it, idx) => {
      const base = Economy.equipById(it.id);
      const rar = Economy.rarityById(it.rarity);
      const better = Economy.isUpgrade(state, it);
      if (better) upgrades++;

      const row = document.createElement("button");
      row.className = "bag-item" + (better ? " better" : "");
      row.innerHTML = `
        <span class="bag-icon">${base.icon}</span>
        <span class="bag-main">
          <span class="bag-name"></span>
          <span class="bag-stat"></span>
        </span>
        <span class="bag-act">${better ? "換上" : "穿"}</span>`;
      const nameEl = row.querySelector(".bag-name");
      nameEl.textContent = rar.name + base.name + (it.level ? " +" + it.level : "");
      nameEl.style.color = rar.color;
      row.querySelector(".bag-stat").textContent = statText(it);
      row.addEventListener("click", () => handlers.onEquipItem(idx));
      wrap.appendChild(row);
    });
    lastUpgrades = upgrades;
    return upgrades;
  }

  // --- 道侶 ------------------------------------------------

  const compRows = new Map();

  function buildCompanionRows(handlers) {
    const panel = $("#panel-team");
    for (const c of CONTENT.companions) {
      const row = document.createElement("div");
      row.className = "comp-row";
      row.innerHTML = `
        <div class="comp-icon"></div>
        <div class="comp-main">
          <div class="comp-name"></div>
          <div class="comp-quote"></div>
          <div class="comp-effect"></div>
        </div>
        <button class="comp-act"></button>`;
      row.querySelector(".comp-icon").textContent = c.icon;
      row.querySelector(".comp-name").textContent = c.name;
      row.querySelector(".comp-quote").textContent = c.quote;
      row.querySelector(".comp-effect").textContent = c.desc;
      const btn = row.querySelector(".comp-act");
      btn.addEventListener("click", () => {
        if (btn.dataset.mode === "recruit") handlers.onRecruit(c.id);
        else handlers.onToggleTeam(c.id);
      });
      panel.appendChild(row);
      compRows.set(c.id, { root: row, act: btn });
    }
  }

  function renderCompanions(state) {
    const team = state.team || [];
    let actionable = 0;

    for (const c of CONTENT.companions) {
      const r = compRows.get(c.id);
      const owned = Economy.companionOwned(state, c.id);
      const onTeam = team.includes(c.id);

      r.root.classList.toggle("owned", owned);
      r.root.classList.toggle("active", onTeam);

      if (!owned) {
        const can = state.insight >= c.cost;
        if (can) actionable++;
        r.act.textContent = `招募 ${CONTENT.insightCurrency.symbol}${c.cost}`;
        r.act.className = "comp-act" + (can ? " can" : "");
        r.act.dataset.mode = "recruit";
        r.act.disabled = !can;
      } else if (onTeam) {
        r.act.textContent = "出戰中";
        r.act.className = "comp-act on";
        r.act.dataset.mode = "toggle";
        r.act.disabled = false;
      } else {
        const full = Economy.teamFull(state);
        r.act.textContent = full ? "隊伍已滿" : "帶上";
        r.act.className = "comp-act" + (full ? "" : " can");
        r.act.dataset.mode = "toggle";
        r.act.disabled = full;
      }
    }

    // 頂上那排小頭像
    const chips = team.map((id) => {
      const c = Economy.companionById(id);
      return c ? `<span class="team-chip">${c.icon}</span>` : "";
    }).join("");
    const slots = CONTENT.companionSlots - team.length;
    el.heroTeam.innerHTML = chips + '<span class="team-chip empty">·</span>'.repeat(Math.max(slots, 0));

    return actionable;
  }

  // --- 每幀更新 --------------------------------------------

  function render(state, buyAmount, handlers) {
    const realm = Economy.currentRealm(state);

    Portrait.render(el.portrait, state); // 只在境界或裝備變了時才重畫
    el.heroPower.textContent = "戰力 " + Economy.formatNumber(Economy.power(state));
    setBadge("#badge-gear", renderSlots(state) + renderBag(state, handlers));
    setBadge("#badge-team", renderCompanions(state));

    el.money.textContent = Economy.formatNumber(state.money);
    el.rate.textContent = "每秒 +" + Economy.formatNumber(Economy.totalRate(state));
    el.realmName.textContent = realm.name;
    el.realmMult.textContent =
      realm.multiplier > 1 ? "修煉 ×" + Economy.formatMultiplier(realm.multiplier) : "";
    el.insight.textContent = Economy.formatCount(state.insight);

    renderBuffs(state);
    renderFortune(state);
    renderBreakthrough(state);
    renderGenerators(state, buyAmount);
    renderItems(state, CONTENT.techniques, techRows, "#badge-tech",
      (f) => Economy.techniqueAvailable(state, f),
      (f) => state.money >= f.cost,
      (f) => CONTENT.currency.symbol + " " + Economy.formatNumber(f.cost));
    renderTreasurePanel(state);
    renderBattle(state);
    renderPets(state);
    renderMaterials(state);
  }

  function renderGenerators(state, buyAmount) {
    for (const gen of CONTENT.generators) {
      const r = genRows.get(gen.id);
      const owned = state.owned[gen.id];

      const n = buyAmount === "max"
        ? Economy.maxAffordable(gen, owned, state.money, state) : buyAmount;
      const cost = Economy.costOfN(gen, owned, Math.max(n, 1), state);
      const affordable = n > 0 && cost <= state.money;

      r.owned.textContent = owned > 0 ? "x" + owned : "";
      // 顯示的產量含全部五層加成，玩家才對得上總速度
      r.rate.textContent = owned > 0
        ? "產出 " + Economy.formatNumber(Economy.genRate(state, gen)) + "/秒"
        : Economy.formatNumber(
            gen.baseRate * Economy.techniqueMult(state, gen.id)
            * Economy.realmMultiplier(state) * Economy.treasureMult(state, "allRate")
            * Economy.petBonus(state, "allRate")
          ) + "/秒 每個";

      const suffix = buyAmount === "max"
        ? (n > 0 ? ` (買 ${n} 個)` : "")
        : (buyAmount > 1 ? ` (${buyAmount} 個)` : "");
      r.cost.textContent = CONTENT.currency.symbol + " " + Economy.formatNumber(cost) + suffix;
      r.root.classList.toggle("affordable", affordable);
      r.root.classList.toggle("locked", !affordable);
    }
  }

  function renderItems(state, list, store, badgeSel, isAvailable, isAffordable, costText) {
    let affordableCount = 0, visibleCount = 0;
    for (const item of list) {
      const r = store.get(item.id);
      const avail = isAvailable(item);
      r.root.classList.toggle("hidden", !avail);
      if (!avail) continue;
      visibleCount++;
      const can = isAffordable(item);
      if (can) affordableCount++;
      r.root.classList.toggle("affordable", can);
      r.root.classList.toggle("locked", !can);
      r.cost.textContent = costText(item);
    }
    if (store.get("__empty")) {
      store.get("__empty").root.classList.toggle("hidden", visibleCount > 0);
    }
    if (badgeSel) setBadge(badgeSel, affordableCount);
    return affordableCount;
  }

  // 法寶分頁同時裝符籙和法寶，徽章要算兩者的總和
  function renderTreasurePanel(state) {
    let count = 0;
    for (const c of CONTENT.consumables) {
      const r = consRows.get(c.id);
      const can = state.insight >= c.cost;
      if (can) count++;
      const owned = Economy.consumableCount(state, c.id);
      r.count.textContent = owned > 0 ? " ×" + owned : "";
      r.cost.textContent = CONTENT.insightCurrency.symbol + " " + c.cost;
      r.root.classList.toggle("affordable", can);
      r.root.classList.toggle("locked", !can);
    }
    count += renderItems(state, CONTENT.treasures, treaRows, null,
      (b) => Economy.treasureAvailable(state, b),
      (b) => state.insight >= b.cost,
      (b) => CONTENT.insightCurrency.symbol + " " + b.cost);
    setBadge("#badge-trea", count);
  }

  function setBadge(sel, count) {
    const badge = $(sel);
    badge.textContent = count > 0 ? count : "";
    badge.classList.toggle("hidden", count === 0);
  }

  // --- 歷練 ------------------------------------------------

  function renderBattle(state) {
    const layer = Economy.layerAt(state.layer);
    el.battlePower.textContent = "戰力 " + Economy.formatNumber(Economy.power(state));

    if (!layer) {
      el.battleLayer.textContent = "已通關";
      el.enemyIcon.textContent = "🏆";
      el.enemyName.textContent = "此界再無敵手";
      el.enemyName.classList.remove("boss");
      el.enemyHpFill.style.width = "0%";
      el.enemyHpText.textContent = "";
      el.bossTimer.textContent = "";
      el.battleStuck.textContent = "";
      el.battleProgress.textContent = `${CONTENT.layers.length} 層全部清空`;
      return;
    }

    const isBoss = state.kills >= CONTENT.combat.mobsPerLayer;
    const hp = isBoss ? layer.bossHp : layer.mobHp;
    const left = Math.max(hp - state.dmg, 0);

    el.battleLayer.textContent = `第 ${state.layer + 1} 層 · ${layer.name}`;
    el.enemyIcon.textContent = isBoss ? layer.bossIcon : layer.mobIcon;
    el.enemyName.textContent = isBoss ? layer.boss : layer.mob;
    el.enemyName.classList.toggle("boss", isBoss);
    el.enemyHpFill.style.width = ((left / hp) * 100).toFixed(1) + "%";
    el.enemyHpFill.classList.toggle("boss", isBoss);
    el.enemyHpText.textContent =
      Economy.formatNumber(left) + " / " + Economy.formatNumber(hp);

    if (!isBoss) {
      el.bossTimer.textContent = "";
      el.battleStuck.textContent = "";
      el.battleProgress.textContent =
        `小怪 ${state.kills} / ${CONTENT.combat.mobsPerLayer}　·　掉落 ${matName(layer.mobDrop.material)}`;
      return;
    }

    el.battleProgress.textContent = "守關魔王";
    if (Economy.canBeatBoss(state, layer)) {
      el.bossTimer.textContent =
        "⏱ " + (CONTENT.combat.bossTimeLimit - state.bossTime).toFixed(1) + "s";
      el.battleStuck.textContent = "";
    } else {
      // 打不過就講清楚差多少，不要讓玩家對著血條乾瞪眼
      el.bossTimer.textContent = "";
      const need = layer.bossHp / CONTENT.combat.bossTimeLimit;
      el.battleStuck.textContent =
        `戰力不足，無法在 ${CONTENT.combat.bossTimeLimit} 秒內擊殺。需要戰力 ${Economy.formatNumber(need)}。`;
    }
  }

  function matName(id) {
    const m = CONTENT.materials.find((x) => x.id === id);
    return m ? m.icon + m.name : "";
  }

  function renderMaterials(state) {
    let any = 0;
    for (const m of CONTENT.materials) {
      const r = matRows.get(m.id);
      const qty = state.materials[m.id] || 0;
      r.root.classList.toggle("hidden", qty <= 0);
      if (qty > 0) { any++; r.qty.textContent = "×" + Economy.formatCount(qty); }
    }
    matRows.get("__empty").root.classList.toggle("hidden", any > 0);
  }

  // --- 靈寵 ------------------------------------------------

  function renderPets(state) {
    let actionable = 0;
    for (const pet of CONTENT.pets) {
      const r = petRows.get(pet.id);
      const lv = Economy.petLevel(state, pet.id);
      const owned = lv >= 1;
      const equipped = state.equipped === pet.id;

      r.root.classList.toggle("owned", owned);
      r.root.classList.toggle("equipped", equipped);

      if (!owned) {
        r.lv.textContent = "";
        if (pet.cost > 0) {
          // 商店靈寵：用悟性請回來
          const can = state.insight >= pet.cost;
          r.effect.textContent =
            `${EFFECT_LABEL[pet.effect]} ×${Economy.formatMultiplier(pet.base)} 起`;
          r.equip.textContent = `請回 ${CONTENT.insightCurrency.symbol}${pet.cost}`;
          r.equip.className = "pet-equip" + (can ? " can" : "");
          r.equip.dataset.mode = "buy";
          r.equip.disabled = !can;
          if (can) actionable++;
        } else {
          // 魔王靈寵：只能打贏才收服得到
          const layer = CONTENT.layers.find((l) => l.petId === pet.id);
          r.effect.textContent = layer ? `打倒「${layer.boss}」收服` : "尚未收服";
          r.equip.textContent = "未收服";
          r.equip.className = "pet-equip";
          r.equip.dataset.mode = "none";
          r.equip.disabled = true;
        }
        r.feed.textContent = "";
        r.feed.className = "pet-feed hidden";
        continue;
      }

      const value = Economy.petValue(pet, lv);
      r.lv.textContent = `Lv.${lv}`;
      r.effect.textContent = `${EFFECT_LABEL[pet.effect]} ×${Economy.formatMultiplier(round2(value))}`;
      r.equip.textContent = equipped ? "已帶上" : "帶上";
      r.equip.className = "pet-equip" + (equipped ? " on" : " can");
      r.equip.dataset.mode = "equip";
      r.equip.disabled = equipped;

      if (Economy.petMaxed(state, pet)) {
        r.feed.textContent = "已滿級";
        r.feed.className = "pet-feed";
        r.feed.disabled = true;
      } else {
        const cost = Economy.petUpgradeCost(pet, lv);
        const have = state.materials[pet.material] || 0;
        const can = have >= cost;
        const mat = CONTENT.materials.find((m) => m.id === pet.material);
        r.feed.textContent = `餵 ${mat.icon}${cost}`;
        r.feed.className = "pet-feed" + (can ? " can" : "");
        r.feed.disabled = !can;
        if (can) actionable++;
      }
    }
    setBadge("#badge-pet", actionable);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // --- 機緣 ------------------------------------------------

  function renderFortune(state) {
    const f = state.fortune;
    if (!f) {
      el.fortune.classList.remove("show");
      return;
    }
    // 存檔裡放的是 0~1 的相對位置，換算成畫面位置 —— 存像素會在轉螢幕時跑掉
    el.fortune.style.left = (f.x * 100).toFixed(2) + "%";
    el.fortune.style.top = (f.y * 100).toFixed(2) + "%";
    el.fortune.classList.add("show");
  }

  let lastBuffHtml = "";

  function renderBuffs(state) {
    const now = Date.now();
    const chips = [];
    for (const o of CONTENT.fortunes.outcomes) {
      if (o.type !== "buff") continue;
      const left = Economy.buffRemaining(state, o.id, now);
      if (left <= 0) continue;
      // value < 1 = 減益，要長得不一樣
      const cls = o.value < 1 ? "buff-chip bad" : "buff-chip";
      chips.push(`<span class="${cls}">${o.icon} ${o.name} ${Math.ceil(left)}s</span>`);
    }
    // 秒數一秒才變一次，不用每幀重建 DOM
    const html = chips.join("");
    if (html !== lastBuffHtml) {
      el.buffs.innerHTML = html;
      lastBuffHtml = html;
    }
  }

  let toastTimer = null;

  function showFortuneResult(result) {
    const o = result.outcome;
    $("#toast-icon").textContent = o.icon;
    $("#toast-title").textContent = o.name;

    let body = o.text;
    if (o.type === "instant") {
      body = "獲得 " + CONTENT.currency.symbol + " " + Economy.formatNumber(result.amount);
    } else if (o.type === "materials") {
      body = matName(result.material) + " ×" + result.amount;
    }
    $("#toast-body").textContent = body;

    const t = $("#toast");
    t.classList.toggle("bad", o.value < 1);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function renderBreakthrough(state) {
    const next = Economy.nextRealm(state);
    if (!next) {
      el.btButton.classList.remove("ready");
      el.btButton.classList.add("maxed");
      el.btButton.disabled = true;
      el.btLabel.textContent = "已臻化境";
      el.btRate.textContent = "";
      el.btProgress.textContent = "";
      el.btFill.style.width = "100%";
      return;
    }

    const ready = Economy.canBreakthrough(state);
    const rate = Economy.successRate(state);

    el.btButton.disabled = false;
    el.btButton.classList.toggle("ready", ready);
    el.btButton.classList.remove("maxed");
    el.btLabel.textContent = ready ? `突破至「${next.name}」` : `距「${next.name}」`;
    el.btRate.textContent = rate < 1 ? "成功率 " + Economy.formatPercent(rate) : "";
    el.btRate.classList.toggle("risky", rate < 0.75);
    el.btProgress.textContent =
      Economy.formatNumber(state.money) + " / " + Economy.formatNumber(next.requirement);
    el.btFill.style.width = (Economy.breakthroughProgress(state) * 100).toFixed(2) + "%";
  }

  // --- 彈窗 ------------------------------------------------

  function showModal(sel) { $(sel).classList.add("show"); }
  function hideModal(sel) { $(sel).classList.remove("show"); }

  function showOffline(earned, seconds, combat) {
    $("#offline-time").textContent = Economy.formatDuration(seconds);
    $("#offline-earned").textContent =
      CONTENT.currency.symbol + " " + Economy.formatNumber(earned);

    // 掛機打怪的成果也一起報，不然玩家不知道它有在跑
    const parts = [];
    if (combat) {
      const mats = Object.entries(combat.materials || {});
      if (mats.length) {
        parts.push(mats.map(([id, q]) => matName(id) + "×" + Economy.formatCount(q)).join("　"));
      }
      if (combat.bosses && combat.bosses.length) {
        parts.push(`擊敗 ${combat.bosses.map((l) => l.boss).join("、")}`);
      }
      if (combat.pets && combat.pets.length) {
        parts.push(`收服 ${combat.pets.map((id) => Economy.petById(id).name).join("、")}`);
      }
      if (combat.insight > 0) {
        parts.push(`${CONTENT.insightCurrency.name} +${combat.insight}`);
      }
    }
    $("#offline-combat").innerHTML = parts.length ? parts.join("<br>") : "";
    showModal("#offline-modal");
  }

  // 突破前把「會失去什麼、會得到什麼、成功率多少」全講清楚再讓他按
  function showBreakthroughConfirm(state) {
    const from = Economy.currentRealm(state);
    const next = Economy.nextRealm(state);
    if (!next) return;

    const rate = Economy.successRate(state);
    $("#confirm-from").textContent = from.name;
    $("#confirm-to").textContent = next.name;
    $("#confirm-rate").textContent = "成功率 " + Economy.formatPercent(rate);
    $("#confirm-rate").classList.toggle("risky", rate < 0.75);
    $("#confirm-lose-money").textContent =
      `${CONTENT.currency.name} ${Economy.formatNumber(state.money)} 歸零`;
    $("#confirm-gain").textContent =
      `修煉速度 ×${Economy.formatMultiplier(from.multiplier)} → ×${Economy.formatMultiplier(next.multiplier)}（永久）`;
    $("#confirm-insight").textContent =
      `獲得 ${CONTENT.insightCurrency.name} +${Economy.insightGain(state)}`;

    // 渡劫符：只在「有符」且「成功率不到 100%」時才給選 ——
    // 穩過的關卡還讓他勾，就是誘導他浪費。
    const talisman = CONTENT.consumables.find((c) => c.effect === "guaranteeBreakthrough");
    const have = talisman ? Economy.consumableCount(state, talisman.id) : 0;
    const toggle = $("#confirm-talisman");
    if (have > 0 && rate < 1) {
      toggle.classList.remove("hidden");
      useTalisman = true; // 預設幫他勾起來，這是他買符的目的
      toggle.classList.add("on");
      $("#talisman-box").textContent = "✔";
      $("#talisman-text").textContent = `使用${talisman.name}（保證成功）・剩 ${have} 張`;
    } else {
      toggle.classList.add("hidden");
      useTalisman = false;
    }
    showModal("#confirm-modal");
  }

  function showRealmUp(realm, insight) {
    $("#realmup-name").textContent = realm.name;
    $("#realmup-note").textContent = realm.note || "";
    $("#realmup-mult").textContent = "修煉 ×" + Economy.formatMultiplier(realm.multiplier);
    $("#realmup-insight").textContent =
      insight > 0 ? `${CONTENT.insightCurrency.symbol} ${CONTENT.insightCurrency.name} +${insight}` : "";
    showModal("#realmup-modal");
  }

  function showFail(realm, lost) {
    $("#fail-name").textContent = realm.name;
    $("#fail-lost").textContent =
      CONTENT.currency.symbol + " " + Economy.formatNumber(lost) + " 潰散";
    showModal("#fail-modal");
  }

  // --- 搬存檔 ----------------------------------------------

  function showTransfer(text) {
    $("#transfer-text").value = text;
    $("#transfer-hint").textContent = "";
    $("#transfer-hint").className = "";
    showModal("#transfer-modal");
  }

  function transferHint(text, ok) {
    const h = $("#transfer-hint");
    h.textContent = text;
    h.className = ok ? "ok" : "bad";
  }

  async function copyTransfer() {
    const ta = $("#transfer-text");
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, 999999); // iOS 不吃單純的 select()

    // navigator.clipboard 只存在於安全情境（HTTPS 或 localhost）。
    // 而你要複製的來源正是區網的 http:// —— 那裡它是 undefined，
    // 所以這個後備不是保險，是主要路徑。
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(ta.value);
        transferHint("已複製", true);
        return;
      }
    } catch (e) {
      /* 掉到下面的後備 */
    }
    try {
      const ok = document.execCommand("copy");
      transferHint(ok ? "已複製" : "複製失敗，請長按上面的字自己選取複製", ok);
    } catch (e) {
      transferHint("複製失敗，請長按上面的字自己選取複製", false);
    }
  }

  function flashSaved() {
    const s = $("#save-status");
    s.classList.add("show");
    setTimeout(() => s.classList.remove("show"), 800);
  }

  return {
    build, render, setTab,
    showOffline, showBreakthroughConfirm, showRealmUp, showFail,
    showFortuneResult, showTransfer, transferHint, flashSaved,
  };
})();
