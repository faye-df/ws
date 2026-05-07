const STORAGE_KEY = "glowcat:v1";
const RESET_HOUR = 4;
const QUOTES = {
  Hungry: "喵，云朵把勇气团子送来啦。",
  Waiting: "既然你这么弱，就只能由我来监督你按时服药了。",
  Feeding: "打勾就行，剩下的团子我自己会吃。",
  Happy: "哼，做得不错。我把一小片阳光分给你。",
  Satisfied: "今天的天空放晴了。过来，允许你摸摸肚子。",
};
const STATE_LABELS = {
  Hungry: "等待喂食",
  Waiting: "傲娇催促",
  Feeding: "团子靠近",
  Happy: "进食反馈",
  Satisfied: "满足陪伴",
};

const canvas = document.getElementById("auraCanvas");
const ctx = canvas.getContext("2d");
const catWrap = document.getElementById("catWrap");
const foodOrb = document.getElementById("foodOrb");
const taskList = document.getElementById("taskList");
const planList = document.getElementById("planList");
const progressText = document.getElementById("progressText");
const quote = document.getElementById("quote");
const stateLabel = document.getElementById("stateLabel");
const planSheet = document.getElementById("planSheet");
const sheetBackdrop = document.getElementById("sheetBackdrop");
const planForm = document.getElementById("planForm");

let data = loadData();
let particles = [];
let petals = [];
let visualState = "Hungry";
let activePlanId = null;
let feedingPlanId = null;
let burst = 0;
let purr = false;
let dpr = 1;
let width = 0;
let height = 0;
let metricsCache = null;

function resetKey(date = new Date()) {
  const shifted = new Date(date);
  if (shifted.getHours() < RESET_HOUR) shifted.setDate(shifted.getDate() - 1);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadData() {
  const fallback = {
    plans: [
      { id: crypto.randomUUID(), name: "维生素 D", time: "08:00", dose: "1 粒" },
      { id: crypto.randomUUID(), name: "镁片", time: "22:30", dose: "1 片" },
    ],
    checkins: {},
    day: resetKey(),
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return fallback;
    if (parsed.day !== resetKey()) {
      parsed.day = resetKey();
      parsed.checkins = {};
    }
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function sortedPlans() {
  return [...data.plans].sort((a, b) => a.time.localeCompare(b.time));
}

function isDue(plan) {
  const now = new Date();
  const [hour, minute] = plan.time.split(":").map(Number);
  const due = new Date();
  due.setHours(hour, minute, 0, 0);
  return now >= due;
}

function isPending(plan) {
  return isDue(plan) && !data.checkins[plan.id];
}

function allDone() {
  return data.plans.length > 0 && data.plans.every((plan) => data.checkins[plan.id]);
}

function nextPlan() {
  return sortedPlans().find((plan) => !data.checkins[plan.id]) ?? null;
}

function deriveState() {
  if (allDone()) return "Satisfied";
  if (data.plans.some(isPending)) return "Hungry";
  return "Waiting";
}

function setVisualState(nextState, temporary = false) {
  visualState = nextState;
  quote.textContent = QUOTES[nextState];
  stateLabel.textContent = STATE_LABELS[nextState];
  catWrap.classList.toggle("happy", nextState === "Happy" || nextState === "Satisfied");
  catWrap.classList.toggle("satisfied", nextState === "Satisfied");
  foodOrb.classList.toggle("hidden", nextState === "Satisfied" || data.plans.length === 0);
  if (temporary) {
    window.clearTimeout(setVisualState.timer);
    setVisualState.timer = window.setTimeout(() => setVisualState(deriveState()), 1500);
  }
}

function formatMeta(plan) {
  return [plan.time, plan.dose].filter(Boolean).join(" · ");
}

function render() {
  activePlanId = nextPlan()?.id ?? null;
  const doneCount = data.plans.filter((plan) => data.checkins[plan.id]).length;
  progressText.textContent = `${doneCount}/${data.plans.length}`;
  renderTasks();
  renderPlans();
  setVisualState(deriveState());
}

function renderTasks() {
  taskList.innerHTML = "";
  if (!data.plans.length) {
    taskList.innerHTML = '<div class="empty-state">打开猫咪日记，写下第一颗勇气团子</div>';
    return;
  }

  for (const plan of sortedPlans()) {
    const checked = Boolean(data.checkins[plan.id]);
    const row = document.createElement("article");
    row.className = `task-row ${checked ? "done" : ""} ${isPending(plan) ? "pending" : ""}`;
    row.innerHTML = `
      <div>
        <p class="task-name">${escapeHtml(plan.name)}</p>
        <p class="task-meta">${escapeHtml(formatMeta(plan))}</p>
      </div>
      <button class="task-check ${checked ? "checked" : ""}" type="button" aria-label="${checked ? "取消猫爪印章" : "打勾喂给小猫"}">${checked ? "✓" : ""}</button>
    `;
    row.querySelector("button").addEventListener("click", () => startFeeding(plan.id));
    taskList.append(row);
  }
}

function renderPlans() {
  planList.innerHTML = "";
  if (!data.plans.length) {
    planList.innerHTML = '<div class="empty-state">这页日记还空着</div>';
    return;
  }

  for (const plan of sortedPlans()) {
    const row = document.createElement("article");
    row.className = "plan-row";
    row.innerHTML = `
      <div>
        <p class="plan-name">${escapeHtml(plan.name)}</p>
        <p class="plan-meta">${escapeHtml(formatMeta(plan))}</p>
      </div>
      <button class="delete-button" type="button" aria-label="擦掉 ${escapeHtml(plan.name)}">×</button>
    `;
    row.querySelector("button").addEventListener("click", () => deletePlan(plan.id));
    attachSwipeDelete(row, plan.id);
    planList.append(row);
  }
}

function startFeeding(planId) {
  if (feedingPlanId) return;
  if (data.checkins[planId]) {
    delete data.checkins[planId];
    saveData();
    render();
    return;
  }
  feedingPlanId = planId;
  setVisualState("Feeding");
  animateFoodToCat(planId);
}

function completeFeeding(planId) {
  if (!planId || data.checkins[planId]) {
    feedingPlanId = null;
    resetFoodOrb();
    return;
  }
  data.checkins[planId] = new Date().toISOString();
  saveData();
  burst = allDone() ? 1.45 : 1;
  catWrap.classList.remove("feed-pop");
  void catWrap.offsetWidth;
  catWrap.classList.add("feed-pop");
  vibrate(allDone() ? [34, 52, 44] : [28, 44, 26]);
  spawnPetals(allDone() ? 34 : 14);
  render();
  setVisualState(allDone() ? "Satisfied" : "Happy", !allDone());
  resetFoodOrb();
  feedingPlanId = null;
}

function deletePlan(planId) {
  data.plans = data.plans.filter((plan) => plan.id !== planId);
  delete data.checkins[planId];
  saveData();
  render();
}

function attachSwipeDelete(row, planId) {
  let startX = 0;
  let currentX = 0;
  row.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    currentX = startX;
    row.setPointerCapture(event.pointerId);
  });
  row.addEventListener("pointermove", (event) => {
    if (!startX) return;
    currentX = event.clientX;
    const delta = Math.min(0, currentX - startX);
    row.style.transform = `translateX(${Math.max(delta, -88)}px)`;
  });
  row.addEventListener("pointerup", () => {
    if (startX - currentX > 92) deletePlan(planId);
    else row.style.transform = "";
    startX = 0;
  });
}

function openSheet() {
  sheetBackdrop.hidden = false;
  planSheet.classList.add("open");
  planSheet.setAttribute("aria-hidden", "false");
  document.getElementById("medicineName").focus();
}

function closeSheet() {
  planSheet.classList.remove("open");
  planSheet.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    if (!planSheet.classList.contains("open")) sheetBackdrop.hidden = true;
  }, 220);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, Math.floor(rect.width * dpr));
  height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.width = width;
  canvas.height = height;
  initParticles();
  updateCatMetrics();
}

