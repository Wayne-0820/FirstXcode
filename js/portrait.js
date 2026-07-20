// ============================================================
//  人物立繪。純 SVG 畫出來，不需要任何美術素材。
//
//  會隨兩件事變化：
//   · 境界越高 → 光暈越盛、多出飛劍與法印
//   · 穿的裝備 → 兵器、護甲、頭冠、靴履都畫得出來
//
//  只在「變了」的時候重畫（境界或裝備有動），不每幀重建 —— SVG 重建很貴。
// ============================================================

const Portrait = (() => {
  let lastKey = "";

  // 境界越高，配色越「脫離凡俗」
  const ROBE = [
    "#6b6f7d", // 凡人：灰布
    "#5b7a8c", // 煉氣
    "#4a7c6a", // 築基
    "#8a6d2f", // 金丹：泛金
    "#7a4a8c", // 元嬰
    "#3f6fa8", // 化神
    "#2f8a8a", // 煉虛
    "#a85a3f", // 合體
    "#8a2f5a", // 大乘
    "#5a2f8a", // 渡劫
    "#c8a44a", // 飛昇：金
  ];

  function esc(s) {
    return String(s).replace(/[<>&"]/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  }

  function build(state) {
    const realmIdx = Math.min(state.realm || 0, ROBE.length - 1);
    const robe = ROBE[realmIdx];
    const worn = state.equipment || {};

    // 只有這些會影響外觀，拿它們當快取的鍵
    const key = [realmIdx, ...CONTENT.slots.map((s) =>
      worn[s.id] ? worn[s.id].id + worn[s.id].rarity : "-")].join("|");
    if (key === lastKey) return null;
    lastKey = key;

    const rarityColor = (slot) => {
      const it = worn[slot];
      return it ? Economy.rarityById(it.rarity).color : null;
    };

    const has = (slot) => !!worn[slot];
    const glow = realmIdx / (ROBE.length - 1); // 0~1

    // --- 一層一層畫上去 ---
    const parts = [];

    // 背後的光暈：境界越高越盛
    if (glow > 0.05) {
      parts.push(`
        <circle cx="60" cy="52" r="${28 + glow * 22}"
          fill="url(#halo)" opacity="${0.18 + glow * 0.5}"/>`);
    }

    // 飛劍：化神之後開始有本命飛劍繞著
    if (realmIdx >= 5) {
      const n = Math.min(realmIdx - 4, 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = 60 + Math.cos(a) * 44;
        const y = 60 + Math.sin(a) * 30;
        parts.push(`
          <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(a * 57).toFixed(0)})">
            <rect x="-1" y="-9" width="2" height="18" rx="1"
              fill="${rarityColor("weapon") || "#cfd6e4"}" opacity="0.9"/>
          </g>`);
      }
    }

    // 靴履
    parts.push(`
      <path d="M50 116 L50 126 L44 126 L44 130 L58 130 L58 116 Z" fill="${has("boots") ? (rarityColor("boots") || robe) : "#3a3f4c"}"/>
      <path d="M70 116 L70 126 L76 126 L76 130 L62 130 L62 116 Z" fill="${has("boots") ? (rarityColor("boots") || robe) : "#3a3f4c"}"/>`);

    // 道袍
    parts.push(`
      <path d="M60 62 L84 76 L80 122 L40 122 L36 76 Z" fill="${robe}"/>
      <path d="M60 62 L60 122" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
      <path d="M60 62 L84 76 L78 82 L60 70 L42 82 L36 76 Z" fill="rgba(255,255,255,0.14)"/>`);

    // 護甲（穿了才有肩甲和胸甲）
    if (has("armor")) {
      const c = rarityColor("armor");
      parts.push(`
        <path d="M60 70 L78 80 L74 100 L60 94 L46 100 L42 80 Z" fill="${c}" opacity="0.55"/>
        <ellipse cx="40" cy="80" rx="8" ry="6" fill="${c}" opacity="0.8"/>
        <ellipse cx="80" cy="80" rx="8" ry="6" fill="${c}" opacity="0.8"/>`);
    }

    // 手臂與腰帶
    parts.push(`
      <path d="M38 78 L30 104 L36 106 L44 84 Z" fill="${robe}"/>
      <path d="M82 78 L90 104 L84 106 L76 84 Z" fill="${robe}"/>
      <rect x="44" y="94" width="32" height="5" rx="2.5" fill="rgba(0,0,0,0.3)"/>`);

    // 護符：掛在腰上晃
    if (has("amulet")) {
      parts.push(`
        <line x1="70" y1="99" x2="70" y2="106" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
        <circle cx="70" cy="108" r="4" fill="${rarityColor("amulet")}"/>`);
    }

    // 頭與臉
    parts.push(`
      <circle cx="60" cy="46" r="14" fill="#e8c9a8"/>
      <path d="M46 44 Q60 30 74 44 Q74 34 60 30 Q46 34 46 44 Z" fill="#2b2b33"/>
      <circle cx="55" cy="47" r="1.6" fill="#2b2b33"/>
      <circle cx="65" cy="47" r="1.6" fill="#2b2b33"/>`);

    // 頭冠
    if (has("helmet")) {
      const c = rarityColor("helmet");
      parts.push(`
        <path d="M47 36 L53 28 L60 34 L67 28 L73 36 Z" fill="${c}"/>
        <circle cx="60" cy="30" r="2.5" fill="${c}"/>`);
    }

    // 戒指：手上的一點光
    if (has("ring")) {
      parts.push(`<circle cx="33" cy="105" r="3" fill="${rarityColor("ring")}"/>`);
    }

    // 兵器：拿在手上
    if (has("weapon")) {
      const c = rarityColor("weapon") || "#cfd6e4";
      parts.push(`
        <g transform="translate(88 96) rotate(-20)">
          <rect x="-1.5" y="-38" width="3" height="40" rx="1.5" fill="${c}"/>
          <rect x="-5" y="0" width="10" height="3" rx="1.5" fill="#7a5c2a"/>
          <rect x="-2" y="3" width="4" height="10" rx="2" fill="#4a3a1a"/>
        </g>`);
    }

    // 飛昇：腳下生雲
    if (realmIdx >= ROBE.length - 1) {
      parts.push(`
        <ellipse cx="60" cy="130" rx="30" ry="6" fill="#c8a44a" opacity="0.35"/>
        <ellipse cx="46" cy="132" rx="12" ry="4" fill="#c8a44a" opacity="0.25"/>
        <ellipse cx="74" cy="132" rx="12" ry="4" fill="#c8a44a" opacity="0.25"/>`);
    }

    return `
      <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="halo">
            <stop offset="0%" stop-color="${robe}" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="${robe}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        ${parts.join("")}
      </svg>`;
  }

  // 境界或裝備變了才重畫
  function render(el, state) {
    const svg = build(state);
    if (svg !== null) el.innerHTML = svg;
  }

  function reset() { lastKey = ""; }

  return { render, reset };
})();
