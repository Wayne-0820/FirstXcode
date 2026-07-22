// ============================================================
//  音效。全部用 Web Audio 當場「算」出來，不載任何音檔。
//
//  ★ 為什麼不放 .mp3？這個專案的規矩是「自足」—— 連主畫面圖示都是
//    Python 當場畫的。放二進位音檔會多一批要下載、要進 service worker
//    快取的資產，也違反「一個資料夾拷貝就能跑」的初衷。用振盪器合成，
//    整個音效庫就只是這一個純文字檔，離線、PWA 都不用管。
//
//  ★ iOS 的硬限制：AudioContext 一定要「在使用者手勢裡」才能啟動，
//    而且一開始是 suspended 的。所以：
//      · 第一次點畫面時 unlock() 建立並 resume（見 main.js）。
//      · 每次發聲前也順手 resume 一次，切背景回來被暫停也接得上。
//    在手勢之外呼叫發聲一律安靜地不做事，不會報錯。
//
//  ★ 靜音是「裝置偏好」不是「存檔」：存在自己的 localStorage key，
//    重置存檔、搬存檔都不該影響它。預設開啟（但 iOS 仍要先點一下才出聲）。
// ============================================================

const Sound = (() => {
  const MUTE_KEY = "idle-muted";
  const AC = window.AudioContext || window.webkitAudioContext;
  const supported = !!AC;

  let ctx = null;
  let master = null;
  let muted = readMuted();

  function readMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function writeMuted(v) {
    try {
      localStorage.setItem(MUTE_KEY, v ? "1" : "0");
    } catch (e) {
      /* 存不了就算了，這只是偏好 */
    }
  }

  // 建立（或喚醒）音訊環境。只能在使用者手勢裡呼叫才會真的成功。
  function unlock() {
    if (!supported || muted) return;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.6; // 全域音量：刻意壓小，這是放在口袋裡玩的遊戲
        master.connect(ctx.destination);
      } catch (e) {
        ctx = null;
        return;
      }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  // 能不能真的發聲：支援、沒靜音、環境已建立且在跑。
  function ready() {
    if (!supported || muted || !ctx) return false;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx.state === "running";
  }

  function isEnabled() {
    return supported && !muted;
  }

  // 切換靜音。回傳切換後「開著沒」。
  // 從關→開這一下本身就是使用者手勢，順手 unlock 並「叮」一聲確認。
  function toggle() {
    muted = !muted;
    writeMuted(muted);
    if (!muted) {
      unlock();
      blip(659.25); // E5，一聲清脆的確認
    }
    return !muted;
  }

  // --- 合成基本音 ------------------------------------------

  // 一個「聲音」= 振盪器 → 音量包絡 → 全域音量。
  // 用指數衰減（听起來自然），指數不能到 0，所以用 0.0001 當地板。
  function voice(freq, opts) {
    if (!ready()) return;
    const o = opts || {};
    const type = o.type || "sine";
    const dur = o.dur || 0.15;
    const gain = o.gain || 0.18;
    const attack = o.attack || 0.006;
    const when = o.when || 0;
    const t0 = ctx.currentTime + when;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    // 滑音（例如升級的「咻」）
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // 一串音符（琶音）。notes = [freq, ...]，每個間隔 gap 秒。
  function arp(notes, gap, opts) {
    notes.forEach((f, i) => voice(f, Object.assign({ when: i * gap }, opts)));
  }

  // 短短一聲，給細碎的 UI 動作（穿裝備、出戰、切換）用。
  function blip(freq) {
    voice(freq || 587.33, { type: "triangle", dur: 0.08, gain: 0.1 });
  }

  // --- 音階（五聲音階，配修真的調調）----------------------
  // C 大調五聲：C D E G A。合成出來的東西天然和諧，很難刺耳。
  const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0;
  const C6 = 1046.5, D6 = 1174.66, E6 = 1318.51;
  const A4 = 440.0, G4 = 392.0, E4 = 329.63, C4 = 261.63;
  const D3 = 146.83, A2 = 110.0, G2 = 98.0;

  // 打坐用的一串音，像木魚 —— 連點時會沿著音階往上跑，成一段旋律。
  const CLICK_NOTES = [C5, D5, E5, G5, A5];
  let clickIdx = 0;
  let lastClick = 0;

  // --- 具名音效 --------------------------------------------

  // 打坐：木魚。停手超過 0.4 秒就從頭起音，連點則順著音階爬。
  function click() {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (now - lastClick > 0.4) clickIdx = 0;
    lastClick = now;
    const f = CLICK_NOTES[clickIdx % CLICK_NOTES.length];
    clickIdx++;
    voice(f, { type: "triangle", dur: 0.05, gain: 0.08, attack: 0.002 });
  }

  // 買修煉設施：兩聲上行，像投了枚錢
  function buy() {
    arp([C5, G5], 0.05, { type: "sine", dur: 0.09, gain: 0.12 });
  }

  // 買功法／法寶／招募道侶弟子／請靈寵：一個明亮的和弦
  function confirm() {
    arp([C5, E5, G5], 0.045, { type: "sine", dur: 0.16, gain: 0.11 });
  }

  // 升級（餵靈寵、強化裝備）：往上滑一下
  function upgrade() {
    voice(E5, { type: "triangle", dur: 0.16, gain: 0.12, glideTo: A5 });
  }

  // 突破成功：一整段五聲音階往上衝，再加一顆高音的餘韻。這是全遊戲最大的時刻。
  function breakthrough() {
    arp([A4, C5, D5, E5, G5, A5, C6], 0.075, { type: "triangle", dur: 0.35, gain: 0.14 });
    voice(E6, { type: "sine", dur: 1.1, gain: 0.09, when: 0.5 }); // 悠長的餘韻
  }

  // 渡劫失敗：往下沉、帶一點低鳴，聽起來就洩氣
  function fail() {
    arp([G4, E4, C4], 0.11, { type: "triangle", dur: 0.32, gain: 0.12 });
    voice(A2, { type: "sawtooth", dur: 0.7, gain: 0.06, when: 0.05 });
  }

  // 機緣飄出來：輕輕一聲鈴，提醒你畫面上有東西可以點
  function fortune() {
    voice(E5, { type: "sine", dur: 0.5, gain: 0.09 });
    voice(A5, { type: "sine", dur: 0.6, gain: 0.07, when: 0.02 }); // 微微離調，成一點光澤
  }

  // 領到機緣：好結果亮、心魔悶
  function claim(good) {
    if (good) {
      arp([E5, A5, C6, E6], 0.05, { type: "sine", dur: 0.22, gain: 0.11 });
    } else {
      voice(A2, { type: "sawtooth", dur: 0.5, gain: 0.1, attack: 0.03 });
      voice(D3 * 0.94, { type: "sawtooth", dur: 0.55, gain: 0.07, when: 0.02 }); // 不諧，發毛
    }
  }

  // 叩問石碑（抽卡）：一記低沉的鐘，餘韻長
  function draw() {
    voice(D3, { type: "sine", dur: 0.7, gain: 0.14 });
    voice(D3 * 2, { type: "sine", dur: 0.4, gain: 0.05, when: 0.01 });
  }

  // 抽到還沒學過的武學：在鐘聲上疊一段明亮的顯化
  function drawNew() {
    arp([G5, C6, E6], 0.06, { type: "triangle", dur: 0.3, gain: 0.12, when: 0.12 });
  }

  // 打倒守關魔王：一記果斷的低鐘
  function boss() {
    voice(G2, { type: "sine", dur: 0.6, gain: 0.15 });
    voice(D3, { type: "triangle", dur: 0.3, gain: 0.08, when: 0.04 });
  }

  // 收服靈寵：親切的上行
  function pet() {
    arp([C5, E5, G5, C6], 0.06, { type: "sine", dur: 0.2, gain: 0.11 });
  }

  return {
    unlock, isEnabled, toggle,
    click, buy, confirm, upgrade, blip,
    breakthrough, fail,
    fortune, claim,
    draw, drawNew,
    boss, pet,
  };
})();
