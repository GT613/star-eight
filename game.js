(() => {
  const data = window.STORY_DATA.stories;
  data.forEach(route => {
    route.portrait = route.portrait.replace(/\.png$/i, ".webp");
    route.scenes.forEach(scene => { scene.background = scene.background.replace(/\.png$/i, ".webp"); });
  });
  const $ = (id) => document.getElementById(id);
  const screens = ["home", "game", "ending"];
  let state = { role: null, scene: 0, routes: [], speed: 18 };
  let typing = null;
  const music = {
    enabled: localStorage.getItem("galaxy8:music") !== "off",
    volume: Number(localStorage.getItem("galaxy8:volume") || 42) / 100,
    active: 0,
    key: "",
    players: [new Audio(), new Audio()]
  };
  music.players.forEach(player => { player.loop = true; player.preload = "auto"; player.volume = 0; });

  // An energetic science-fiction theme shared by the whole game.
  const musicLibrary = {
    menu: ["Captain-Badass-2.mp3"],
    伍尔夫: ["Captain-Badass-2.mp3", "Captain-Badass-2.mp3", "Captain-Badass-2.mp3"],
    图兰: ["Captain-Badass-2.mp3", "Captain-Badass-2.mp3", "Captain-Badass-2.mp3"],
    林静姝: ["Captain-Badass-2.mp3", "Captain-Badass-2.mp3", "Captain-Badass-2.mp3"],
    林静恒: ["Captain-Badass-2.mp3", "Captain-Badass-2.mp3", "Captain-Badass-2.mp3"],
    陆必行: ["Captain-Badass-2.mp3", "Captain-Badass-2.mp3", "Captain-Badass-2.mp3"],
    ending: ["Captain-Badass-2.mp3"]
  };

  // Three lightweight interactions per route, spread across the story.
  const minigamePlans = {
    伍尔夫: [
      { at: .2, type: "calibrate", title: "议会通讯校准" },
      { at: .5, type: "signal", title: "旧日档案解码" },
      { at: .8, type: "sequence", title: "联盟航线推演" }
    ],
    图兰: [
      { at: .2, type: "sequence", title: "先锋机甲同步" },
      { at: .5, type: "calibrate", title: "跃迁引擎调谐" },
      { at: .8, type: "signal", title: "白银频道锁定" }
    ],
    林静姝: [
      { at: .2, type: "signal", title: "蔚蓝之海识别" },
      { at: .5, type: "sequence", title: "芯片指令重组" },
      { at: .8, type: "calibrate", title: "精神网络平衡" }
    ],
    林静恒: [
      { at: .2, type: "calibrate", title: "湛卢系统校准" },
      { at: .5, type: "signal", title: "白银要塞扫描" },
      { at: .8, type: "sequence", title: "舰队战术编队" }
    ],
    陆必行: [
      { at: .2, type: "signal", title: "星海课堂实验" },
      { at: .5, type: "calibrate", title: "空脑屏障调谐" },
      { at: .8, type: "sequence", title: "玫瑰航道规划" }
    ]
  };
  let activeMinigame = null;

  function soundtrackFor(route, sceneIndex) {
    const progress = sceneIndex / Math.max(1, route.scenes.length - 1);
    const act = progress < 0.38 ? 0 : progress < 0.76 ? 1 : 2;
    return { file: musicLibrary[route.id][act], key: `${route.id}:act-${act + 1}` };
  }

  function fade(player, from, to, duration, stopAfter = false) {
    const started = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - started) / duration);
      player.volume = Math.max(0, Math.min(1, from + (to - from) * p));
      if (p < 1) requestAnimationFrame(frame); else if (stopAfter) { player.pause(); player.currentTime = 0; }
    }
    requestAnimationFrame(frame);
  }

  function playMusic(kind, seed = kind, force = false, directFile = "") {
    const list = musicLibrary[kind] || musicLibrary.menu;
    const file = directFile || list[0];
    const key = directFile ? seed : `${kind}:${file}`;
    if (!music.enabled || (!force && music.key === key)) return;
    const oldPlayer = music.players[music.active];
    const nextIndex = 1 - music.active;
    const nextPlayer = music.players[nextIndex];
    nextPlayer.src = encodeURI(`背景音乐/${file}`);
    nextPlayer.currentTime = 0;
    nextPlayer.volume = 0;
    const attempt = nextPlayer.play();
    if (attempt) attempt.then(() => {
      fade(oldPlayer, oldPlayer.volume, 0, 900, true);
      fade(nextPlayer, 0, music.volume, 1100);
      music.active = nextIndex; music.key = key;
    }).catch(() => {});
  }

  function updateMusicButton() {
    $("toggle-audio").querySelector("span").textContent = music.enabled ? "已开启" : "已静音";
  }

  function show(id) { screens.forEach(x => $(x).classList.toggle("active", x === id)); }
  function save() { if (state.role) localStorage.setItem(`galaxy8:${state.role}`, JSON.stringify(state)); }
  function load(role) { try { return JSON.parse(localStorage.getItem(`galaxy8:${role}`)); } catch { return null; } }
  function story() { return data.find(x => x.id === state.role); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  function renderRoles() {
    $("role-list").innerHTML = data.map((role) => {
      const progress = load(role.id);
      const pct = progress ? Math.min(100, Math.round(progress.scene / role.scenes.length * 100)) : 0;
      return `<button class="role-card" data-role="${role.id}" style="--accent:${role.accent}"><img src="${encodeURI(role.portrait)}" alt="${role.name}"><span class="role-info"><strong>${role.name}</strong><span>${role.subtitle}</span><small>${pct ? pct + "%" : "新篇"}</small></span></button>`;
    }).join("");
    document.querySelectorAll(".role-card").forEach(btn => btn.onclick = () => start(btn.dataset.role));
  }

  function start(role) {
    state = load(role) || { role, scene: 0, routes: [], speed: Number($("speed").value) };
    state.role = role;
    state.minigames = state.minigames || {};
    show("game"); renderScene();
  }

  function minigameForScene(route) {
    const plans = minigamePlans[route.id] || [];
    const slot = plans.findIndex(game => Math.round((route.scenes.length - 1) * game.at) === state.scene);
    return slot < 0 ? null : { ...plans[slot], slot, key: `${route.id}:${slot}` };
  }

  function typeText(lines) {
    clearInterval(typing);
    const target = $("story-text"), full = lines.join("\n");
    let i = 0; target.textContent = "";
    typing = setInterval(() => { target.textContent = full.slice(0, ++i); if (i >= full.length) clearInterval(typing); }, Math.max(8, 48 - state.speed));
    target.onclick = () => { clearInterval(typing); target.textContent = full; };
  }

  function renderScene() {
    const route = story(), scene = route.scenes[state.scene];
    if (!scene) return complete();
    document.documentElement.style.setProperty("--accent", route.accent);
    $("route-name").textContent = `${route.name} · ${route.subtitle}`;
    $("chapter-name").textContent = scene.chapter;
    $("speaker").textContent = route.name;
    $("portrait").src = encodeURI(route.portrait); $("portrait").alt = route.name;
    $("backdrop").style.backgroundImage = `url("${encodeURI(scene.background)}")`;
    $("progress-bar").style.width = `${(state.scene + 1) / route.scenes.length * 100}%`;
    const score = soundtrackFor(route, state.scene);
    playMusic("menu", score.key, false, score.file);
    typeText(scene.text);
    const minigame = minigameForScene(route);
    const minigameButton = $("open-minigame");
    minigameButton.hidden = !minigame;
    minigameButton.disabled = false;
    minigameButton.classList.remove("done");
    if (minigame) {
      const done = Boolean(state.minigames && state.minigames[minigame.key]);
      $("minigame-trigger-title").textContent = done ? `${minigame.title}·已完成` : minigame.title;
      minigameButton.disabled = done;
      minigameButton.classList.toggle("done", done);
    }
    const pluginButton = $("open-plugin");
    pluginButton.hidden = !scene.plugin;
    if (scene.plugin) $("plugin-trigger-title").textContent = scene.plugin.title;
    $("choices").innerHTML = scene.choices.map(c => `<button class="choice" data-key="${c.key}">${esc(c.title)}</button>`).join("");
    const choiceButtons = [...document.querySelectorAll(".choice")];
    $("next").style.display = choiceButtons.length ? "none" : "block";
    choiceButtons.forEach(btn => btn.onclick = () => {
      choiceButtons.forEach(x => x.disabled = true); btn.classList.add("selected");
      state.routes.push(btn.textContent.trim()); save(); $("next").style.display = "block";
    });
    save();
  }

  function complete() {
    const route = story();
    show("ending"); $("ending-title").textContent = `${route.name}主线完成`;
    $("ending-copy").textContent = `你已走完「${route.subtitle}」的全部剧情。星海保存了你的每一次选择。`;
    $("route-record").innerHTML = [...new Set(state.routes)].map(x => `<span>${esc(x)}</span>`).join("") || "<span>命运航线已记录</span>";
    localStorage.setItem(`galaxy8:complete:${route.id}`, "1");
    playMusic("ending", route.id, true);
  }

  $("next").onclick = () => { clearInterval(typing); state.scene++; save(); renderScene(); };
  function minigameSeed(game) {
    return [...`${state.role}:${game.slot}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  }

  function winMinigame(message) {
    if (!activeMinigame) return;
    state.minigames = state.minigames || {};
    state.minigames[activeMinigame.key] = true;
    save();
    $("minigame-feedback").textContent = message;
    $("minigame-board").querySelectorAll("button,input").forEach(control => control.disabled = true);
    $("finish-minigame").hidden = false;
  }

  function renderSignalGame(game) {
    const symbols = ["◇", "△", "○", "□", "✦", "◎"];
    const seed = minigameSeed(game), target = symbols[seed % symbols.length];
    const options = [...symbols.slice(seed % symbols.length), ...symbols.slice(0, seed % symbols.length)];
    $("minigame-instruction").textContent = "从干扰信号中找出与目标编码相同的频道。";
    $("minigame-board").innerHTML = `<div class="signal-code">目标 ${target}</div><div class="minigame-options">${options.map(symbol => `<button data-signal="${symbol}">${symbol}</button>`).join("")}</div>`;
    $("minigame-board").querySelectorAll("[data-signal]").forEach(button => button.onclick = () => {
      if (button.dataset.signal === target) winMinigame("信号锁定成功，航行记录已保存。");
      else $("minigame-feedback").textContent = "频率不匹配，再试一次。";
    });
  }

  function renderSequenceGame(game) {
    const arrows = ["↑", "→", "↓", "←"], seed = minigameSeed(game);
    const sequence = Array.from({ length: 4 }, (_, index) => arrows[(seed + index * 3) % arrows.length]);
    let entered = [];
    $("minigame-instruction").textContent = "按顺序输入屏幕上的四步航行指令。";
    $("minigame-board").innerHTML = `<div class="signal-code">${sequence.join(" ")}</div><div class="sequence-pad">${arrows.map(arrow => `<button data-arrow="${arrow}">${arrow}</button>`).join("")}</div>`;
    $("minigame-board").querySelectorAll("[data-arrow]").forEach(button => button.onclick = () => {
      entered.push(button.dataset.arrow);
      const index = entered.length - 1;
      if (entered[index] !== sequence[index]) {
        entered = [];
        $("minigame-feedback").textContent = "指令顺序有误，已重置。";
      } else if (entered.length === sequence.length) winMinigame("指令序列正确，航线已确认。");
      else $("minigame-feedback").textContent = `已输入 ${entered.length} / ${sequence.length}`;
    });
  }

  function renderCalibrateGame(game) {
    const target = 25 + minigameSeed(game) % 51;
    $("minigame-instruction").textContent = `调整能量到 ${target}% 附近（误差±4%）。`;
    $("minigame-board").innerHTML = `<div class="calibrate-value">50%</div><div><input class="calibrate" type="range" min="0" max="100" value="50" aria-label="能量值"><button class="calibrate-submit">校准</button></div>`;
    const input = $("minigame-board").querySelector(".calibrate");
    const value = $("minigame-board").querySelector(".calibrate-value");
    input.oninput = () => { value.textContent = `${input.value}%`; };
    $("minigame-board").querySelector(".calibrate-submit").onclick = () => {
      const difference = Math.abs(Number(input.value) - target);
      if (difference <= 4) winMinigame("能量已稳定，系统校准完成。");
      else $("minigame-feedback").textContent = Number(input.value) < target ? "能量偏低，请向右微调。" : "能量偏高，请向左微调。";
    };
  }

  function openMinigame() {
    const route = story(), game = minigameForScene(route);
    if (!game || (state.minigames && state.minigames[game.key])) return;
    activeMinigame = game;
    $("minigame-title").textContent = game.title;
    $("minigame-feedback").textContent = "";
    $("finish-minigame").hidden = true;
    if (game.type === "signal") renderSignalGame(game);
    else if (game.type === "sequence") renderSequenceGame(game);
    else renderCalibrateGame(game);
    $("minigame").classList.add("open");
    $("minigame").setAttribute("aria-hidden", "false");
  }

  function closeMinigame() {
    $("minigame").classList.remove("open");
    $("minigame").setAttribute("aria-hidden", "true");
    activeMinigame = null;
    renderScene();
  }

  $("open-minigame").onclick = openMinigame;
  $("close-minigame").onclick = closeMinigame;
  $("finish-minigame").onclick = closeMinigame;
  $("minigame").onclick = event => { if (event.target === $("minigame")) closeMinigame(); };

  function openStoryPlugin() {
    const scene = story().scenes[state.scene];
    if (!scene || !scene.plugin) return;
    $("plugin-label").textContent = scene.plugin.label;
    $("plugin-title").textContent = scene.plugin.title;
    $("plugin-content").textContent = scene.plugin.content.join("\n\n");
    $("story-plugin").classList.add("open");
    $("story-plugin").setAttribute("aria-hidden", "false");
  }
  function closeStoryPlugin() {
    $("story-plugin").classList.remove("open");
    $("story-plugin").setAttribute("aria-hidden", "true");
  }
  $("open-plugin").onclick = openStoryPlugin;
  $("close-plugin").onclick = closeStoryPlugin;
  $("finish-plugin").onclick = closeStoryPlugin;
  $("story-plugin").onclick = event => { if (event.target === $("story-plugin")) closeStoryPlugin(); };
  $("back-home").onclick = () => { save(); show("home"); renderRoles(); playMusic("menu", "home", true); };
  $("ending-home").onclick = () => { show("home"); renderRoles(); playMusic("menu", "home", true); };
  $("open-menu").onclick = () => { $("menu").classList.add("open"); $("menu").setAttribute("aria-hidden", "false"); };
  $("close-menu").onclick = () => { $("menu").classList.remove("open"); $("menu").setAttribute("aria-hidden", "true"); };
  $("speed").oninput = e => { state.speed = Number(e.target.value); save(); };
  $("toggle-audio").onclick = () => {
    music.enabled = !music.enabled; localStorage.setItem("galaxy8:music", music.enabled ? "on" : "off");
    updateMusicButton();
    if (!music.enabled) music.players.forEach(player => fade(player, player.volume, 0, 350, true));
    else if (state.role && $("game").classList.contains("active")) { music.key = ""; renderScene(); }
    else playMusic("menu", "home", true);
  };
  $("volume").value = Math.round(music.volume * 100);
  $("volume").oninput = e => {
    music.volume = Number(e.target.value) / 100; localStorage.setItem("galaxy8:volume", String(e.target.value));
    if (music.enabled) music.players[music.active].volume = music.volume;
  };
  $("restart").onclick = () => { if (confirm("确定重新开始这条主线吗？")) { localStorage.removeItem(`galaxy8:${state.role}`); start(state.role); $("menu").classList.remove("open"); } };
  updateMusicButton();
  document.addEventListener("pointerdown", () => { if (music.enabled && !music.key) playMusic("menu", "home", true); }, { once: true });
  renderRoles();
})();
