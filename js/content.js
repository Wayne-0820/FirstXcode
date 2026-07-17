// ============================================================
//  這個檔案是「遊戲內容」，是你的地盤。
//  境界、修煉設施、功法、法寶，全部的名字和數值都在這裡。
//  改完存檔，回瀏覽器重新整理就會生效。
//
//  ※ 改了數值之後舊存檔還在，想從頭玩就按畫面最下面的「重置存檔」。
//  ※ 改完記得開 test.html 看一眼，它會抓出寫壞的設定。
// ============================================================

const CONTENT = {
  title: "問道",

  // 版本標記：顯示在畫面最下面。
  // 存在的理由很實際 —— 手機（尤其是從主畫面啟動的）有可能拿到舊的快取版本，
  // 而你我都沒辦法從畫面上分辨「這是舊版」還是「新功能還沒觸發」。
  // 有這行就一眼分得出來。改東西時順手把它加一。
  version: "v7 · 機緣",

  // 兩種貨幣：
  //   靈氣 —— 修煉賺來的，買修煉設施和功法。突破時歸零。
  //   悟性 —— 只有突破才拿得到，買法寶。永遠不會消失。
  currency: { name: "靈氣", symbol: "☯" },
  // ✦ 是純文字字元，可以用 CSS 上紫色 —— emoji 沒辦法著色
  insightCurrency: { name: "悟性", symbol: "✦" },

  // ----------------------------------------------------------
  //  打坐 = clickPower（定額底線）+ 每秒產量 × clickShare
  //
  //  ★ clickShare 是這個遊戲最重要的一個數字。
  //    沒有它，打坐就是個「固定數字」，而產量是指數成長的
  //    （境界倍率一路從 ×1 到 ×6,000,000）——
  //    到了金丹，狂點一百下還不如放著不動半秒，打坐直接變成裝飾品。
  //    改成給「一段時間的產量」之後，它在任何境界都值同樣的秒數。
  //
  //  clickPower 是前期的底線：那時還沒有任何產量，分成算出來是 0。
  // ----------------------------------------------------------
  clickPower: 1,
  clickShare: 0.02, // 一次打坐 = 2% 的每秒產量（法寶可以往上加）
  clickLabel: "打 坐",

  // 離線收益的基礎上限（小時）。法寶可以往上加。
  offlineCapHours: 8,

  // ----------------------------------------------------------
  //  機緣：每隔一段時間，畫面上會飄出一個東西，限時內點到就觸發。
  //  這是「打坐」之外唯一需要你人在的機制，也是回來看一眼的理由。
  //
  //  minInterval / maxInterval : 間隔幾秒（會在這區間隨機）
  //  lifetime                  : 停留幾秒，沒點到就飛走
  //
  //  outcomes 的 weight 是相對權重，不用加起來等於 100。
  //  type 有三種：
  //    "instant"   立刻獲得 seconds 秒的產量
  //    "buff"      duration 秒內，effect 乘上 value
  //                （effect 只能是 "click" 或 "allRate"）
  //    "materials" 當前這層的天才地寶 ×qty
  // ----------------------------------------------------------
  fortunes: {
    // 飄出來時一律顯示這個，點下去才揭曉是什麼。
    // 直接顯示結果的話沒人會去點心魔，那個壞結果就形同虛設 ——
    // 而「伸手抓機緣、可能是陷阱」本來就是修真的味道。
    icon: "🌀",
    // 第一顆（還沒領過任何機緣時）來得快一點。
    // 否則新玩家會先經歷四分鐘的「什麼都沒發生」，然後一顆球突然冒出來，
    // 完全不知道那是什麼、也不知道有時限。領過一次之後就恢復正常間隔。
    firstInterval: 25,
    minInterval: 100,
    maxInterval: 260,
    lifetime: 12,
    outcomes: [
      { id: "burst", name: "靈氣爆發", icon: "💫", weight: 40,
        type: "instant", seconds: 600,
        text: "十分鐘的修為，一瞬入體。" },
      { id: "insight", name: "頓悟", icon: "🌟", weight: 24,
        type: "buff", effect: "click", value: 7, duration: 60,
        text: "60 秒內，打坐所得 ×7。" },
      { id: "muse", name: "靈感", icon: "✨", weight: 18,
        type: "buff", effect: "allRate", value: 7, duration: 60,
        text: "60 秒內，修煉速度 ×7。" },
      { id: "windfall", name: "天降橫財", icon: "🎁", weight: 12,
        type: "materials", qty: 5,
        text: "天才地寶從天而降。" },
      // 唯一的壞結果。機率低，但讓「要不要點」多一分猶豫。
      { id: "demon", name: "心魔", icon: "😈", weight: 6,
        type: "buff", effect: "allRate", value: 0.5, duration: 60,
        text: "心神動搖，60 秒內修煉減半。" },
    ],
  },

  // ----------------------------------------------------------
  //  打怪的兩個旋鈕
  //
  //  魔王的「時限」其實就是一道戰力門檻：
  //  戰力 × bossTimeLimit >= 魔王血量，才殺得掉。
  //  打不過就會一直卡在那一層，直到你變強。
  // ----------------------------------------------------------
  combat: {
    mobsPerLayer: 10,   // 每層要先清幾隻小怪才會出現魔王
    bossTimeLimit: 30,  // 魔王的時限（秒）。超時就回滿血重來
  },

  // ----------------------------------------------------------
  //  境界：遊戲的主線。
  //
  //  突破條件是「手上真的持有 requirement 這麼多靈氣」，
  //  所以每一局都要取捨：靈氣拿去蓋設施、買功法，還是存起來衝關？
  //
  //  突破成功：靈氣歸零、設施散去、功法散去，換來永久的 multiplier 和悟性。
  //  突破失敗：只有靈氣歸零，境界、設施、功法全部保留 —— 白跑一輪，不掉進度。
  //
  //  name        : 境界名稱
  //  requirement : 突破「進入」這個境界需要多少靈氣（第一個必須是 0）
  //  multiplier  : 到達後修煉速度變成幾倍（總倍率，不是疊加）
  //  insight     : 突破到這裡的悟性基礎值
  //  successRate : 成功率（1 = 一定成功）。法寶可以往上加。
  //  note        : 突破時跳出來的一句話
  //
  //  ★ 節奏旋鈕：requirement 每階 ×10、multiplier 每階 ×5
  //    → 每個境界約花上一個境界的 2 倍時間。
  //    test.html 最下面會直接印出這個倍數，調完看那行最快。
  // ----------------------------------------------------------
  //  power       : 這個境界的基礎戰力（打怪用，等於每秒傷害）
  realms: [
    { name: "凡人", requirement: 0,    multiplier: 1,     insight: 0,  successRate: 1,    power: 1,
      note: "肉體凡胎，尚未窺得門徑。" },
    { name: "煉氣", requirement: 1e3,  multiplier: 3,     insight: 1,  successRate: 1,    power: 5,
      note: "靈氣入體，總算摸到了修行的邊。" },
    { name: "築基", requirement: 1e4,  multiplier: 15,    insight: 2,  successRate: 1,    power: 25,
      note: "根基已固，從此不再是凡人。" },
    { name: "金丹", requirement: 1e5,  multiplier: 75,    insight: 3,  successRate: 1,    power: 120,
      note: "靈氣凝而成丹，壽元大增。" },
    { name: "元嬰", requirement: 1e6,  multiplier: 375,   insight: 5,  successRate: 0.95, power: 600,
      note: "丹碎嬰生，縱使肉身毀去亦能重塑。" },
    { name: "化神", requirement: 1e7,  multiplier: 1900,  insight: 8,  successRate: 0.9,  power: 3000,
      note: "神識化形，一念之間可及百里。" },
    { name: "煉虛", requirement: 1e8,  multiplier: 9500,  insight: 12, successRate: 0.85, power: 15000,
      note: "煉虛合道，開始觸碰天地規則。" },
    { name: "合體", requirement: 1e9,  multiplier: 48000, insight: 18, successRate: 0.8,  power: 75000,
      note: "與天地共鳴，舉手投足皆是法則。" },
    { name: "大乘", requirement: 1e10, multiplier: 240000, insight: 27, successRate: 0.7, power: 4e5,
      note: "此界已無可修之物，只待天劫。" },
    { name: "渡劫", requirement: 1e11, multiplier: 1.2e6, insight: 40, successRate: 0.55, power: 2e6,
      note: "九天雷劫加身，成則登仙，敗則道消。" },
    { name: "飛昇", requirement: 1e12, multiplier: 6e6,   insight: 60, successRate: 0.4,  power: 1e7,
      note: "白日飛昇，此間再無你的傳說。" },
  ],

  // ----------------------------------------------------------
  //  天才地寶：掛機打小怪掉的材料，用來餵靈寵升級。
  //  每一層掉自己那一種，所以想養某隻靈寵就得去打對應的層。
  // ----------------------------------------------------------
  materials: [
    { id: "m_dew",    name: "朝露草",   icon: "🌿" },
    { id: "m_fungus", name: "赤血芝",   icon: "🍄" },
    { id: "m_ice",    name: "玄冰髓",   icon: "🧊" },
    { id: "m_fruit",  name: "龍涎果",   icon: "🍐" },
    { id: "m_flower", name: "幽冥花",   icon: "🌸" },
    { id: "m_core",   name: "妖丹",     icon: "🔴" },
    { id: "m_bone",   name: "天魔骨",   icon: "🦴" },
    { id: "m_jade",   name: "崑崙玉髓", icon: "💠" },
    { id: "m_flame",  name: "九幽冥火", icon: "🔥" },
    { id: "m_shard",  name: "天道殘片", icon: "🔷" },
  ],

  // ----------------------------------------------------------
  //  歷練：一層一層打上去，掛著它自己會打。
  //
  //  每層先清 combat.mobsPerLayer 隻小怪，然後出守關魔王。
  //  魔王有時限，所以本質上是一道戰力門檻：
  //      戰力 × bossTimeLimit >= bossHp 才殺得掉，
  //      打不過就一直卡在這層，直到你變強。
  //
  //  mobHp / bossHp : 血量
  //  mobDrop        : 小怪掉的天才地寶（每隻掉 qty 個）
  //  insight        : 打倒魔王給的悟性
  //  petId          : 打倒魔王後收服的靈寵
  // ----------------------------------------------------------
  layers: [
    { name: "後山",   mob: "青狼",  mobIcon: "🐺", mobHp: 20,
      boss: "狼王",   bossIcon: "🐺", bossHp: 150,
      mobDrop: { material: "m_dew", qty: 1 }, insight: 2, petId: "p_wolf",
      desc: "村後的荒山，狼群盤據。" },
    { name: "黑風林", mob: "黑熊",  mobIcon: "🐻", mobHp: 100,
      boss: "熊魈",   bossIcon: "🐻", bossHp: 750,
      mobDrop: { material: "m_fungus", qty: 1 }, insight: 3, petId: "p_bear",
      desc: "終年不見天日，風聲如鬼哭。" },
    { name: "亂葬崗", mob: "屍傀",  mobIcon: "🧟", mobHp: 500,
      boss: "骸骨將", bossIcon: "💀", bossHp: 3600,
      mobDrop: { material: "m_ice", qty: 1 }, insight: 5, petId: "p_bone",
      desc: "死人堆裡，總有東西不肯安分。" },
    { name: "血海",   mob: "血蛟",  bossIcon: "🐉", mobIcon: "🩸", mobHp: 2500,
      boss: "蛟龍王", bossHp: 18000,
      mobDrop: { material: "m_fruit", qty: 1 }, insight: 8, petId: "p_dragon",
      desc: "浪頭是紅的，據說底下埋著一整個宗門。" },
    { name: "幽冥谷", mob: "鬼修",  mobIcon: "👻", mobHp: 12000,
      boss: "鬼帝",   bossIcon: "👑", bossHp: 90000,
      mobDrop: { material: "m_flower", qty: 1 }, insight: 12, petId: "p_ghost",
      desc: "活人進去，出來的就不一定還是活人。" },
    { name: "萬妖窟", mob: "妖將",  mobIcon: "🐗", mobHp: 60000,
      boss: "妖皇",   bossIcon: "🦁", bossHp: 450000,
      mobDrop: { material: "m_core", qty: 1 }, insight: 18, petId: "p_beast",
      desc: "萬妖朝拜之地，凡人連站著都難。" },
    { name: "天魔淵", mob: "天魔",  mobIcon: "👺", mobHp: 3e5,
      boss: "魔尊",   bossIcon: "👹", bossHp: 2.25e6,
      mobDrop: { material: "m_bone", qty: 1 }, insight: 27, petId: "p_demon",
      desc: "深不見底。往下看久了，它也在看你。" },
    { name: "崑崙墟", mob: "仙傀",  mobIcon: "🗿", mobHp: 1.5e6,
      boss: "守墟人", bossIcon: "🛡", bossHp: 1.2e7,
      mobDrop: { material: "m_jade", qty: 1 }, insight: 40, petId: "p_guardian",
      desc: "上古仙人的遺跡，至今仍有東西在看守。" },
    { name: "九幽",   mob: "幽靈",  mobIcon: "🔮", mobHp: 8e6,
      boss: "幽冥教主", bossIcon: "🕯", bossHp: 6e7,
      mobDrop: { material: "m_flame", qty: 1 }, insight: 60, petId: "p_lord",
      desc: "黃泉盡頭，冥火不熄。" },
    { name: "天門",   mob: "天兵",  mobIcon: "⚔️", mobHp: 4e7,
      boss: "天帝",   bossIcon: "⚡", bossHp: 3e8,
      mobDrop: { material: "m_shard", qty: 1 }, insight: 90, petId: "p_emperor",
      desc: "推開它，就沒有回頭路了。" },
  ],

  // ----------------------------------------------------------
  //  靈寵：只能帶一隻，隨時可換。
  //
  //  來源有兩種：
  //    · 沒有 cost 的 → 打倒對應的守關魔王就會自動收服
  //    · 有 cost 的   → 在靈寵分頁用悟性請回來
  //
  //  餵天才地寶可以升級，加成隨等級成長：
  //      加成 = base + perLevel × (等級 − 1)
  //  升到下一級要 materialCost × 當前等級 個材料。
  //
  //  effect 三種：
  //    "power"   戰力 ×加成
  //    "allRate" 所有修煉設施產量 ×加成
  //    "drop"    天才地寶掉落 ×加成
  // ----------------------------------------------------------
  pets: [
    { id: "p_wolf", name: "狼王", icon: "🐺", desc: "後山的霸主，如今替你看門。",
      effect: "power", base: 1.5, perLevel: 0.25, maxLevel: 10,
      material: "m_dew", materialCost: 3 },
    { id: "p_bear", name: "熊魈", icon: "🐻", desc: "力大無窮，就是有點笨。",
      effect: "allRate", base: 1.4, perLevel: 0.2, maxLevel: 10,
      material: "m_fungus", materialCost: 3 },
    { id: "p_bone", name: "骸骨將", icon: "💀", desc: "死了還在挖東西，習慣難改。",
      effect: "drop", base: 1.5, perLevel: 0.3, maxLevel: 10,
      material: "m_ice", materialCost: 3 },
    { id: "p_dragon", name: "蛟龍王", icon: "🐉", desc: "困於血海千年，終於有人放牠出來。",
      effect: "power", base: 2, perLevel: 0.4, maxLevel: 10,
      material: "m_fruit", materialCost: 4 },
    { id: "p_ghost", name: "鬼帝", icon: "👑", desc: "牠說牠只是想找個人說話。",
      effect: "allRate", base: 1.8, perLevel: 0.3, maxLevel: 10,
      material: "m_flower", materialCost: 4 },
    { id: "p_beast", name: "妖皇", icon: "🦁", desc: "萬妖之首，願賭服輸。",
      effect: "power", base: 2.5, perLevel: 0.5, maxLevel: 10,
      material: "m_core", materialCost: 4 },
    { id: "p_demon", name: "魔尊", icon: "👹", desc: "「我不是輸給你，是輸給天。」",
      effect: "allRate", base: 2.2, perLevel: 0.4, maxLevel: 10,
      material: "m_bone", materialCost: 5 },
    { id: "p_guardian", name: "守墟人", icon: "🛡", desc: "守了一萬年，總算等到接班的。",
      effect: "drop", base: 2.5, perLevel: 0.5, maxLevel: 10,
      material: "m_jade", materialCost: 5 },
    { id: "p_lord", name: "幽冥教主", icon: "🕯", desc: "冥火隨行，寸草不生。",
      effect: "power", base: 3, perLevel: 0.6, maxLevel: 10,
      material: "m_flame", materialCost: 5 },
    { id: "p_emperor", name: "天帝", icon: "⚡", desc: "天塌下來，有牠頂著。",
      effect: "allRate", base: 3, perLevel: 0.6, maxLevel: 10,
      material: "m_shard", materialCost: 6 },

    // 商店限定：用悟性請回來，不用打
    { id: "p_toad", name: "金蟾", icon: "🐸", desc: "傳說牠一開口就吐金子。目前只吐靈氣。",
      cost: 18, effect: "allRate", base: 1.6, perLevel: 0.25, maxLevel: 10,
      material: "m_dew", materialCost: 4 },
    { id: "p_jade", name: "小玉龍", icon: "🐲", desc: "還沒長大，脾氣已經很大。",
      cost: 30, effect: "power", base: 2.2, perLevel: 0.45, maxLevel: 10,
      material: "m_fruit", materialCost: 4 },
    { id: "p_crow", name: "三足金烏", icon: "🦅", desc: "日中金烏，眼裡看得見寶。",
      cost: 55, effect: "drop", base: 2.2, perLevel: 0.45, maxLevel: 10,
      material: "m_flame", materialCost: 5 },
  ],

  // ----------------------------------------------------------
  //  符籙：消耗品，可以囤，用一張少一張。
  //  在法寶分頁最上面，用悟性買。
  //
  //  目前程式只認得一種 effect：
  //    "guaranteeBreakthrough"  保證下一次突破成功
  // ----------------------------------------------------------
  consumables: [
    { id: "c_talisman", name: "渡劫符", icon: "🧧",
      desc: "貼身符籙，保證下一次突破必定成功。",
      cost: 5, effect: "guaranteeBreakthrough" },
  ],

  // ----------------------------------------------------------
  //  修煉設施：自動產靈氣的東西。突破時散去。
  //
  //  id / name / icon / desc
  //  baseCost   : 第 1 個的價格
  //  costGrowth : 每買一個貴幾倍（1.15 = 貴 15%，經典手感）
  //  baseRate   : 每個每秒產多少靈氣（再乘境界倍率、功法、法寶）
  // ----------------------------------------------------------
  generators: [
    { id: "array",  name: "聚靈陣", icon: "🔯", desc: "簡陋的陣法，聊勝於無。",
      baseCost: 15,    costGrowth: 1.15, baseRate: 0.1 },
    { id: "stone",  name: "靈石",   icon: "💎", desc: "會自己散出靈氣的石頭。",
      baseCost: 100,   costGrowth: 1.15, baseRate: 1 },
    { id: "manual", name: "功法碑", icon: "📜", desc: "前人留下的修煉法門。",
      baseCost: 1100,  costGrowth: 1.15, baseRate: 8 },
    { id: "pill",   name: "丹爐",   icon: "⚗️", desc: "日夜不熄，煉丹自用。",
      baseCost: 12000, costGrowth: 1.15, baseRate: 47 },
    { id: "cave",   name: "洞府",   icon: "🏯", desc: "閉關之所，隔絕紅塵。",
      baseCost: 130000, costGrowth: 1.15, baseRate: 260 },
    { id: "vein",   name: "靈脈",   icon: "⛰️", desc: "天地靈氣匯聚之處。",
      baseCost: 1.4e6, costGrowth: 1.15, baseRate: 1400 },
    { id: "elder",  name: "傳功長老", icon: "🧙", desc: "以他人之力，助我修行。",
      baseCost: 2e7,   costGrowth: 1.15, baseRate: 7800 },
    { id: "world",  name: "小千世界", icon: "🌌", desc: "一花一世界，一葉一菩提。",
      baseCost: 3.3e8, costGrowth: 1.15, baseRate: 44000 },
  ],

  // ----------------------------------------------------------
  //  功法：用「靈氣」買，一次性，買了就永久生效 ——
  //  但突破時會跟著散去，下一輪要重買。
  //
  //  所以功法在「漫長的後期境界」才真正划算；
  //  眼看就要突破了還在買功法，那是浪費。這個取捨是刻意的。
  //
  //  target       : 要加成誰。填修煉設施的 id，或 "click"（打坐）、"all"（全部設施）
  //  multiplier   : 加成幾倍
  //  requireOwned : 要擁有幾個 target 才會出現在商店（"click"/"all" 填 0）
  // ----------------------------------------------------------
  techniques: [
    { id: "f_click1", name: "吐納法", icon: "🌬️", desc: "打坐所得 ×2。",
      cost: 200, target: "click", multiplier: 2, requireOwned: 0 },
    { id: "f_click2", name: "周天訣", icon: "🔁", desc: "打坐所得再 ×3。",
      cost: 50000, target: "click", multiplier: 3, requireOwned: 0 },

    // target: "power" 是打怪用的戰力
    { id: "f_power1", name: "煉體訣", icon: "💪", desc: "戰力 ×2。",
      cost: 3000, target: "power", multiplier: 2, requireOwned: 0 },
    { id: "f_power2", name: "金剛不壞", icon: "🛡", desc: "戰力再 ×3。",
      cost: 2e5, target: "power", multiplier: 3, requireOwned: 0 },
    { id: "f_power3", name: "劍心通明", icon: "🗡", desc: "戰力再 ×4。",
      cost: 1.5e7, target: "power", multiplier: 4, requireOwned: 0 },

    { id: "f_array1", name: "聚靈訣",   icon: "📖", desc: "聚靈陣產量 ×2。",
      cost: 900,   target: "array", multiplier: 2, requireOwned: 10 },
    { id: "f_array2", name: "大衍聚靈訣", icon: "📘", desc: "聚靈陣產量再 ×2。",
      cost: 10500, target: "array", multiplier: 2, requireOwned: 25 },

    { id: "f_stone1", name: "點石成金", icon: "🪙", desc: "靈石產量 ×2。",
      cost: 6000,  target: "stone", multiplier: 2, requireOwned: 10 },
    { id: "f_stone2", name: "五行歸元", icon: "🌀", desc: "靈石產量再 ×2。",
      cost: 70000, target: "stone", multiplier: 2, requireOwned: 25 },

    { id: "f_manual1", name: "過目不忘", icon: "👁", desc: "功法碑產量 ×2。",
      cost: 66000,  target: "manual", multiplier: 2, requireOwned: 10 },
    { id: "f_manual2", name: "融會貫通", icon: "🧠", desc: "功法碑產量再 ×2。",
      cost: 770000, target: "manual", multiplier: 2, requireOwned: 25 },

    { id: "f_pill1", name: "文武火候", icon: "🔥", desc: "丹爐產量 ×2。",
      cost: 720000, target: "pill", multiplier: 2, requireOwned: 10 },
    { id: "f_pill2", name: "九轉還魂", icon: "💊", desc: "丹爐產量再 ×2。",
      cost: 8.4e6,  target: "pill", multiplier: 2, requireOwned: 25 },

    { id: "f_cave1", name: "洞天石扉", icon: "🚪", desc: "洞府產量 ×2。",
      cost: 7.8e6, target: "cave", multiplier: 2, requireOwned: 10 },
    { id: "f_cave2", name: "壺天之術", icon: "🫖", desc: "洞府產量再 ×2。",
      cost: 9.1e7, target: "cave", multiplier: 2, requireOwned: 25 },

    { id: "f_vein1", name: "移山填海", icon: "🏔", desc: "靈脈產量 ×2。",
      cost: 8.4e7, target: "vein", multiplier: 2, requireOwned: 10 },
    { id: "f_vein2", name: "地脈重塑", icon: "🌋", desc: "靈脈產量再 ×2。",
      cost: 9.8e8, target: "vein", multiplier: 2, requireOwned: 25 },

    { id: "f_elder1", name: "尊師重道", icon: "🙇", desc: "傳功長老產量 ×2。",
      cost: 1.2e9, target: "elder", multiplier: 2, requireOwned: 10 },
    { id: "f_elder2", name: "薪火相傳", icon: "🕯", desc: "傳功長老產量再 ×2。",
      cost: 1.4e10, target: "elder", multiplier: 2, requireOwned: 25 },

    { id: "f_world1", name: "一念成界", icon: "✨", desc: "小千世界產量 ×2。",
      cost: 2e10, target: "world", multiplier: 2, requireOwned: 10 },
    { id: "f_world2", name: "大千三千", icon: "🌠", desc: "小千世界產量再 ×2。",
      cost: 2.3e11, target: "world", multiplier: 2, requireOwned: 25 },
  ],

  // ----------------------------------------------------------
  //  法寶：用「悟性」買，一次性，而且**永遠不會消失** ——
  //  突破帶不走你的靈氣，但帶不走法寶。這是跨輪的長線目標。
  //
  //  effect 只有四種：
  //    "click"        打坐所得 ×value（乘法）
  //    "allRate"      所有修煉設施產量 ×value（乘法）
  //    "offlineHours" 離線上限 +value 小時（加法）
  //    "tribulation"  渡劫成功率 +value（加法，0.1 = 10%）
  // ----------------------------------------------------------
  treasures: [
    { id: "b_click1", name: "玉如意", icon: "🔮", desc: "打坐所得 ×3。",
      cost: 3,  effect: "click", value: 3 },
    { id: "b_click2", name: "紫金葫蘆", icon: "🍶", desc: "打坐所得再 ×5。",
      cost: 20, effect: "click", value: 5 },

    // clickShare 是加法：直接把「打坐值幾秒的產量」往上加。
    // 這兩件是打坐後期唯一有意義的加成 —— 上面那兩件乘的是定額底線，
    // 到了金丹之後那個底線本身就已經不重要了。
    { id: "b_share1", name: "指玄功", icon: "🖐", desc: "打坐額外獲得 3% 的每秒產量。",
      cost: 10, effect: "clickShare", value: 0.03 },
    { id: "b_share2", name: "天人交感", icon: "🌌", desc: "打坐再額外獲得 8% 的每秒產量。",
      cost: 45, effect: "clickShare", value: 0.08 },

    { id: "b_all1", name: "聚靈玉佩", icon: "🧿", desc: "所有修煉設施產量 ×1.5。",
      cost: 5,  effect: "allRate", value: 1.5 },
    { id: "b_all2", name: "洛書河圖", icon: "🗺", desc: "所有修煉設施產量再 ×2。",
      cost: 25, effect: "allRate", value: 2 },
    { id: "b_all3", name: "崑崙鏡",   icon: "🪞", desc: "所有修煉設施產量再 ×3。",
      cost: 90, effect: "allRate", value: 3 },

    { id: "b_off1", name: "須彌芥子", icon: "🎒", desc: "離線收益上限 +8 小時。",
      cost: 8,  effect: "offlineHours", value: 8 },
    { id: "b_off2", name: "壺中天地", icon: "🏺", desc: "離線收益上限再 +16 小時。",
      cost: 40, effect: "offlineHours", value: 16 },

    { id: "b_pow1", name: "誅仙劍", icon: "🗡", desc: "戰力 ×3。",
      cost: 15, effect: "power", value: 3 },
    { id: "b_pow2", name: "弒神槍", icon: "🔱", desc: "戰力再 ×5。",
      cost: 60, effect: "power", value: 5 },

    { id: "b_trib1", name: "避雷珠",   icon: "🌩", desc: "渡劫成功率 +10%。",
      cost: 12,  effect: "tribulation", value: 0.10 },
    { id: "b_trib2", name: "九天息壤", icon: "🪨", desc: "渡劫成功率再 +15%。",
      cost: 45,  effect: "tribulation", value: 0.15 },
    { id: "b_trib3", name: "先天功德", icon: "☘️", desc: "渡劫成功率再 +20%。",
      cost: 120, effect: "tribulation", value: 0.20 },
  ],
};
