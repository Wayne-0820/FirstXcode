// ============================================================
//  主迴圈與組裝。
// ============================================================

const Game = (() => {
  let state;
  let lastTick;
  let lastAutosave;
  let buyAmount = 1; // 1 / 10 / 100 / "max"

  const AUTOSAVE_INTERVAL_MS = 10000;
  const OFFLINE_POPUP_THRESHOLD_SEC = 60;

  function init() {
    const loaded = State.load();
    let offlineSeconds = 0;
    let offlineEarned = 0;

    let offlineCombat = null;

    if (loaded) {
      state = loaded;
      // 先把過期的增益清掉再結算 —— 不然一個 60 秒的增益會套用到整段離線時間
      State.expireBuffs(state, Date.now());
      // 上次存檔到現在的這段時間，一次補給玩家 —— 修煉和歷練都要算
      offlineSeconds = State.elapsedSinceSave(state, Date.now());
      offlineEarned = State.advance(state, offlineSeconds);
      offlineCombat = State.advanceCombat(state, offlineSeconds);
    } else {
      state = State.create();
      State.scheduleFortune(state, Date.now());
    }

    UI.build({
      onClick,
      onBuy,
      onBuyTechnique,
      onBuyTreasure,
      onBuyConsumable,
      onBuyPet,
      onFeedPet,
      onEquipPet,
      onClaimFortune,
      onBuyAmountChange,
      onBreakthroughRequest,
      onBreakthroughConfirm,
      onTransferOpen,
      onTransferImport,
      onReset,
    });

    if (offlineSeconds >= OFFLINE_POPUP_THRESHOLD_SEC && offlineEarned > 0) {
      UI.showOffline(offlineEarned, offlineSeconds, offlineCombat);
    }

    installSaveHooks();

    lastTick = Date.now();
    lastAutosave = Date.now();
    requestAnimationFrame(loop);
  }

  function loop() {
    const now = Date.now();

    // 一律用時間戳記算差值，絕不累加幀數。
    // 這樣不管螢幕更新率是多少、有沒有掉幀，產量都一樣。
    const dt = State.clampElapsed((now - lastTick) / 1000, state);
    lastTick = now;

    State.expireBuffs(state, now);
    const earned = State.advance(state, dt);
    const combat = State.advanceCombat(state, dt);
    State.tickFortune(state, now);

    // 分頁被切走 / 手機鎖屏時 requestAnimationFrame 會停住，
    // 回來的第一幀 dt 就是「整段背景時間」——所以背景收益不需要任何額外程式碼，
    // 跟離線收益走的是同一行。只是若離開超過一分鐘，順便跳個結算給玩家看。
    if (dt >= OFFLINE_POPUP_THRESHOLD_SEC && earned > 0) {
      UI.showOffline(earned, dt, combat);
    }

    if (now - lastAutosave >= AUTOSAVE_INTERVAL_MS) {
      State.save(state);
      lastAutosave = now;
      UI.flashSaved();
    }

    UI.render(state, buyAmount);
    requestAnimationFrame(loop);
  }

  function installSaveHooks() {
    const saveNow = () => {
      State.save(state);
      lastAutosave = Date.now();
    };

    // iOS Safari 不會可靠地觸發 beforeunload。在 iPhone 上把 App 往上滑掉、
    // 切到別的 App、或直接鎖屏，能指望的只有這兩個事件。
    // 兩個都掛是因為它們各自會在不同情境下漏掉。
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveNow();
    });
    window.addEventListener("pagehide", saveNow);
  }

  // --- 玩家操作 --------------------------------------------

  // 回傳這一下賺到多少，讓畫面上冒出來的數字跟實際加成一致
  function onClick() {
    const gain = Economy.clickPower(state);
    state.money += gain;
    state.totalEarned += gain;
    state.clicks++;
    return gain;
  }

  function onBuyTechnique(id) {
    State.buyTechnique(state, id);
  }

  function onBuyTreasure(id) {
    State.buyTreasure(state, id);
  }

  function onBuyConsumable(id) {
    State.buyConsumable(state, id);
  }

  function onBuyPet(id) {
    State.buyPet(state, id);
  }

  function onFeedPet(id) {
    State.feedPet(state, id);
  }

  function onEquipPet(id) {
    State.equipPet(state, id);
  }

  function onClaimFortune() {
    const result = State.claimFortune(state, Date.now());
    if (result) UI.showFortuneResult(result);
  }

  function onBuy(genId) {
    const gen = CONTENT.generators.find((g) => g.id === genId);
    if (!gen) return;

    const owned = state.owned[genId];
    const n = buyAmount === "max"
      ? Economy.maxAffordable(gen, owned, state.money, state)
      : buyAmount;
    if (n <= 0) return;

    const cost = Economy.costOfN(gen, owned, n, state);
    if (cost > state.money) return; // 買不起就整筆不成交，不做部分購買

    state.money -= cost;
    state.owned[genId] = owned + n;
  }

  function onBuyAmountChange(value) {
    buyAmount = value;
  }

  // 按下突破鈕：先確認，不直接執行
  function onBreakthroughRequest() {
    if (!Economy.canBreakthrough(state)) return;
    UI.showBreakthroughConfirm(state);
  }

  // 使用者在確認框按了「衝關」才真的執行。
  // useTalisman = 他在確認框裡勾了「使用渡劫符」。
  function onBreakthroughConfirm(useTalisman) {
    const lost = state.money; // 先記下來，失敗畫面要顯示潰散了多少

    // 從跳出確認框到按下衝關之間，靈氣可能被拿去買東西而變得不夠，
    // 所以這裡要重新檢查一次，不能信任 UI 的狀態。
    const result = State.breakthrough(state, Math.random, useTalisman);
    if (!result) return;

    // 渡劫是有機率失敗的，成敗都立刻存檔 ——
    // 不然玩家發現失敗就把 App 殺掉重開，等於免費重骰。
    State.save(state);
    lastAutosave = Date.now();

    if (result.success) UI.showRealmUp(result.realm, result.insight);
    else UI.showFail(result.realm, lost);
  }

  function onTransferOpen() {
    State.save(state); // 先存一次，匯出的才是當下最新的進度
    lastAutosave = Date.now();
    UI.showTransfer(State.exportSave(state));
  }

  function onTransferImport(text) {
    const loaded = State.importSave(text);
    if (!loaded) {
      UI.transferHint("這串字看起來不對，什麼都沒有動", false);
      return;
    }
    state = loaded;
    lastTick = Date.now();
    lastAutosave = Date.now();
    UI.transferHint("匯入成功，進度已接上", true);
  }

  function onReset() {
    if (!confirm("確定要清掉存檔、從頭開始嗎？這個動作無法復原。")) return;
    State.clear();
    state = State.create();
    lastTick = Date.now();
    lastAutosave = Date.now();
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", Game.init);