function initParticles() {
  const count = Math.min(1100, Math.max(620, Math.floor((width * height) / 420)));
  particles = Array.from({ length: count }, (_, index) => {
    const seed = index / count;
    const angle = seed * Math.PI * 2;
    const outlineNoise = 0.88 + Math.random() * 0.22;
    return {
      angle,
      layer: Math.random(),
      radius: outlineNoise,
      speed: 0.16 + Math.random() * 0.36,
      phase: Math.random() * Math.PI * 2,
      size: (0.72 + Math.random() * 1.45) * dpr,
    };
  });
}

function updateCatMetrics() {
  const stage = canvas.getBoundingClientRect();
  const cat = catWrap.getBoundingClientRect();
  metricsCache = {
    cx: (cat.left - stage.left + cat.width / 2) * dpr,
    cy: (cat.top - stage.top + cat.height * 0.52) * dpr,
    rx: cat.width * 0.41 * dpr,
    ry: cat.height * 0.39 * dpr,
    mouthX: (cat.left - stage.left + cat.width / 2) * dpr,
    mouthY: (cat.top - stage.top + cat.height * 0.53) * dpr,
  };
}

function draw(time = 0) {
  const t = time / 1000;
  const metrics = metricsCache;
  if (!metrics) {
    requestAnimationFrame(draw);
    return;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  for (const particle of particles) {
    const density = visualState === "Satisfied" ? 1.35 : visualState === "Hungry" ? 0.72 : 1;
    const angle = particle.angle + t * particle.speed * 0.18;
    const aura = purr ? 0.58 : 1;
    const ripple = Math.sin(t * 2.2 + particle.phase) * 12 * dpr;
    const burstPush = burst * 110 * dpr * (0.4 + particle.layer);
    const x = metrics.cx + Math.cos(angle) * (metrics.rx * particle.radius * aura + ripple + burstPush);
    const y = metrics.cy + Math.sin(angle) * (metrics.ry * particle.radius * aura + ripple + burstPush * 0.72);
    const alpha = 0.38 * density;
    const color = particle.layer > 0.66 ? "255, 249, 238" : particle.layer > 0.36 ? "255, 215, 106" : "139, 209, 255";
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, particle.size * density, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPetals(t);
  burst *= 0.93;
  if (purr) vibrate([7, 28, 7]);
  requestAnimationFrame(draw);
}

function drawPetals(t) {
  for (const petal of petals) {
    petal.y += petal.vy;
    petal.x += Math.sin(t * 2 + petal.phase) * 0.8 * dpr;
    petal.life -= 0.012;
    ctx.save();
    ctx.translate(petal.x, petal.y);
    ctx.rotate(t + petal.phase);
    ctx.fillStyle = `rgba(${petal.kind === "heart" ? "244, 154, 154" : "255, 224, 182"}, ${Math.max(0, petal.life)})`;
    if (petal.kind === "heart") drawHeart(petal.size);
    else drawPetal(petal.size);
    ctx.restore();
  }
  petals = petals.filter((petal) => petal.life > 0 && petal.y < height + 40 * dpr);
}

function drawPetal(size) {
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.55, size, 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeart(size) {
  ctx.beginPath();
  ctx.moveTo(0, size * 0.45);
  ctx.bezierCurveTo(-size, -size * 0.15, -size * 0.7, -size, 0, -size * 0.42);
  ctx.bezierCurveTo(size * 0.7, -size, size, -size * 0.15, 0, size * 0.45);
  ctx.fill();
}

function spawnPetals(count) {
  const metrics = metricsCache;
  if (!metrics) return;
  for (let i = 0; i < count; i += 1) {
    petals.push({
      x: metrics.cx + (Math.random() - 0.5) * metrics.rx * 2,
      y: metrics.cy + (Math.random() - 0.5) * metrics.ry,
      vy: (0.6 + Math.random() * 1.2) * dpr,
      size: (4 + Math.random() * 6) * dpr,
      phase: Math.random() * Math.PI * 2,
      life: 0.9 + Math.random() * 0.4,
      kind: Math.random() > 0.52 ? "heart" : "petal",
    });
  }
}

function resetFoodOrb() {
  foodOrb.classList.remove("eating");
  foodOrb.style.transition = "";
  foodOrb.style.transform = "translate(-50%, 0)";
}

function animateFoodToCat(planId) {
  updateCatMetrics();
  const stage = canvas.getBoundingClientRect();
  const metrics = metricsCache;
  if (!metrics) {
    feedingPlanId = null;
    resetFoodOrb();
    return;
  }
  const orb = foodOrb.getBoundingClientRect();
  const orbX = orb.left + orb.width / 2;
  const orbY = orb.top + orb.height / 2;
  const mouthX = stage.left + metrics.mouthX / dpr;
  const mouthY = stage.top + metrics.mouthY / dpr;
  const dx = mouthX - orbX;
  const dy = mouthY - orbY;

  foodOrb.classList.add("eating");
  foodOrb.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px) scale(0.42)`;
  window.clearTimeout(animateFoodToCat.timer);
  animateFoodToCat.timer = window.setTimeout(() => completeFeeding(planId), 650);
}

function updateAmbience() {
  document.body.classList.remove("night");
}

function vibrate(pattern) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

document.getElementById("openPlan").addEventListener("click", openSheet);
document.getElementById("closePlan").addEventListener("click", closeSheet);
sheetBackdrop.addEventListener("click", closeSheet);

planForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(planForm);
  const name = form.get("medicineName").trim();
  const time = form.get("medicineTime");
  if (!name || !time) return;
  data.plans.push({
    id: crypto.randomUUID(),
    name,
    time,
    dose: form.get("medicineDose").trim(),
  });
  planForm.reset();
  saveData();
  render();
});

foodOrb.addEventListener("click", () => {
  if (activePlanId) startFeeding(activePlanId);
});

catWrap.addEventListener("pointerdown", (event) => {
  purr = true;
  catWrap.setPointerCapture(event.pointerId);
  setVisualState("Happy", true);
});
catWrap.addEventListener("pointerup", () => {
  purr = false;
});
catWrap.addEventListener("pointercancel", () => {
  purr = false;
});

window.addEventListener("resize", resizeCanvas);
window.setInterval(() => {
  updateAmbience();
  if (data.day !== resetKey()) {
    data.day = resetKey();
    data.checkins = {};
    saveData();
    render();
  } else if (visualState !== "Feeding" && visualState !== "Happy") {
    setVisualState(deriveState());
  }
}, 30_000);

updateAmbience();
resizeCanvas();
render();
requestAnimationFrame(draw);
