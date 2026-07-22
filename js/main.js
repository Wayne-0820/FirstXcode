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

  let handlers; // render 要用它幫背包的列綁事件

  function init() {
    const loaded = State.load();
    let offlineSeconds = 0;
    let offlineEarned = 0;

    let offlineCombat = null;

    if (loaded) {
      state = loaded;
      // 先把過期的增益清掉再結算 —— 不然一個 60 秒的增益會套用到整段離線時間
      State.expireBuffs(state, Date.now());
      // 宗門先補：弟子的道行不吃離線上限，放多久長多久。
      // 放在算離線收益之前，這段離線的產量就用「長大之後」的宗門加成算（對玩家寬鬆）。
      State.advanceSect(state, Math.max(0, (Date.now() - state.lastSave) / 1000));
      // 上次存檔到現在的這段時間，一次補給玩家 —— 修煉和歷練都要算
      offlineSeconds = State.elapsedSinceSave(state, Date.now());
      offlineEarned = State.advance(state, offlineSeconds);
      offlineCombat = State.advanceCombat(state, offlineSeconds);
    } else {
      state = State.create();
      State.scheduleFortune(state, Date.now());
    }

    handlers = {
      onClick,
      onBuy,
      onBuyTechnique,
      onBuyTreasure,
      onBuyConsumable,
      onBuyPet,
      onFeedPet,
      onEquipPet,
      onClaimFortune,
      onEquipItem,
      onRefine,
      onSellJunk,
      onRecruit,
      onToggleTeam,
      onRecruitDisciple,
      onDraw,
      onRedeem,
      onBuyAmountChange,
      onBreakthroughRequest,
      onBreakthroughConfirm,
      onTransferOpen,
      onTransferImport,
      onToggleSound,
      onReset,
    };
    UI.build(handlers);

    // iOS 要先有一次使用者手勢，音訊才能啟動。第一次點畫面時解鎖，之後就接上了。
    // 用「捕獲階段」(true)，這樣它會搶在按鈕自己的 pointerdown 之前跑 ——
    // 於是連「第一下打坐」都出得了聲，不會白按一下才開始響。
    const unlockAudio = () => { Sound.unlock(); document.removeEventListener("pointerdown", unlockAudio, true); };
    document.addEventListener("pointerdown", unlockAudio, true);

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
    // rawDt 沒夾上限，專門給宗門用 —— 切到背景很久再回來，弟子的道行要照實補。
    const rawDt = Math.max(0, (now - lastTick) / 1000);
    const dt = State.clampElapsed((now - lastTick) / 1000, state);
    lastTick = now;

    State.expireBuffs(state, now);
    State.advanceSect(state, rawDt);
    const earned = State.advance(state, dt);
    const combat = State.advanceCombat(state, dt);
    const hadFortune = !!state.fortune;
    State.tickFortune(state, now);

    // 音效只給「即時」發生的事。離線那一大段結算走的是 init，那時音訊還沒
    // 解鎖、本來也不會響 —— 這裡再用 dt 門檻擋一次，切背景很久回來也不連珠炮。
    if (!hadFortune && state.fortune) Sound.fortune();
    if (dt < OFFLINE_POPUP_THRESHOLD_SEC) {
      if (combat.bosses.length) Sound.boss();
      if (combat.pets.length) Sound.pet();
    }

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

    UI.render(state, buyAmount, handlers);
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
    Sound.click();
    return gain;
  }

  function onBuyTechnique(id) {
    if (State.buyTechnique(state, id)) Sound.confirm();
  }

  function onBuyTreasure(id) {
    if (State.buyTreasure(state, id)) Sound.confirm();
  }

  function onBuyConsumable(id) {
    if (State.buyConsumable(state, id)) Sound.confirm();
  }

  function onBuyPet(id) {
    if (State.buyPet(state, id)) Sound.confirm();
  }

  function onFeedPet(id) {
    if (State.feedPet(state, id)) Sound.upgrade();
  }

  function onEquipPet(id) {
    if (State.equipPet(state, id)) Sound.blip();
  }

  function onClaimFortune() {
    const result = State.claimFortune(state, Date.now());
    if (result) {
      // 心魔（buff 且 value < 1）是唯一的壞結果，聲音要悶
      const bad = result.outcome && result.outcome.value < 1;
      Sound.claim(!bad);
      UI.showFortuneResult(result);
    }
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
    Sound.buy();
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

    if (result.success) {
      Sound.breakthrough();
      UI.showRealmUp(result.realm, result.insight);
    } else {
      Sound.fail();
      UI.showFail(result.realm, lost);
    }
  }

  function onEquipItem(idx) { if (State.equipItem(state, idx)) Sound.blip(); }
  function onRefine(slotId) { if (State.refineItem(state, slotId)) Sound.upgrade(); }
  function onSellJunk() {
    const n = State.sellJunk(state);
    if (n > 0) { UI.flashSaved(); Sound.blip(); }
  }
  function onRecruit(id) { if (State.recruitCompanion(state, id)) Sound.confirm(); }
  function onToggleTeam(id) { if (State.toggleTeam(state, id)) Sound.blip(); }
  function onRecruitDisciple(id) { if (State.recruitDisciple(state, id)) Sound.confirm(); }
  function onToggleSound() { Sound.toggle(); }

  function onDraw(times) {
    const results = State.draw(state, times);
    if (!results) return; // 靈氣不夠，畫面上按鈕本來就是暗的
    State.save(state);
    lastAutosave = Date.now();
    Sound.draw();
    if (results.some((r) => r.isNew)) Sound.drawNew(); // 抽到新武學再疊一段顯化
    UI.showDrawResults(results);
  }

  function onRedeem(code) {
    const r = State.redeem(state, code);
    if (r.ok) {
      State.save(state);
      lastAutosave = Date.now();
      Sound.confirm();
      UI.showRedeemHint(`兌換成功：叩問石碑 ${r.gained} 次`, true);
    } else {
      UI.showRedeemHint(r.reason, false);
    }
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
    Portrait.reset(); // 匯入的存檔境界與裝備都不同，立繪要重畫
    lastTick = Date.now();
    lastAutosave = Date.now();
    UI.transferHint("匯入成功，進度已接上", true);
  }

  function onReset() {
    if (!confirm("確定要清掉存檔、從頭開始嗎？這個動作無法復原。")) return;
    State.clear();
    state = State.create();
    State.scheduleFortune(state, Date.now());
    Portrait.reset(); // 不重設的話會留著舊境界的立繪
    lastTick = Date.now();
    lastAutosave = Date.now();
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", Game.init);
