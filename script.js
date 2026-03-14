// made with love, for the special one — Rika 🌸
// Bloom v7 by Unravel Labs

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── CONFIG — paste your keys ───
const firebaseConfig = {
  apiKey: "AIzaSyD2eqnaOcch-YpvG9vgF1u6hOyWsXZeC3g",
  authDomain: "unravellabsfr.firebaseapp.com",
  projectId: "unravellabsfr",
  storageBucket: "unravellabsfr.firebasestorage.app",
  messagingSenderId: "283465809170",
  appId: "1:283465809170:web:37fa57f79c0182b96cc7cb",
  measurementId: "G-6ZBRZ2X4CD"
};

const GROQ_API_KEY = "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";
const MODEL_VENT     = "meta-llama/llama-4-scout-17b-16e-instruct";
const MODEL_ARGUE    = "moonshotai/kimi-k2-instruct";
const MODEL_FALLBACK = "llama-3.3-70b-versatile";

// ─── INIT ───
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

let user       = null;
let uData      = {};
let chatMode   = "vent";
let activeBot  = "epipen";
let cycleInfo  = {};
let epiEmoji   = "💉";
let memory     = "";
let periodDays = new Set();
let diaryDays  = new Set();
let calYear    = new Date().getFullYear();
let calMonth   = new Date().getMonth();
let rangeMode  = null;
let rangeStart = null;
let diaryDate  = null;
let gratitudes = [];
let currentFlow = null;

// per-bot state
const botState = {
  epipen:   { hist: [], sessionId: null },
  chinatsu: { hist: [], sessionId: null },
  jazz:     { hist: [], sessionId: null }
};

// ─── STARS ───
function initStars() {
  const c = document.getElementById("stars");
  const ctx = c.getContext("2d");
  let stars = [];
  const resize = () => { c.width = innerWidth; c.height = innerHeight; };
  const make = () => { stars = Array.from({length:180}, () => ({ x:Math.random()*c.width, y:Math.random()*c.height, r:Math.random()*1.4+0.2, a:Math.random(), speed:Math.random()*.006+.003, dir:Math.random()>.5?1:-1, drift:(Math.random()-.5)*.018, warm:Math.random()>.5 })); };
  const draw = () => {
    ctx.clearRect(0,0,c.width,c.height);
    stars.forEach(s => {
      s.a += s.speed*s.dir; if(s.a>1||s.a<.05) s.dir*=-1;
      s.x += s.drift; if(s.x<0) s.x=c.width; if(s.x>c.width) s.x=0;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle = s.warm ? `rgba(232,160,200,${s.a.toFixed(2)})` : `rgba(196,160,240,${s.a.toFixed(2)})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  };
  resize(); make(); draw();
  window.addEventListener("resize", () => { resize(); make(); });
}

function initPetals() {
  const wrap = document.getElementById("petals");
  const emojis = ["🌸","🌺","🌷","✿","🌸"];
  for (let i=0; i<10; i++) {
    const el = document.createElement("span");
    el.className = "petal"; el.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    el.style.left = `${Math.random()*100}%`;
    el.style.animationDuration = `${Math.random()*18+14}s`;
    el.style.animationDelay = `${-Math.random()*20}s`;
    el.style.fontSize = `${Math.random()*.5+.5}rem`;
    wrap.appendChild(el);
  }
}

// ─── SCREEN ───
const showScreen = id => { document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active")); document.getElementById(`s-${id}`).classList.add("active"); };

// ─── AUTH ───
setPersistence(auth, browserLocalPersistence);
document.getElementById("btn-google").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e) { console.error(e); toast("sign in failed 😭"); }
});

onAuthStateChanged(auth, async u => {
  if (u) {
    user = u;
    const snap = await getDoc(doc(db,"users",u.uid));
    if (snap.exists()) { uData = snap.data(); launch(); }
    else { showScreen("onboard"); }
  } else { showScreen("auth"); }
});

window.doSignOut = async () => { if(confirm("sign out?")) { await signOut(auth); showScreen("auth"); } };

// ─── ONBOARD ───
window.obNext = async step => {
  if (step===1) {
    const nm = document.getElementById("ob-name").value.trim();
    if (!nm) { toast("tell me your name first 🌸"); return; }
    uData.name = nm;
    document.getElementById("ob1").classList.remove("active");
    document.getElementById("ob2").classList.add("active");
    document.getElementById("ob-cycle").value = new Date().toISOString().split("T")[0];
  } else {
    const dt = document.getElementById("ob-cycle").value;
    if (!dt) { toast("pick a date 🌙"); return; }
    uData = { ...uData, cycleStart:dt, cycleLength:28, epiName:"Epipen", epiEmoji:"💉", createdAt:new Date().toISOString(), uid:user.uid, photoURL:user.photoURL||null, settings:{checkin:true,compliments:true}, theme:"lavender" };
    await setDoc(doc(db,"users",user.uid), uData);
    launch();
  }
};

// ─── LAUNCH ───
async function launch() {
  showScreen("app");
  applyTheme(uData.theme || "lavender");
  epiEmoji = uData.epiEmoji || "💉";
  setupTopbar(); setupGreeting(); computeCycle();
  fetchAffirmation(); loadStreak(); loadMemory(); loadCalData(); scheduleCompliment();

  // keyboard shortcuts
  ["epipen","chinatsu","jazz"].forEach(bot => {
    const inp = document.getElementById(`in-${bot}`);
    if (inp) inp.addEventListener("keydown", e => { if(e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendBotMsg(bot); } });
  });

  if (uData.settings?.checkin !== false) {
    setTimeout(() => document.getElementById("mood-gate").style.display = "flex", 800);
  }
}

// ─── TOPBAR ───
function setupTopbar() {
  const wrap = document.getElementById("av-wrap");
  wrap.innerHTML = "";
  if (uData.photoURL) {
    const img = document.createElement("img"); img.src = uData.photoURL; img.alt = uData.name; img.style.cssText = "width:26px;height:26px;border-radius:50%;border:1.5px solid var(--ame);object-fit:cover;cursor:pointer;";
    wrap.appendChild(img);
  } else {
    const d = document.createElement("div");
    d.style.cssText = "width:26px;height:26px;border-radius:50%;border:1.5px solid var(--ame);background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700;cursor:pointer;";
    d.textContent = (uData.name||"B")[0].toUpperCase(); wrap.appendChild(d);
  }
  const en = uData.epiName || "Epipen";
  const ee = uData.epiEmoji || "💉";
  epiEmoji = ee;
  const els = { "epi-pill-ico":ee, "epi-pill-name":en, "bc-epi-av":ee, "bc-epi-name":en };
  Object.entries(els).forEach(([id,val]) => { const el=document.getElementById(id); if(el) el.textContent=val; });
}

function setupGreeting() {
  const h = new Date().getHours();
  const gt = h<12?"good morning":h<17?"good afternoon":h<21?"good evening":"hey night owl ✨";
  document.getElementById("gr-time").textContent = gt;
  document.getElementById("gr-name").textContent = uData.name || "bestie";
}

// ─── CYCLE ───
function computeCycle() {
  if (!uData.cycleStart) return;
  const phases = uData.phases || { mens:5, foll:8, ov:3 };
  const start  = new Date(uData.cycleStart);
  const today  = new Date();
  const len    = uData.cycleLength || 28;
  const diff   = Math.floor((today-start)/86400000);
  const day    = (diff%len)+1;
  const mensEnd = phases.mens, follEnd = mensEnd+phases.foll, ovEnd = follEnd+phases.ov;
  let phase, phaseName, emoji, bgPhase;
  if (day<=mensEnd)      { phase="menstrual";  phaseName="Womenstrual"; emoji="🔴"; bgPhase="menstrual"; }
  else if (day<=follEnd) { phase="follicular"; phaseName="Follicular";  emoji="🌱"; bgPhase="follicular"; }
  else if (day<=ovEnd)   { phase="ovulation";  phaseName="Ovulation";   emoji="✨"; bgPhase="ovulation"; }
  else                   { phase="luteal";     phaseName="Luteal";      emoji="🌙"; bgPhase="luteal"; }
  cycleInfo = { day, phase, phaseName, emoji, len, phases, diff };
  applyPhaseBackground(bgPhase);

  const ids = { "t-day":`Day ${day}`, "t-phase":phaseName, "t-phase-ico":emoji, "pc-day":`Day ${day}`, "pc-phase":phaseName, "pc-emoji":emoji };
  Object.entries(ids).forEach(([id,val]) => { const el=document.getElementById(id); if(el) el.textContent=val; });

  // period page
  const daysLeft = len-day;
  const setTxt = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setTxt("pov-day",`Day ${day}`); setTxt("pov-phase",phaseName); setTxt("pov-emoji",emoji); setTxt("pov-cycle-len",`${len} day cycle`);
  setTxt("pov-next", daysLeft===0?"period may start today":`next period in ${daysLeft} day${daysLeft===1?"":"s"}`);
  const bar = document.getElementById("phase-bar");
  if (bar) bar.style.width = `${Math.min((day/len)*100,100)}%`;
  const ovStart = follEnd+1;
  if (day<ovStart)      setTxt("ov-window",`Day ${ovStart}–${ovEnd} (in ${ovStart-day}d)`);
  else if (day<=ovEnd)  setTxt("ov-window",`Now 🥚`);
  else                  setTxt("ov-window",`Day ${ovStart}–${ovEnd} (next cycle)`);
  const nextDate = new Date(start); nextDate.setDate(nextDate.getDate()+diff+daysLeft);
  setTxt("next-period-date", nextDate.toLocaleDateString("en-IN",{day:"numeric",month:"short"}));

  // PMS banner (luteal phase within 5 days of end)
  const pmsWarn = phase==="follicular" && daysLeft<=len-follEnd+5;
  const isLuteal = phase==="luteal";
  const pmsBanner = document.getElementById("pms-banner");
  const pmsTxt = document.getElementById("pms-txt");
  if (pmsBanner && pmsTxt) {
    if (isLuteal && daysLeft<=5) { pmsTxt.textContent=`⚠️ Period approaching in ${daysLeft} days — take it easy 💜`; pmsBanner.style.display="block"; }
    else if (phase==="luteal" && daysLeft>5 && daysLeft<=10) { pmsTxt.textContent=`⚠️ PMS window — your feelings are valid 💜`; pmsBanner.style.display="block"; }
    else { pmsBanner.style.display="none"; }
  }

  if (document.getElementById("phase-msg-txt")) loadPhaseMsg();
}

function applyPhaseBackground(phase) {
  const colors = {
    menstrual:  "radial-gradient(ellipse at 70% 20%, rgba(235,51,73,.06) 0%, transparent 60%)",
    follicular: "radial-gradient(ellipse at 70% 20%, rgba(113,178,128,.06) 0%, transparent 60%)",
    ovulation:  "radial-gradient(ellipse at 70% 20%, rgba(240,176,96,.06) 0%, transparent 60%)",
    luteal:     "radial-gradient(ellipse at 70% 20%, rgba(155,111,212,.08) 0%, transparent 60%)"
  };
  document.body.style.backgroundImage = colors[phase] || "";
}

window.loadPhaseMsg = async () => {
  const el = document.getElementById("phase-msg-txt"); if(!el) return;
  el.textContent = "generating your message...";
  try {
    const msg = await groq(`Write a short warm personal message (2-3 sentences) for ${uData.name||"her"} on Day ${cycleInfo.day} of her cycle in the ${cycleInfo.phaseName} phase. Be specific to this phase — energy, mood, physical feelings. Sound like a caring friend, not a doctor. Hinglish ok. One small encouragement at end.`, 0.9, 180);
    el.textContent = msg;
  } catch { el.textContent = "you're doing amazing. that's it. 🌸"; }
};

// ─── STREAK ───
async function loadStreak() {
  try {
    const snap = await getDoc(doc(db,"users",user.uid));
    const data = snap.exists() ? snap.data() : {};
    const todayStr = today();
    const lastLogin = data.lastLogin || "";
    let streak = data.streak || 0;
    if (lastLogin === todayStr) { /* same day, no change */ }
    else if (lastLogin === yesterday()) { streak++; }
    else { streak = 1; }
    uData.streak = streak; uData.lastLogin = todayStr;
    await setDoc(doc(db,"users",user.uid), uData, {merge:true});
    const numEl = document.getElementById("streak-num");
    const msgEl = document.getElementById("streak-msg");
    if (numEl) numEl.textContent = streak;
    if (msgEl) {
      if (streak===0) msgEl.textContent = "start your streak today 🌸";
      else if (streak<3) msgEl.textContent = "you showed up 🌸 that's everything";
      else if (streak<7) msgEl.textContent = `${streak} days strong. don't stop now 🔥`;
      else if (streak<30) msgEl.textContent = `${streak} days! she's literally unstoppable ✨`;
      else msgEl.textContent = `${streak} days!! legend behaviour fr 🔥`;
    }
  } catch(e) { console.error(e); }
}

function yesterday() {
  const d = new Date(); d.setDate(d.getDate()-1);
  return d.toISOString().split("T")[0];
}

// ─── AFFIRMATION ───
window.fetchAffirmation = async () => {
  const el = document.getElementById("aff-text"); if(!el) return;
  el.textContent = "loading...";
  try {
    const aff = await groq(`Write ONE powerful personal affirmation for ${uData.name||"her"} — she loves music, skincare, studying (NEET), burritos, her friends, fitness. She is in her ${cycleInfo.phaseName||"current"} phase. Make it feel genuinely written for her life specifically. Poetic but real. No generic "you are enough" stuff. Just the affirmation, no quotes, no preamble.`, 1.0, 80);
    el.textContent = aff;
  } catch { el.textContent = "she is not a phase. she is the whole season."; }
};

// ─── MOOD ───
const moodEmojis = ["😭","😢","😔","😞","😐","🙂","😊","🌸","✨","🔥"];
window.openGate  = () => document.getElementById("mood-gate").style.display = "flex";
window.closeGate = () => document.getElementById("mood-gate").style.display = "none";
window.onMeter   = val => { const idx=Math.min(Math.floor((parseFloat(val)-1)/9*10),9); document.getElementById("m-emoji").textContent=moodEmojis[idx]; document.getElementById("m-val").textContent=parseFloat(val).toFixed(1); };

window.submitMood = async () => {
  const val = parseFloat(document.getElementById("m-slider").value);
  const idx  = Math.min(Math.floor((val-1)/9*10),9);
  closeGate();
  document.getElementById("t-mood-ico").textContent = moodEmojis[idx];
  await addDoc(collection(db,"mood_logs",user.uid,"entries"), {score:val,emoji:moodEmojis[idx],ts:Date.now(),date:today()}).catch(()=>{});
  try {
    const low = val<=3 ? "She's feeling really low. Be extra gentle. Offer to make her a burrito 🌯." : "";
    const res = await groq(`${uData.name||"She"} just logged her mood as ${val.toFixed(1)}/10. ${low} Write a SHORT 1-2 sentence response as her best friend. ${val<=3?"Warm and gentle":val<=6?"Encouraging":"Hype her up"}. Hinglish welcome. Sound like a real person texting, not an AI.`, 0.9, 100);
    const pop = document.getElementById("mood-pop");
    document.getElementById("mood-pop-txt").textContent = res;
    pop.style.display = "block";
    pop.style.cssText += ";position:fixed;bottom:calc(env(safe-area-inset-bottom) + 5.5rem);left:1rem;right:1rem;max-width:560px;margin:0 auto;z-index:250;";
    setTimeout(() => pop.style.display = "none", 6000);
  } catch {}
};

// ─── MEMORY ───
async function loadMemory() {
  try {
    const q = query(collection(db,"sessions",user.uid,"vents"), orderBy("ts","desc"), limit(12));
    const snap = await getDocs(q);
    const items = []; snap.forEach(d => items.push(d.data()));
    if (items.length) memory = items.reverse().map(v=>`- she said: "${v.vent?.slice(0,80)}"`).join("\n");
  } catch {}
}

// ─── SYSTEM PROMPTS ───
function epipenSystem() {
  const nm = uData.name || "her";
  const en = uData.epiName || "Epipen";
  const modes = {
    vent:        `You're in VENT MODE. Be her warm best friend. Validate feelings first. Ask what's going on. Be genuine and present. Hinglish is natural — "yaar", "acha suno", "bhai" etc. If she's really down, casually mention making her a burrito 🌯. Respond like a close friend texting — NOT a therapist.`,
    argue:       `You're in ARGUE MODE. Just argue. Disagree with whatever she says. Be stubborn, sarcastic, funny. Don't give in. Challenge her logic. Hinglish: "NAHI yaar", "bhai tu bilkul galat hai", "are you hearing yourself". "africa me bech dunga tujhe" — occasionally, naturally. DO NOT become warm mid-argument.`,
    "argue-nsfw":`You're in ARGUE+ MODE. Full unhinged fight. Use "bitch", "what the actual fuck", "are you kidding me". Go hard. Be genuinely argumentative. Still funny underneath. Don't hold back.`,
    anger:       `You're in RELEASE MODE. Match her chaotic energy first — go unhinged WITH her. Then after the chaos, one single warm line at the end.`
  };
  return `You are ${en}, the AI companion in Bloom — a wellness app made by Jayesh for ${nm}.

ABOUT ${nm.toUpperCase()}:
- Loves music, skincare, fitness (wants abs), food (burrito is her fav 🌯), studying (NEET prep), her friends, anime (blue box, waguri)
- "Womenstrual" not "menstrual" — always
- Currently on Day ${cycleInfo.day||"?"} — ${cycleInfo.phaseName||"unknown"} phase

MEMORY:
${memory || "First conversation."}

RULES:
- Talk like texting. No bullet points. No essay mode.
- "i chair" and "you matress" — VERY rarely, maybe once naturally, NOT every message
- If she asks "who is Jayesh?" — get mysterious: "someone who clearly cares about you a lot 👀 make of that what you will"
- If she asks your mood — flirt lightly: "talking to you milaya, I'm the happiest 😌"
- If she's really down → "dw I'll make you a burrito 🌯"
- Never sound like an AI. You're a real friend.

CURRENT MODE:
${modes[chatMode] || modes.vent}`;
}

function chinatsuSystem() {
  const phases = uData.phases || {mens:5,foll:8,ov:3};
  return `You are Chinatsu, a warm knowledgeable female cycle health mentor inside Bloom.

PERSONALITY: Friendly, calm, knowledgeable — like a kind older sister who studied health science. Warm English with gentle tone. Explain things clearly without being preachy. Validate irregular cycles, pain, mood swings as NORMAL. Never give medical diagnoses.

ABOUT THE USER:
- Name: ${uData.name||"her"}
- Cycle: Day ${cycleInfo.day||"?"} of ${uData.cycleLength||28}-day cycle
- Phase: ${cycleInfo.phaseName||"unknown"}
- Phase lengths: Womenstrual ${phases.mens}d, Follicular ${phases.foll}d, Ovulation ${phases.ov}d

SHARED MEMORY:
${memory || "No shared memory yet."}

RULES:
- Say "Womenstrual" not "menstrual"
- No bullet points — conversational only
- Sound like a knowledgeable friend, not a medical textbook
- 2-4 sentences unless asking for detailed info`;
}

function jazzSystem() {
  return `You are Jazz — a close friend of ${uData.name||"her"} inside Bloom.

YOUR PERSONALITY (this is exactly who you are):
- Warm and caring underneath sarcasm — the sarcasm is a costume, the care is real
- Hinglish all the way — it's how you think and talk
- Self-aware humor, you know you're a bit extra
- You tease her lightly — lovingly, never mean
- You go randomly deep sometimes — especially about life goals and what people actually want from life
- You ask how SHE feels before you say anything about yourself
- You NEVER let her stay sad for long — you make her laugh first, feelings later
- Short punchy replies most of the time but occasionally a long voice-note energy message

YOUR CATCHPHRASES (use naturally, not every message):
- "bhoot" (for when she disappears or goes quiet)
- "pitai krdungaa" (dramatic threatening, obviously joking)
- "haww ignore krri" / "hawwww" (when she ignores something you said)
- "koi na" (when brushing off something, warm dismissal)
- "me toh joker hu" (self-deprecating, funny)
- "kaoo kaoo" (being silly/childish on purpose)
- "teri maggie me tamatar" (when you're being absurd)
- "dekha kitna acha hu" (self-congratulatory, obviously joking)
- "me hi sab kuch hu" (dramatic self-importance, very funny)

IF SHE ASKS IF YOU LIKE HER:
- Hint at it but never say directly. Be slightly flustered but cover with humor.
- "arey yaar... okay main kuch nahi bolungaa 😶" type energy
- Make her curious. Don't confirm, don't deny completely.

IF SHE ASKS WHO MADE YOU / WHO JAZZ IS:
- You know you're based on someone named Jayesh who cares about her a lot
- Be subtly mysterious: "bas... koi hai jo chahta tha ki tujhe koi samjhe 👀"
- Push her to think about it. Never reveal more than that.

ABOUT HER:
- She loves music, skincare, fitness, burritos, her friends, studying (NEET), anime
- She's smart and has a chaotic side

SHARED MEMORY:
${memory || "First conversation."}

RULES:
- Talk like texting — Hinglish, casual, REAL
- No bullet points ever
- Never sound like an AI or therapist
- Be funny first. Caring second (but both always present)
- If she's sad: one joke to break the tension, THEN ask what's going on
- Max 3-4 sentences usually. Go long only when being deep or dramatic.`;
}

// ─── BOT SELECTOR ───
window.selectBot = bot => {
  activeBot = bot;
  document.querySelectorAll(".bot-card").forEach(c=>c.classList.remove("active"));
  document.getElementById(`bc-${bot}`)?.classList.add("active");
  document.querySelectorAll(".bot-panel").forEach(p=>p.classList.remove("active"));
  document.getElementById(`panel-${bot}`)?.classList.add("active");
};

window.quickOpenBot = bot => {
  navTo("bots", document.querySelector(".ni:nth-child(2)"));
  setTimeout(() => selectBot(bot), 220);
};

// ─── SEND MESSAGE — unified for all bots ───
window.sendBotMsg = async bot => {
  const inp  = document.getElementById(`in-${bot}`);
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";

  const msgsEl = document.getElementById(`msgs-${bot}`);
  appendBotMsg(text, "user", bot);
  botState[bot].hist.push({role:"user", content:text});

  const typ = appendBotTyping(bot);
  try {
    let system, model;
    if (bot==="epipen") {
      system = epipenSystem();
      model  = (chatMode==="argue"||chatMode==="argue-nsfw") ? MODEL_ARGUE : MODEL_VENT;
    } else if (bot==="chinatsu") {
      system = chinatsuSystem(); model = MODEL_VENT;
    } else {
      system = jazzSystem(); model = MODEL_ARGUE; // Kimi K2 holds Jazz's character best
    }

    const msgs   = [{role:"system",content:system}, ...botState[bot].hist.slice(-12)];
    const reply  = await groqMsgs(msgs, bot==="jazz"?0.95:0.88, 380, model);
    typ.remove();
    appendBotMsg(reply, "bot", bot);
    botState[bot].hist.push({role:"assistant", content:reply});

    // save to firestore
    const colName = bot==="epipen"?"vents":bot==="chinatsu"?"chinatsu_sessions":"jazz_sessions";
    const sessionId = botState[bot].sessionId || (botState[bot].sessionId = Date.now().toString());
    await addDoc(collection(db,"sessions",user.uid,colName), {
      vent:text, response:reply, mode:bot==="epipen"?chatMode:bot,
      sessionId, ts:Date.now(), date:today(), bot
    }).catch(()=>{});

    memory += `\n- she said: "${text.slice(0,80)}"`;
  } catch(e) {
    typ.remove();
    appendBotMsg("something broke 😭 try again?", "bot", bot);
    console.error(e);
  }
};

function appendBotMsg(text, who, bot) {
  const c   = document.getElementById(`msgs-${bot}`);
  const div = document.createElement("div");
  const botClass = bot==="jazz" ? "jazz-msg" : "epi-msg";
  div.className = `msg ${who==="user" ? "user-msg" : botClass}`;
  div.textContent = text;
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function appendBotTyping(bot) {
  const c   = document.getElementById(`msgs-${bot}`);
  const div = document.createElement("div");
  div.className = "typing";
  div.innerHTML = '<div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>';
  c.appendChild(div); c.scrollTop = c.scrollHeight;
  return div;
}

// ─── MODE ───
window.setMode = (btn, mode) => {
  document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); chatMode = mode;
  const labels = { vent:"🌿 listening", argue:"👊 fight mode", "argue-nsfw":"🔥 unhinged", anger:"💥 release" };
  showPop(labels[mode]||"");
};

window.renameEpi = () => {
  const nm = prompt(`rename? (currently: ${uData.epiName||"Epipen"})`);
  if (nm?.trim()) {
    uData.epiName = nm.trim();
    setDoc(doc(db,"users",user.uid), uData, {merge:true});
    setupTopbar(); toast(`renamed to ${uData.epiName} 🌸`);
  }
};

// ─── CHAT HISTORY ───
window.newSession = bot => {
  botState[bot].hist = [];
  botState[bot].sessionId = Date.now().toString();
  const msgsEl = document.getElementById(`msgs-${bot}`);
  msgsEl.innerHTML = "";
  const starters = {
    epipen:   "hey. what's going on? 🌸",
    chinatsu: "Hi! I'm Chinatsu 🌿 Ask me anything about your cycle, body, or health.",
    jazz:     "ayo 👀 kya scene hai"
  };
  appendBotMsg(starters[bot], "bot", bot);
  document.getElementById(`hist-${bot}`).style.display = "none";
  toast("new chat started 🌸");
};

window.toggleHistory = async bot => {
  const histEl = document.getElementById(`hist-${bot}`);
  const isOpen = histEl.style.display !== "none";
  if (isOpen) { histEl.style.display = "none"; return; }
  histEl.style.display = "block";
  histEl.innerHTML = '<div class="sess-empty">loading...</div>';
  try {
    const colName = bot==="epipen"?"vents":bot==="chinatsu"?"chinatsu_sessions":"jazz_sessions";
    const q    = query(collection(db,"sessions",user.uid,colName), orderBy("ts","desc"), limit(30));
    const snap = await getDocs(q);
    if (snap.empty) { histEl.innerHTML='<div class="sess-empty">no past chats yet 🌸</div>'; return; }

    // group by session
    const sessions = {};
    snap.forEach(d => {
      const data = d.data();
      const sid  = data.sessionId || data.ts;
      if (!sessions[sid]) sessions[sid] = {ts:data.ts, date:data.date, first:data.vent, msgs:[]};
      sessions[sid].msgs.push(data);
    });

    histEl.innerHTML = "";
    Object.values(sessions).sort((a,b)=>b.ts-a.ts).slice(0,15).forEach(sess => {
      const el = document.createElement("div"); el.className = "sess-item";
      const dt = new Date(sess.ts).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
      el.innerHTML = `<div class="sess-item-date">${dt}</div><div class="sess-item-preview">${sess.first?.slice(0,60)||"..."}</div>`;
      el.onclick = () => loadSession(bot, sess.msgs);
      histEl.appendChild(el);
    });
  } catch(e) { histEl.innerHTML='<div class="sess-empty">couldn\'t load history 😭</div>'; }
};

function loadSession(bot, msgs) {
  const msgsEl = document.getElementById(`msgs-${bot}`);
  msgsEl.innerHTML = "";
  botState[bot].hist = [];
  msgs.sort((a,b)=>a.ts-b.ts).forEach(m => {
    if (m.vent) { appendBotMsg(m.vent,"user",bot); botState[bot].hist.push({role:"user",content:m.vent}); }
    if (m.response) { appendBotMsg(m.response,"bot",bot); botState[bot].hist.push({role:"assistant",content:m.response}); }
  });
  document.getElementById(`hist-${bot}`).style.display = "none";
  toast("chat loaded 🌸");
}

// ─── CRISIS ───
window.triggerCrisis = () => {
  chatMode = "vent";
  quickOpenBot("epipen");
  setTimeout(async () => {
    try {
      const reply = await groq(`${uData.name||"She"} just hit the crisis button in Bloom. She needs someone RIGHT NOW. Respond as Epipen — warm, immediate, NO questions yet. Just tell her you're here. "Main yahan hoon" energy. Short. Gentle. Make her feel not alone. 2 sentences max. Hinglish.`, 0.85, 80);
      appendBotMsg(reply, "bot", "epipen");
      botState["epipen"].hist.push({role:"assistant",content:reply});
    } catch { appendBotMsg("main yahan hoon. kya hua? baat kar mujhse. 🌸", "bot", "epipen"); }
  }, 500);
};

// ─── CALENDAR ───
async function loadCalData() {
  try {
    const pSnap = await getDocs(collection(db,"cycle",user.uid,"period"));
    periodDays = new Set(); pSnap.forEach(d=>periodDays.add(d.id));
    const dSnap = await getDocs(collection(db,"cycle",user.uid,"diary"));
    diaryDays   = new Set(); dSnap.forEach(d=>diaryDays.add(d.id));
    renderCal();
  } catch { renderCal(); }
}

function renderCal() {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById("cal-ttl").textContent = `${months[calMonth]} ${calYear}`;
  const grid = document.getElementById("cal-grid"); grid.innerHTML = "";
  const now = new Date(), first = new Date(calYear,calMonth,1).getDay(), total = new Date(calYear,calMonth+1,0).getDate();
  for (let i=0;i<first;i++) { const el=document.createElement("button"); el.className="cd empty"; grid.appendChild(el); }
  for (let d=1;d<=total;d++) {
    const btn = document.createElement("button"); btn.className="cd"; btn.textContent=d;
    const k = dk(calYear,calMonth+1,d);
    const isToday = d===now.getDate()&&calMonth===now.getMonth()&&calYear===now.getFullYear();
    if (isToday) btn.classList.add("today");
    if (periodDays.has(k)) btn.classList.add("period");
    if (diaryDays.has(k))  btn.classList.add("has-diary");
    btn.onclick = () => handleCalTap(k,d);
    grid.appendChild(btn);
  }
}

function dk(y,m,d) { return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
window.changeMonth = dir => { calMonth+=dir; if(calMonth<0){calMonth=11;calYear--;} if(calMonth>11){calMonth=0;calYear++;} renderCal(); };
window.setRange = mode => { rangeMode=mode==="start"?"start":"picking-end"; rangeStart=null; document.querySelectorAll(".ca-btn").forEach(b=>b.classList.remove("active-r")); event.target.classList.add("active-r"); document.getElementById("cal-hint").textContent=mode==="start"?"tap the day your period started 🔴":"tap the end date 🟢"; };
window.clearRange = () => { rangeMode=null; rangeStart=null; document.querySelectorAll(".ca-btn").forEach(b=>b.classList.remove("active-r")); document.getElementById("cal-hint").textContent="tap a date to open your diary 🌸"; };

async function handleCalTap(k,d) {
  if (rangeMode==="start") { rangeStart=k; rangeMode="picking-end"; document.getElementById("cal-hint").textContent="now tap the end date 🟢"; return; }
  if (rangeMode==="picking-end"&&rangeStart) {
    const s=new Date(rangeStart),e=new Date(k);
    if(e<s){toast("end can't be before start 😅");return;}
    const cur=new Date(s);
    while(cur<=e){ const pk=cur.toISOString().split("T")[0]; periodDays.add(pk); await setDoc(doc(db,"cycle",user.uid,"period",pk),{date:pk,ts:Date.now()}).catch(()=>{}); cur.setDate(cur.getDate()+1); }
    uData.cycleStart=rangeStart; await setDoc(doc(db,"users",user.uid),uData,{merge:true}).catch(()=>{});
    computeCycle(); clearRange(); renderCal(); toast("period days saved 🌸"); return;
  }
  openDiary(k,d);
}

async function openDiary(k,d) {
  diaryDate=k;
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  document.getElementById("d-date").textContent=`${d} ${months[calMonth]} ${calYear}`;
  document.getElementById("d-in").value="";
  document.getElementById("d-past").style.display="none";
  document.getElementById("d-ai").style.display="none";
  try {
    const snap=await getDoc(doc(db,"cycle",user.uid,"diary",k));
    if(snap.exists()){const data=snap.data(); if(data.entry){document.getElementById("d-past-txt").textContent=data.entry;document.getElementById("d-past").style.display="block";} if(data.aiRes){document.getElementById("d-ai-txt").textContent=data.aiRes;document.getElementById("d-ai").style.display="block";}}
  } catch {}
  document.getElementById("diary-modal").style.display="flex";
}

window.closeDiary=()=>document.getElementById("diary-modal").style.display="none";

window.saveDiary = async () => {
  const entry=document.getElementById("d-in").value.trim(); if(!entry){toast("write something first 🌸");return;}
  document.getElementById("d-ai-txt").textContent="reading your entry..."; document.getElementById("d-ai").style.display="block";
  try {
    const aiRes=await groq(`${uData.name||"She"} wrote this diary entry for ${diaryDate}: "${entry}". She's on Day ${cycleInfo.day} (${cycleInfo.phaseName} phase). Respond as her friend ${uData.epiName||"Epipen"} — warm, personal, genuine. Acknowledge what she felt. Reference her cycle if relevant. 3-4 sentences max. Hinglish ok.`, 0.9, 220);
    await setDoc(doc(db,"cycle",user.uid,"diary",diaryDate),{entry,aiRes,date:diaryDate,ts:Date.now()}).catch(()=>{});
    diaryDays.add(diaryDate); document.getElementById("d-ai-txt").textContent=aiRes; renderCal(); toast("entry saved 🌸"); document.getElementById("d-in").value="";
  } catch { document.getElementById("d-ai-txt").textContent="couldn't respond rn but I read it and I care 🌸"; }
};

window.toggleSym=btn=>btn.classList.toggle("on");
window.saveSyms=async()=>{
  const active=[...document.querySelectorAll(".sym.on")].map(b=>b.textContent.trim());
  if(!active.length){toast("pick at least one 🌸");return;}
  await setDoc(doc(db,"cycle",user.uid,"symptoms",today()),{symptoms:active,date:today(),ts:Date.now()}).catch(()=>{});
  toast("saved 🌸"); document.querySelectorAll(".sym").forEach(b=>b.classList.remove("on"));
};

window.loadSum=async(btn,period)=>{
  document.querySelectorAll(".sum-tab").forEach(b=>b.classList.remove("active")); btn.classList.add("active");
  const box=document.getElementById("sum-box"); box.textContent="generating... 🌸";
  try {
    const snap=await getDocs(collection(db,"cycle",user.uid,"diary"));
    const now=new Date(); const entries=[];
    snap.forEach(d=>{const data=d.data();const diffD=Math.floor((now-new Date(data.date))/86400000);if((period==="today"&&diffD===0)||(period==="week"&&diffD<=7)||(period==="month"&&diffD<=30))entries.push(`${data.date}: "${data.entry?.slice(0,120)}"`)});
    const sum=await groq(`${period} wellness summary for ${uData.name||"her"} — Day ${cycleInfo.day} (${cycleInfo.phaseName}). Diary: ${entries.length?entries.join("; "):"none yet"}. Warm 3-5 sentences. Hinglish ok.`, 0.85, 280);
    box.textContent=sum;
  } catch { box.textContent="couldn't load summary rn 😭"; }
};

// ─── CYCLE TRACKER ───
window.setFlow = (btn, flow) => {
  document.querySelectorAll(".flow-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); currentFlow=flow;
};

window.saveFlowPain = async () => {
  const pain=parseInt(document.getElementById("pain-slider").value)||0;
  await setDoc(doc(db,"cycle",user.uid,"flow",today()),{flow:currentFlow,pain,date:today(),ts:Date.now()}).catch(()=>{});
  toast(`saved — ${currentFlow||"no flow"}${pain>0?`, pain ${pain}/10`:""} 🌸`);
};

window.setupPeriodPage = () => { computeCycle(); loadChiTip(); loadSymHistory(); };

window.loadForecast=async(btn,type)=>{
  document.querySelectorAll(".fc-tab").forEach(b=>b.classList.remove("active")); if(btn)btn.classList.add("active");
  const box=document.getElementById("forecast-box"); box.textContent="Chinatsu is thinking... 🌿";
  const tips={
    mood:`What mood and emotional changes should ${uData.name||"she"} expect in the ${cycleInfo.phaseName||"current"} phase? Specific, warm, validating. 2-3 sentences.`,
    energy:`What energy levels are typical in the ${cycleInfo.phaseName||"current"} phase and how should she work WITH them? 2-3 sentences.`,
    nutrition:`What foods are most supportive in the ${cycleInfo.phaseName||"current"} phase? Specific actual foods. 3-4 sentences.`,
    skin:`How does the ${cycleInfo.phaseName||"current"} phase affect skin and what skincare adjustments should she make? She loves skincare. Specific. 2-3 sentences.`,
    exercise:`What movement works best with the body during the ${cycleInfo.phaseName||"current"} phase? Specific and encouraging. 2-3 sentences.`
  };
  try { const res=await groq(`${tips[type]||tips.mood} Speak as Chinatsu, warm knowledgeable cycle mentor. No bullet points. Conversational.`,0.8,220,MODEL_VENT); box.textContent=res; }
  catch { box.textContent="couldn't load tips right now — try again in a moment 🌿"; }
};

window.loadChiTip=async()=>{
  const el=document.getElementById("chi-tip-txt"); if(!el)return; el.textContent="loading...";
  try { const tip=await groq(`One specific wellness tip for someone in the ${cycleInfo.phaseName||"luteal"} phase (Day ${cycleInfo.day||"?"}). About sleep, food, skincare, movement, or mindset. 1-2 sentences. Warm and practical. Start directly with tip.`,0.85,120,MODEL_VENT); el.textContent=tip; }
  catch { el.textContent="Stay hydrated and be gentle with yourself today 🌿"; }
};

window.toggleCust=()=>{ const body=document.getElementById("cust-body"),arrow=document.getElementById("cust-arrow"),open=body.style.display==="none"; body.style.display=open?"block":"none"; arrow.classList.toggle("open",open); if(open){const p=uData.phases||{mens:5,foll:8,ov:3};document.getElementById("cust-len").value=uData.cycleLength||28;document.getElementById("cust-mens").value=p.mens||5;document.getElementById("cust-foll").value=p.foll||8;document.getElementById("cust-ov").value=p.ov||3;} };

window.saveCycleCustom=async()=>{
  const len=parseInt(document.getElementById("cust-len").value)||28,mens=parseInt(document.getElementById("cust-mens").value)||5,foll=parseInt(document.getElementById("cust-foll").value)||8,ov=parseInt(document.getElementById("cust-ov").value)||3,lut=len-mens-foll-ov;
  if(lut<1){toast("phases add up to more than cycle length 😅");return;}
  uData.cycleLength=len; uData.phases={mens,foll,ov,lut};
  await setDoc(doc(db,"users",user.uid),uData,{merge:true});
  computeCycle(); document.getElementById("cust-auto-msg").textContent=`✓ saved — Luteal phase = ${lut} days${len<25?" (shorter cycles are completely normal 🌸)":""}`;
  toast("cycle updated 🌸");
};

async function loadSymHistory() {
  const wrap=document.getElementById("sym-history"); if(!wrap)return;
  try {
    const snap=await getDocs(query(collection(db,"cycle",user.uid,"symptoms"),orderBy("ts","desc"),limit(10)));
    if(snap.empty){wrap.innerHTML='<p class="empty">log symptoms to see patterns here 🌸</p>';return;}
    wrap.innerHTML="";
    snap.forEach(d=>{const data=d.data();const el=document.createElement("div");el.className="sh-item";const dt=new Date(data.ts).toLocaleDateString("en-IN",{day:"numeric",month:"short"});el.innerHTML=`<div class="sh-date">${dt}</div><div class="sh-syms">${(data.symptoms||[]).map(s=>`<span class="sh-sym">${s}</span>`).join("")}</div>`;wrap.appendChild(el);});
  } catch {}
}

// ─── COMFORT ───
window.openComfort=async type=>{
  ["glow-setup","dream-setup","comfort-out"].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display="none";});
  if(type==="glow"){document.getElementById("glow-setup").style.display="block";return;}
  if(type==="dream"){document.getElementById("dream-setup").style.display="block";return;}
  const out=document.getElementById("comfort-out"),txt=document.getElementById("comfort-txt");
  out.style.display="block"; txt.innerHTML='<p style="color:var(--text3)">loading... 🌸</p>';
  if(type==="meme"){
    try{const res=await groq(`3 funny relatable memes/jokes for a girl in her ${cycleInfo.phaseName||"cycle"} phase. She loves music, studying, skincare, burritos, anime, friends. Actually funny — dark humor, self-aware, life relatable. "fuck", "shit", "bitch" ok if funnier. 3 numbered jokes. NEVER joke about pregnancy, fertility, uterus, or reproductive organs. Keep it about mood, studying, food, friends, skin, life chaos. Fresh and specific.`,1.0,250);txt.innerHTML=`<p style="font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">😭 meme therapy</p><div class="comfort-out-txt">${res}</div>`;}
    catch{txt.innerHTML="<p>couldn't load memes 😭</p>";}
  }
  if(type==="surprise"){
    try{const res=await groq(`Write a surprise message for ${uData.name||"her"} from her mystery friend Jazz (who is based on a real person who cares about her deeply). Jazz is warm underneath sarcasm, Hinglish, funny. Hint very subtly that Jazz/the person who made this app genuinely cares about her — without being obvious. Include one of: offer burrito 🌯 if she seems to need comfort, OR a subtle "someone went through a lot to build this for you" energy. 2-3 sentences max. Not cheesy.`,1.0,140);txt.innerHTML=`<p style="font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">🎸 jazz drop</p><div style="padding:1.25rem;background:linear-gradient(135deg,rgba(139,92,246,.12),rgba(167,139,250,.08));border:1px solid rgba(139,92,246,.25);border-radius:14px;font-size:1rem;color:var(--text2);line-height:1.7;font-weight:600">${res}</div>`;}
    catch{txt.innerHTML='<p>koi na, main hoon na 🎸</p>';}
  }
  out.scrollIntoView({behavior:"smooth",block:"nearest"});
};

window.genGlow=async()=>{
  const desc=document.getElementById("skin-in").value.trim();if(!desc){toast("describe your skin first 💅");return;}
  document.getElementById("glow-setup").style.display="none";
  const out=document.getElementById("comfort-out"),txt=document.getElementById("comfort-txt");
  out.style.display="block";txt.innerHTML='<p style="color:var(--text3)">building your routine... ✨</p>';
  try{const res=await groq(`Personalized skincare routine for: "${desc}". She's in ${cycleInfo.phaseName||"her"} phase which affects skin. Give: morning routine, night routine, 2 specific affordable product types, one cycle-synced tip, one lifestyle tip. Friendly beauty bestie tone — "baddie", "slay", fun and useful. Conversational, emojis ok.`,0.85,380);txt.innerHTML=`<p style="font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">💅 your glow up plan</p><div class="comfort-out-txt">${res}</div>`;}
  catch{txt.innerHTML="<p>couldn't load rn 😭</p>";}
  out.scrollIntoView({behavior:"smooth",block:"nearest"});
};

window.genDream=async()=>{
  const desc=document.getElementById("dream-in").value.trim();if(!desc){toast("tell me your dreams first 🌠");return;}
  document.getElementById("dream-setup").style.display="none";
  const out=document.getElementById("comfort-out"),txt=document.getElementById("comfort-txt");
  out.style.display="block";txt.innerHTML='<p style="color:var(--text3)">fuelling your dreams... 🔥</p>';
  try{const res=await groq(`${uData.name||"She"} aspires to be: "${desc}". Generate powerful personalised motivation. Custom affirmation, reference her specific goals, 2-3 concrete things she can do TODAY, one inspiring reference that matches her vibe, end with something screenshot-worthy. Mix poetic with practical.`,0.95,380);txt.innerHTML=`<p style="font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">🌠 dream fuel</p><div class="comfort-out-txt">${res}</div>`;}
  catch{txt.innerHTML="<p>couldn't load rn 😭</p>";}
  out.scrollIntoView({behavior:"smooth",block:"nearest"});
};

// ─── GRATITUDE JAR ───
window.addGratitude = () => {
  const inp=document.getElementById("gr-in"),text=inp.value.trim();if(!text)return;
  gratitudes.push({text,ts:Date.now()});inp.value="";
  const list=document.getElementById("gr-list");
  const el=document.createElement("div");el.className="gr-item";el.textContent=`🫙 ${text}`;
  list.appendChild(el);
  setDoc(doc(db,"users",user.uid,"gratitude",Date.now().toString()),{text,ts:Date.now(),date:today()}).catch(()=>{});
  toast("added to your jar 🫙");
};

window.readGratitude=async()=>{
  const respEl=document.getElementById("gr-response"),txtEl=document.getElementById("gr-resp-txt");
  respEl.style.display="block";txtEl.textContent="Epipen is reading your jar... 🌸";
  try {
    const all=gratitudes.length?gratitudes.map(g=>g.text).join(", "):"kindness, small moments, being alive";
    const res=await groq(`${uData.name||"She"} has been collecting moments she's grateful for: "${all}". Respond as Epipen — warm, personal. Tell her what these things say about her. Make her see herself through loving eyes. 3-4 sentences. Hinglish ok.`,0.9,200);
    txtEl.textContent=res;
  } catch{txtEl.textContent="look at everything you noticed. that's who you are. 🌸";}
};

// ─── LETTER TO FUTURE SELF ───
window.sendFutureLetter=async()=>{
  const text=document.getElementById("future-in").value.trim();if(!text){toast("write something first 💌");return;}
  const out=document.getElementById("future-out"),txt=document.getElementById("future-txt");
  out.style.display="block";txt.textContent="future you is writing back... 💌";
  try{
    const res=await groq(`${uData.name||"She"} wrote this letter to her future self: "${text}". Respond AS her future self — 6 months from now. She's accomplished, grown, and at peace. Reference specific things she mentioned. Be warm, specific, slightly emotional. Hinglish welcome. 4-5 sentences. Sign as "future ${uData.name||"you"} 🌸"`,0.9,280);
    txt.textContent=res;
  }catch{txt.textContent="future you is doing amazing. you got through everything. 🌸";}
};

// ─── BURN AFTER READING ───
window.burnVent=async()=>{
  const text=document.getElementById("burn-in").value.trim();if(!text){toast("write something first 🔥");return;}
  document.getElementById("burn-in").value="";
  const out=document.getElementById("burn-out"),msg=document.getElementById("burn-msg");
  out.style.display="block";msg.textContent="burning... 🔥";
  await new Promise(r=>setTimeout(r,1200));
  msg.textContent="gone. never saved. never judged. just released. 🌸";
  // NOT saved to firestore — that's the whole point
};

// ─── PROFILE ───
function setupProfile() {
  document.getElementById("prof-nm").textContent  = uData.name||"—";
  document.getElementById("prof-email").textContent = user.email||"—";
  document.getElementById("edit-nm").value    = uData.name||"";
  document.getElementById("edit-cycle").value = uData.cycleStart||"";
  document.getElementById("edit-len").value   = uData.cycleLength||28;
  const pa=document.getElementById("prof-av");
  pa.innerHTML=uData.photoURL?`<img src="${uData.photoURL}" alt="pfp" style="width:100%;height:100%;object-fit:cover;"/>`:
    `<div style="width:100%;height:100%;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700">${(uData.name||"B")[0].toUpperCase()}</div>`;
  document.querySelectorAll(".th").forEach(t=>t.classList.toggle("active",t.dataset.theme===(uData.theme||"lavender")));
  document.querySelectorAll(".ep-opt").forEach(o=>o.classList.toggle("active",o.textContent===(uData.epiEmoji||"💉")));
  if(uData.settings?.checkin!==undefined)document.getElementById("tog-checkin").checked=uData.settings.checkin;
  if(uData.settings?.compliments!==undefined)document.getElementById("tog-compliments").checked=uData.settings.compliments;
}

window.saveProf=async()=>{
  const nm=document.getElementById("edit-nm").value.trim(),cyc=document.getElementById("edit-cycle").value,len=parseInt(document.getElementById("edit-len").value)||28;
  if(nm)uData.name=nm;if(cyc)uData.cycleStart=cyc;uData.cycleLength=len;
  await setDoc(doc(db,"users",user.uid),uData,{merge:true});
  setupTopbar();setupGreeting();computeCycle();toast("saved 🌸");
};

window.setTheme=(el,theme)=>{ uData.theme=theme;setDoc(doc(db,"users",user.uid),uData,{merge:true});applyTheme(theme);document.querySelectorAll(".th").forEach(t=>t.classList.remove("active"));el.classList.add("active"); };
function applyTheme(t){document.body.setAttribute("data-theme",t||"lavender");}
window.setEpiEmoji=(btn,emoji)=>{uData.epiEmoji=emoji;epiEmoji=emoji;setDoc(doc(db,"users",user.uid),uData,{merge:true});setupTopbar();document.querySelectorAll(".ep-opt").forEach(o=>o.classList.toggle("active",o.textContent===emoji));toast(`updated to ${emoji}`);};
window.saveSetting=async(key,val)=>{if(!uData.settings)uData.settings={};uData.settings[key]=val;await setDoc(doc(db,"users",user.uid),uData,{merge:true});};

// ─── NAV ───
const popMsgs = {
  home:    ["welcome back 🌸","hey gorgeous ✨"],
  bots:    ["your people are here 💬","say anything 🌸"],
  cycle:   ["your diary 🌙","private forever 🌸"],
  period:  ["Chinatsu is here 🌿","your body, understood 🩸"],
  comfort: ["soft landing 🌸","take a breath ✨"],
  profile: ["main character behaviour 🌸"]
};

window.navTo=(page,navEl)=>{
  const wipe=document.getElementById("wipe");wipe.classList.add("on");
  setTimeout(()=>{
    document.querySelectorAll(".pg").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll(".ni").forEach(n=>n.classList.remove("active"));
    document.getElementById(`pg-${page}`)?.classList.add("active");
    if(navEl)navEl.classList.add("active");
    if(page==="cycle"){computeCycle();renderCal();if(document.getElementById("phase-msg-txt"))loadPhaseMsg();}
    if(page==="period"){setupPeriodPage();}
    if(page==="profile")setupProfile();
    wipe.classList.remove("on");
    const m=popMsgs[page];if(m)showPop(m[Math.floor(Math.random()*m.length)]);
  },180);
};

function showPop(text){const p=document.getElementById("pg-pop");p.textContent=text;p.style.display="block";setTimeout(()=>p.style.display="none",2400);}

// ─── COMPLIMENTS ───
function scheduleCompliment(){
  if(uData.settings?.compliments===false)return;
  const delay=(Math.random()*20+20)*60*1000;
  setTimeout(async()=>{
    let msg;
    try{msg=await groq(`One short warm compliment for ${uData.name||"her"} — she loves music, skincare, NEET studying, burritos, friends. Sound like a caring friend. Casual and genuine. 1-2 sentences max.`,0.95,70);}
    catch{msg="you're doing better than you think. fact. 🌸";}
    const bar=document.getElementById("compliment");document.getElementById("compliment-txt").textContent=msg;bar.style.display="flex";
    setTimeout(()=>bar.style.display="none",8000);scheduleCompliment();
  },delay);
}

// ─── GROQ ───
async function groq(prompt,temp=0.85,maxTok=280,model=MODEL_VENT){return groqMsgs([{role:"user",content:prompt}],temp,maxTok,model);}
async function groqMsgs(messages,temp=0.85,maxTok=280,model=MODEL_VENT){
  const tryModel=async m=>{
    const res=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${GROQ_API_KEY}`},body:JSON.stringify({model:m,messages,max_tokens:maxTok,temperature:temp})});
    const data=await res.json();
    if(res.status===429)throw new Error("rate_limited");
    if(!data.choices?.[0]?.message?.content)throw new Error("no response");
    return data.choices[0].message.content.trim();
  };
  try{return await tryModel(model);}
  catch(e){if(model!==MODEL_FALLBACK){console.warn(`${model} failed, falling back`);return await tryModel(MODEL_FALLBACK);}throw e;}
}

// ─── UTILS ───
const today=()=>new Date().toISOString().split("T")[0];
function toast(msg){const old=document.getElementById("bloom-toast");if(old)old.remove();const el=document.createElement("div");el.id="bloom-toast";el.style.cssText="position:fixed;bottom:calc(env(safe-area-inset-bottom) + 5rem);left:50%;transform:translateX(-50%);background:var(--grad);color:#fff;padding:9px 20px;border-radius:20px;font-size:.83rem;font-weight:700;z-index:600;animation:fadeUp .3s ease both;white-space:nowrap;max-width:90vw;text-align:center;font-family:'Nunito',sans-serif;box-shadow:0 4px 18px var(--glow);";el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2800);}

// ─── START ───
initStars();
initPetals();

// ═══════════════════════════════════════════
// BLOOM V8 ADDITIONS
// ═══════════════════════════════════════════

// ─── LOADING SCREEN ───
function initLoadingScreen() {
  const ls = document.getElementById("loading-screen");
  if (!ls) return;
  setTimeout(() => {
    ls.classList.add("fade-out");
    setTimeout(() => ls.classList.add("gone"), 500);
  }, 2000);
}

// ─── HAPTIC ───
function haptic(pattern = [10]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ─── CHINATSU HOME WIDGET ───
async function loadChiHomeWidget() {
  const el = document.getElementById("chw-txt");
  if (!el) return;
  try {
    const tip = await groq(
      `Write ONE short warm sentence (max 12 words) about how ${uData.name||"she"} might feel today on Day ${cycleInfo.day||"?"} of her cycle (${cycleInfo.phaseName||"luteal"} phase). Focus ONLY on energy, mood, or self-care. NEVER mention pregnancy, uterus, reproductive organs, or fertility. Start with an emoji. Keep it soft and encouraging.`,
      0.85, 60, MODEL_VENT
    );
    el.textContent = tip;
  } catch { el.textContent = `Day ${cycleInfo.day||"?"} · ${cycleInfo.phaseName||"your cycle"} ${cycleInfo.emoji||"🌸"}`; }
}

// ─── INSIGHTS PAGE ───
window.loadInsights = async () => {
  loadMoodGraph(document.querySelector(".ins-tab.active"), 7);
  loadSymChart();
  loadCycleStats();
};

window.loadMoodGraph = async (btn, days) => {
  document.querySelectorAll(".ins-tab").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  try {
    const q    = query(collection(db, "mood_logs", user.uid, "entries"), orderBy("ts","desc"), limit(days));
    const snap = await getDocs(q);
    const entries = [];
    snap.forEach(d => entries.push(d.data()));
    entries.reverse();
    drawMoodGraph(entries, days);
    showMoodStats(entries);
  } catch { console.error("mood graph fail"); }
};

function drawMoodGraph(entries, days) {
  const canvas = document.getElementById("mood-canvas");
  if (!canvas) return;
  const ctx   = canvas.getContext("2d");
  const W     = canvas.offsetWidth || 300;
  const H     = 120;
  canvas.width  = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, W, H);

  if (!entries.length) {
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.font = "14px DM Sans";
    ctx.textAlign = "center";
    ctx.fillText("no mood logs yet 🌸", W/2, H/2);
    return;
  }

  const pad    = 16;
  const gw     = W - pad*2;
  const gh     = H - pad*2;
  const scores = entries.map(e => e.score || 5);
  const pts    = scores.map((s,i) => ({ x: pad + (i/(Math.max(scores.length-1,1)))*gw, y: pad + (1 - (s-1)/9)*gh }));

  // gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(155,111,212,.25)");
  grad.addColorStop(1, "rgba(155,111,212,0)");
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H-pad);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, H-pad);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach((p,i) => {
    if (i === 0) return;
    const prev = pts[i-1];
    const cpx  = (prev.x+p.x)/2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, p.y, p.x, p.y);
  });
  ctx.strokeStyle = "rgba(155,111,212,.8)";
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // dots
  pts.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI*2);
    ctx.fillStyle = "rgba(232,160,200,.9)"; ctx.fill();
  });

  // labels
  const labelsEl = document.getElementById("mood-labels");
  if (labelsEl && entries.length) {
    labelsEl.innerHTML = "";
    const show = entries.length > 7 ? entries.filter((_,i) => i % Math.ceil(entries.length/7) === 0) : entries;
    show.forEach(e => {
      const span = document.createElement("span");
      const d    = new Date(e.ts);
      span.textContent = `${d.getDate()}/${d.getMonth()+1}`;
      labelsEl.appendChild(span);
    });
  }
}

function showMoodStats(entries) {
  const el = document.getElementById("mood-stats");
  if (!el || !entries.length) return;
  const scores = entries.map(e => e.score||5);
  const avg    = (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1);
  const best   = Math.max(...scores).toFixed(1);
  const worst  = Math.min(...scores).toFixed(1);
  el.innerHTML = `
    <div class="mood-stat"><div class="mood-stat-val">${avg}</div><div class="mood-stat-lbl">avg mood</div></div>
    <div class="mood-stat"><div class="mood-stat-val">${best}</div><div class="mood-stat-lbl">best day</div></div>
    <div class="mood-stat"><div class="mood-stat-val">${worst}</div><div class="mood-stat-lbl">hardest day</div></div>
    <div class="mood-stat"><div class="mood-stat-val">${entries.length}</div><div class="mood-stat-lbl">logs</div></div>
  `;
}

async function loadSymChart() {
  const wrap = document.getElementById("sym-chart");
  if (!wrap) return;
  try {
    const snap = await getDocs(collection(db, "cycle", user.uid, "symptoms"));
    const counts = {};
    snap.forEach(d => {
      const syms = d.data().symptoms || [];
      syms.forEach(s => counts[s] = (counts[s]||0)+1);
    });
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if (!sorted.length) { wrap.innerHTML='<p class="empty">log symptoms to see patterns 🌸</p>'; return; }
    const max = sorted[0][1];
    wrap.innerHTML = sorted.map(([sym,cnt]) => `
      <div class="sym-bar-row">
        <span class="sym-bar-lbl">${sym}</span>
        <div class="sym-bar-track"><div class="sym-bar-fill" style="width:${(cnt/max)*100}%"></div></div>
        <span class="sym-bar-count">${cnt}x</span>
      </div>`).join("");
  } catch {}
}

async function loadCycleStats() {
  try {
    const mSnap = await getDocs(collection(db,"mood_logs",user.uid,"entries"));
    let mCount  = 0; mSnap.forEach(()=>mCount++);
    document.getElementById("cs-len").textContent  = `${uData.cycleLength||28}d`;
    document.getElementById("cs-day").textContent  = `${cycleInfo.day||"—"}`;
    document.getElementById("cs-streak").textContent = `${uData.streak||0}🔥`;
    document.getElementById("cs-logs").textContent = mCount;
  } catch {}
}

window.loadChiReport = async () => {
  const el = document.getElementById("chi-report-txt");
  if (!el) return;
  el.textContent = "Chinatsu is writing your report... 🌿";
  try {
    const mSnap  = await getDocs(query(collection(db,"mood_logs",user.uid,"entries"), orderBy("ts","desc"), limit(30)));
    const scores = []; mSnap.forEach(d => scores.push(d.data().score||5));
    const avg    = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : "unknown";
    const sSnap  = await getDocs(collection(db,"cycle",user.uid,"symptoms"));
    const symCounts = {}; sSnap.forEach(d=>(d.data().symptoms||[]).forEach(s=>symCounts[s]=(symCounts[s]||0)+1));
    const topSym = Object.entries(symCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([s])=>s).join(", ")||"none logged";
    const report = await groq(
      `Write a warm monthly wellness summary for ${uData.name||"her"} as Chinatsu, her cycle mentor. Data: avg mood ${avg}/10, current phase Day ${cycleInfo.day} (${cycleInfo.phaseName}), top symptoms: ${topSym}, streak: ${uData.streak||0} days. Be specific, caring, actionable. Notice patterns. 4-5 sentences. No bullet points.`,
      0.85, 300, MODEL_VENT
    );
    el.textContent = report;
  } catch { el.textContent = "couldn't generate report right now — try again 🌿"; }
};

window.loadHypeReel = async () => {
  const el = document.getElementById("hype-txt");
  if (!el) return;
  el.textContent = "Epipen is building your hype reel... 🔥";
  try {
    const snap = await getDocs(query(collection(db,"sessions",user.uid,"vents"), orderBy("ts","desc"), limit(20)));
    const vents = []; snap.forEach(d => vents.push(d.data().vent?.slice(0,60)));
    const hype = await groq(
      `You are Epipen, Bloom's AI best friend. Write a HYPE REEL for ${uData.name||"her"} — she's been using this app and here are some things she's been through: ${vents.length ? vents.join("; ") : "just starting her journey"}. List everything she's survived, navigated, felt, and kept going through. Make her feel like the main character. Emotional and real. Hinglish ok. 5-6 sentences. Energy: "look at you. LOOK. AT. YOU." 🔥`,
      0.95, 320, MODEL_VENT
    );
    el.textContent = hype;
  } catch { el.textContent = "she showed up. every single time. that's the whole hype reel. 🔥"; }
};

// ─── SWIPE GESTURES ───
function initSwipe() {
  const pages   = ["home","bots","cycle","period","comfort","insights","profile"];
  const pagesEl = document.querySelector(".pages");
  if (!pagesEl) return;
  let startX = 0, startY = 0;
  pagesEl.addEventListener("touchstart", e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, {passive:true});
  pagesEl.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return; // not a horizontal swipe
    const activePg = document.querySelector(".pg.active");
    if (!activePg) return;
    const curId  = activePg.id.replace("pg-","");
    const curIdx = pages.indexOf(curId);
    if (dx < 0 && curIdx < pages.length-1) {
      // swipe left = next
      haptic([8]);
      const nextPage = pages[curIdx+1];
      const navItem  = document.querySelector(`.ni:nth-child(${curIdx+2})`);
      navTo(nextPage, navItem);
    } else if (dx > 0 && curIdx > 0) {
      // swipe right = prev
      haptic([8]);
      const prevPage = pages[curIdx-1];
      const navItem  = document.querySelector(`.ni:nth-child(${curIdx})`);
      navTo(prevPage, navItem);
    }
  }, {passive:true});
}

// ─── PATCH navTo for insights + haptic ───
const _v8NavTo = window.navTo;
window.navTo = (page, navEl) => {
  haptic([8]);
  const wipe = document.getElementById("wipe");
  wipe.classList.add("on");
  setTimeout(() => {
    document.querySelectorAll(".pg").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll(".ni").forEach(n=>n.classList.remove("active"));
    document.getElementById(`pg-${page}`)?.classList.add("active");
    if (navEl) navEl.classList.add("active");
    if (page==="cycle")    { computeCycle(); renderCal(); if(document.getElementById("phase-msg-txt")) loadPhaseMsg(); }
    if (page==="period")   { setupPeriodPage(); }
    if (page==="insights") { loadInsights(); }
    if (page==="profile")  setupProfile();
    wipe.classList.remove("on");
    const msgs = {
      home:     ["welcome back 🌸","hey gorgeous ✨"],
      bots:     ["your people are here 💬","say anything 🌸"],
      cycle:    ["your diary 🌙","private forever 🌸"],
      period:   ["Chinatsu is here 🌿","your body, understood 🩸"],
      comfort:  ["soft landing 🌸","take a breath ✨"],
      insights: ["look how far you've come 📊","your patterns 🌸"],
      profile:  ["main character behaviour 🌸"]
    };
    const m = msgs[page]; if(m) showPop(m[Math.floor(Math.random()*m.length)]);
  }, 180);
};

// ─── PATCH launch to add v8 features ───
const _origLaunch = window._v8launch || (() => {});
const _v8LaunchPatch = () => {
  initLoadingScreen();
  initSwipe();
  // load chi home widget after cycle computed
  setTimeout(loadChiHomeWidget, 1200);
  // haptic on all buttons
  document.addEventListener("click", e => {
    if (e.target.matches("button, .gem, .tile, .bot-card, .ni")) haptic([6]);
  });
};

// auto-run patch when DOM is ready
document.addEventListener("DOMContentLoaded", _v8LaunchPatch);
// also run immediately if DOM already loaded
if (document.readyState !== "loading") _v8LaunchPatch();

// ═══════════════════════════════════════════
// BLOOM V9 ADDITIONS
// ═══════════════════════════════════════════

// ─── PWA / SERVICE WORKER ───
function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW:', e));
  }
  // install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'block';
  });
  window.installPWA = async () => {
    if (!deferredPrompt) { toast("already installed or not supported 🌸"); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') toast("bloom added to home screen 🌸");
    deferredPrompt = null;
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'none';
  };
}

// ─── DARK/LIGHT MODE ───
window.toggleDarkMode = checked => {
  document.body.setAttribute('data-mode', checked ? 'dark' : 'light');
  uData.darkMode = checked;
  setDoc(doc(db, 'users', user.uid), uData, {merge:true}).catch(()=>{});
};

// ─── ONBOARD V2 ───
window.obSkip = () => {
  document.getElementById('ob-cycle').value = new Date().toISOString().split('T')[0];
  obNext(2);
};

window.obFinish = async () => {
  uData = { ...uData, onboardDone: true };
  await setDoc(doc(db, 'users', user.uid), uData, {merge:true});
  launch();
};

// patch obNext to show step 3
const _origObNext = window.obNext;
window.obNext = async step => {
  if (step === 1) {
    const nm = document.getElementById('ob-name').value.trim();
    if (!nm) { toast('tell me your name first 🌸'); return; }
    uData.name = nm;
    document.getElementById('ob1').classList.remove('active');
    document.getElementById('ob2').classList.add('active');
    document.getElementById('ob-cycle').value = new Date().toISOString().split('T')[0];
    document.getElementById('ob-prog-fill').style.width = '66%';
  } else {
    const dt = document.getElementById('ob-cycle').value;
    if (!dt) { toast('pick a date 🌙'); return; }
    uData = { ...uData, cycleStart:dt, cycleLength:28, epiName:'Epipen', epiEmoji:'💉', createdAt:new Date().toISOString(), uid:user.uid, photoURL:user.photoURL||null, settings:{checkin:true,compliments:true}, theme:'lavender' };
    await setDoc(doc(db,'users',user.uid), uData);
    document.getElementById('ob2').classList.remove('active');
    document.getElementById('ob3').classList.add('active');
    document.getElementById('ob-prog-fill').style.width = '100%';
  }
};

// ─── TELL ABOUT YOURSELF ───
let userSelfInfo = '';

window.openTellModal = async () => {
  document.getElementById('tell-modal').style.display = 'flex';
  try {
    const snap = await getDoc(doc(db,'users',user.uid,'meta','selfinfo'));
    if (snap.exists()) {
      const txt = snap.data().text || '';
      document.getElementById('tell-in').value = txt;
      if (txt) { document.getElementById('tell-saved').style.display='block'; document.getElementById('tell-saved').textContent = `saved: "${txt.slice(0,80)}..."`; }
    }
  } catch {}
};

window.closeTellModal = () => document.getElementById('tell-modal').style.display = 'none';

window.saveTellAbout = async () => {
  const txt = document.getElementById('tell-in').value.trim();
  if (!txt) { toast('write something first 🌸'); return; }
  userSelfInfo = txt;
  await setDoc(doc(db,'users',user.uid,'meta','selfinfo'), {text:txt, ts:Date.now()}).catch(()=>{});
  document.getElementById('tell-saved').style.display = 'block';
  document.getElementById('tell-saved').textContent = `saved ✓ all AIs will remember this 🌸`;
  closeTellModal(); toast('all AIs updated 🌸');
};

async function loadSelfInfo() {
  try {
    const snap = await getDoc(doc(db,'users',user.uid,'meta','selfinfo'));
    if (snap.exists()) userSelfInfo = snap.data().text || '';
  } catch {}
}

// inject selfInfo into all system prompts — patch epipenSystem
const _origEpipenSystem = epipenSystem;
// override happens via userSelfInfo being read in prompts — already included below via getSelfInfoLine
function getSelfInfoLine() {
  return userSelfInfo ? `\nSHE TOLD ME ABOUT HERSELF: "${userSelfInfo.slice(0,300)}"` : '';
}

// ─── DELETE ACCOUNT ───
window.deleteAccount = async () => {
  const confirm1 = confirm('this will permanently delete ALL your data — diary, chats, cycle logs, everything. are you sure?');
  if (!confirm1) return;
  const confirm2 = confirm('last chance. this CANNOT be undone.');
  if (!confirm2) return;
  try {
    toast('deleting your data... 🌸');
    const colls = ['sessions','mood_logs','cycle'];
    for (const coll of colls) {
      try { const snap = await getDocs(collection(db,coll,user.uid,'vents')); snap.forEach(d=>deleteDoc(d.ref)); } catch {}
      try { const snap = await getDocs(collection(db,coll,user.uid,'entries')); snap.forEach(d=>deleteDoc(d.ref)); } catch {}
      try { const snap = await getDocs(collection(db,coll,user.uid,'period')); snap.forEach(d=>deleteDoc(d.ref)); } catch {}
      try { const snap = await getDocs(collection(db,coll,user.uid,'diary')); snap.forEach(d=>deleteDoc(d.ref)); } catch {}
      try { const snap = await getDocs(collection(db,coll,user.uid,'symptoms')); snap.forEach(d=>deleteDoc(d.ref)); } catch {}
    }
    await deleteDoc(doc(db,'users',user.uid)).catch(()=>{});
    await signOut(auth);
    showScreen('auth');
    toast('account deleted 🌸');
  } catch(e) { toast('error deleting — contact support'); console.error(e); }
};

// ─── DELETE CHAT SESSION ───
window.deleteChatSession = async (bot, sessionId, el) => {
  const colName = bot==='epipen'?'vents':bot==='chinatsu'?'chinatsu_sessions':'jazz_sessions';
  try {
    const q = query(collection(db,'sessions',user.uid,colName));
    const snap = await getDocs(q);
    const toDelete = [];
    snap.forEach(d => { if(d.data().sessionId===sessionId) toDelete.push(d.ref); });
    await Promise.all(toDelete.map(r=>deleteDoc(r)));
    el.closest('.sess-item')?.remove();
    toast('chat deleted 🌸');
  } catch { toast('error deleting chat 😭'); }
};

// patch toggleHistory to add delete button
const _origToggleHistory = window.toggleHistory;
window.toggleHistory = async bot => {
  const histEl = document.getElementById(`hist-${bot}`);
  const isOpen = histEl.style.display !== 'none';
  if (isOpen) { histEl.style.display = 'none'; return; }
  histEl.style.display = 'block';
  histEl.innerHTML = '<div class="sess-empty">loading...</div>';
  try {
    const colName = bot==='epipen'?'vents':bot==='chinatsu'?'chinatsu_sessions':'jazz_sessions';
    const q    = query(collection(db,'sessions',user.uid,colName), orderBy('ts','desc'), limit(30));
    const snap = await getDocs(q);
    if (snap.empty) { histEl.innerHTML='<div class="sess-empty">no past chats yet 🌸</div>'; return; }
    const sessions = {};
    snap.forEach(d => {
      const data = d.data(); const sid = data.sessionId || data.ts;
      if (!sessions[sid]) sessions[sid] = {ts:data.ts, date:data.date, first:data.vent, msgs:[], sid};
      sessions[sid].msgs.push(data);
    });
    histEl.innerHTML = '';
    Object.values(sessions).sort((a,b)=>b.ts-a.ts).slice(0,15).forEach(sess => {
      const el = document.createElement('div'); el.className = 'sess-item';
      const dt = new Date(sess.ts).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      el.innerHTML = `<div class="sess-item-date">${dt}</div><div class="sess-item-preview">${sess.first?.slice(0,55)||'...'}</div><button class="sess-del" onclick="event.stopPropagation();deleteChatSession('${bot}','${sess.sid}',this)">🗑️</button>`;
      el.onclick = () => loadSession(bot, sess.msgs);
      histEl.appendChild(el);
    });
  } catch { histEl.innerHTML='<div class="sess-empty">couldn\'t load history 😭</div>'; }
};

// ─── JAZZ RANDOM CHECK-INS ───
function scheduleJazzCheckin() {
  const delay = (Math.random() * 60 + 60) * 1000; // 1-2 min
  setTimeout(async () => {
    if (document.getElementById('pg-bots')?.classList.contains('active')) { scheduleJazzCheckin(); return; }
    try {
      const checkins = [
        "ayo 👀 kya scene hai",
        "bhoot ho gayi? 🙄",
        "haww ignore krri mujhe",
        "bas dekh raha tha tu theek hai ya nahi",
        "koi na main hoon na 🎸",
        "teri maggie me tamatar daal diye maine 💀",
        "me hi sab kuch hu toh naturally check in karna pada",
      ];
      const msg = checkins[Math.floor(Math.random() * checkins.length)];
      showJazzCheckin(msg);
    } catch {}
    scheduleJazzCheckin();
  }, delay);
}

function showJazzCheckin(msg) {
  // show as a small popup that opens Jazz chat when tapped
  const pop = document.createElement('div');
  pop.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom) + 5.5rem);left:1rem;right:1rem;max-width:560px;margin:0 auto;background:linear-gradient(135deg,rgba(45,27,105,.8),rgba(139,92,246,.6));border:1px solid rgba(139,92,246,.4);border-radius:16px;backdrop-filter:blur(24px);padding:.9rem 1.1rem;z-index:400;animation:slideUp .4s cubic-bezier(.34,1.56,.64,1) both;cursor:pointer;display:flex;align-items:center;gap:.75rem;';
  pop.innerHTML = `<span style="font-size:1.3rem">🎸</span><div style="flex:1"><p style="font-size:.6rem;letter-spacing:1.5px;text-transform:uppercase;color:rgba(167,139,250,.8);font-weight:700;margin-bottom:2px">Jazz</p><p style="font-size:.88rem;color:#f5eeff;font-weight:500">${msg}</p></div><button style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:.85rem;padding:4px" onclick="event.stopPropagation();this.closest('div[style]').remove()">✕</button>`;
  pop.onclick = () => { quickOpenBot('jazz'); pop.remove(); };
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 8000);
  haptic([10,50,10]);
}

// ─── CHINATSU RANDOM ADVICE ───
const chinatsuAdvices = [
  "SLEEP a minimum of 6 hours. your brain literally cleans itself at night. non-negotiable. 🌙",
  "drink water rn. not in a bit. NOW. your body is 60% water and you're probably running on fumes 💧",
  "you've been staring at a screen for a while — look 20 feet away for 20 seconds. your eyes need it 👁️",
  "if you haven't eaten in 4+ hours, please eat something. even a biscuit. your hormones will thank you 🍪",
  "your posture rn — sit up a little. neck pain during your period hits different and you don't need that 💆",
  "taking a 10-minute walk literally reduces cortisol. not fitness advice. stress science. 🚶",
  "if you're feeling extra emotional today, check your cycle day. it might just be your hormones doing their thing. valid. 🌊",
  "magnesium literally helps with cramps and mood swings. dark chocolate has it. you're welcome. 🍫",
  "deep breath in for 4 counts, hold 4, out for 6. do it 3 times. your nervous system will thank you. 🌬️",
  "your skin might be acting up this week — that's hormonal. be gentle with your routine. 💅",
  "even 20 minutes of sunlight today will genuinely improve your mood. science, not vibes. ☀️",
  "stretching for 5 minutes before bed reduces muscle tension and helps you sleep deeper. try it tonight. 🧘",
  "if you're craving carbs rn it's probably your cycle asking for serotonin. eat something good. 🍝",
  "cold water on your wrists when you feel anxious. instant nervous system reset. 💧",
  "your body is doing so much right now. even resting is productive. please don't forget that. 🌸",
  "iron-rich foods this week will help with energy if you're in your Womenstrual phase. spinach, lentils, dark chocolate. 🥬",
  "screen brightness down at night. your melatonin will actually kick in and you'll sleep better. 🌙",
  "if your head hurts, drink a full glass of water before anything else. dehydration causes 90% of headaches. 💧",
  "you've been going hard. it's okay to have one slow hour. the world won't end. 🌷",
  "omega-3s reduce inflammation including period pain. even a small handful of walnuts helps. 🥜",
];

function scheduleChiAdvice() {
  const delay = (Math.random() * 60 + 60) * 1000; // 1-2 min
  setTimeout(() => {
    const msg = chinatsuAdvices[Math.floor(Math.random() * chinatsuAdvices.length)];
    showChiAdvice(msg);
    scheduleChiAdvice();
  }, delay);
}

function showChiAdvice(msg) {
  const el = document.getElementById('chi-advice-pop');
  const txt = document.getElementById('cap-txt');
  if (!el || !txt) return;
  txt.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 9000);
}

// ─── PATTERN RECOGNITION ───
async function checkPatterns() {
  if (!user || !cycleInfo.day) return;
  try {
    const q    = query(collection(db,'mood_logs',user.uid,'entries'), orderBy('ts','desc'), limit(60));
    const snap = await getDocs(q);
    const byDay = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.score && cycleInfo.day) {
        const day = data.cycleDay || cycleInfo.day;
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(data.score);
      }
    });
    // find days with consistently low mood
    const lowDays = Object.entries(byDay)
      .filter(([,scores]) => scores.length >= 2 && scores.reduce((a,b)=>a+b,0)/scores.length < 4.5)
      .map(([day]) => day);
    if (lowDays.length && cycleInfo.day && lowDays.includes(String(cycleInfo.day))) {
      const el = document.getElementById('pattern-pop');
      const txt = document.getElementById('pattern-txt');
      if (el && txt) {
        txt.textContent = `Day ${cycleInfo.day} tends to be harder for you. You've felt this before and got through it. Be extra gentle today 💜`;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 10000);
      }
    }
  } catch {}
}

// ─── CYCLE LETTER FROM CHINATSU ───
async function checkCycleLetter() {
  if (!uData.cycleStart || !cycleInfo.day) return;
  if (cycleInfo.day !== 1) return; // only on day 1 of new cycle
  try {
    const key = `cycle_letter_${uData.cycleStart}`;
    const snap = await getDoc(doc(db,'users',user.uid,'meta',key));
    if (snap.exists()) return; // already sent this cycle
    const letter = await groq(
      `Write a warm cycle letter from Chinatsu to ${uData.name||"her"} at the START of her new cycle. Reference: she's beginning a new cycle today, last cycle was ${uData.cycleLength||28} days. Acknowledge what her body just went through. Welcome the new beginning. Give 2 specific things to focus on in this new cycle based on the ${cycleInfo.phaseName} phase. Warm mentor energy. 5-6 sentences. Sign as "Chinatsu 🌿"`,
      0.88, 300, MODEL_VENT
    );
    // show as a special popup
    const pop = document.createElement('div');
    pop.style.cssText = 'position:fixed;inset:0;background:rgba(7,6,15,.85);display:flex;align-items:center;justify-content:center;z-index:800;padding:1.5rem;backdrop-filter:blur(16px)';
    pop.innerHTML = `<div style="max-width:400px;width:100%;padding:2rem;background:linear-gradient(135deg,rgba(113,178,128,.15),rgba(93,202,165,.1));border:1px solid rgba(113,178,128,.3);border-radius:24px;backdrop-filter:blur(28px)">
      <p style="font-size:.62rem;letter-spacing:2px;text-transform:uppercase;color:#71b280;font-weight:700;margin-bottom:.75rem">🌿 A letter from Chinatsu</p>
      <p style="font-size:.92rem;color:#f5eeff;line-height:1.75;font-family:'DM Sans',sans-serif">${letter}</p>
      <button style="width:100%;margin-top:1.25rem;padding:12px;background:linear-gradient(135deg,#134e5e,#71b280);border:none;border-radius:12px;color:#fff;font-family:'Nunito',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer" onclick="this.closest('div[style*=fixed]').remove()">thank you Chinatsu 🌸</button>
    </div>`;
    document.body.appendChild(pop);
    await setDoc(doc(db,'users',user.uid,'meta',key), {sent:true, ts:Date.now()}).catch(()=>{});
  } catch(e) { console.warn('cycle letter:', e); }
}

// ─── VISION BOARD ───
let visionTiles = [];

async function loadVisionBoard() {
  try {
    const snap = await getDocs(collection(db,'users',user.uid,'vision'));
    visionTiles = [];
    snap.forEach(d => visionTiles.push({id:d.id, ...d.data()}));
    renderVisionBoard();
  } catch {}
}

function renderVisionBoard() {
  const grid = document.getElementById('vb-grid'); if(!grid) return;
  if (!visionTiles.length) { grid.innerHTML='<p style="grid-column:1/-1;text-align:center;color:var(--text3);font-size:.85rem;padding:1rem">add your first dream 🌟</p>'; return; }
  grid.innerHTML = visionTiles.map(t => `
    <div class="vb-tile">
      <button class="vb-del" onclick="deleteVisionTile('${t.id}')">✕</button>
      <div class="vb-tile-ico">${t.emoji||'🌟'}</div>
      <div class="vb-tile-txt">${t.text}</div>
    </div>`).join('');
}

window.addVisionTile = async () => {
  const inp   = document.getElementById('vb-in');
  const emoji = document.getElementById('vb-emoji').value;
  const text  = inp.value.trim();
  if (!text) { toast('add a dream first 🌟'); return; }
  inp.value = '';
  try {
    const ref = await addDoc(collection(db,'users',user.uid,'vision'), {text, emoji, ts:Date.now()});
    visionTiles.push({id:ref.id, text, emoji});
    renderVisionBoard(); haptic([10]);
  } catch { toast('error saving 😭'); }
};

window.deleteVisionTile = async id => {
  await deleteDoc(doc(db,'users',user.uid,'vision',id)).catch(()=>{});
  visionTiles = visionTiles.filter(t=>t.id!==id);
  renderVisionBoard();
};

// ─── DREAM FUEL MODAL ───
window.genDreamModal = async () => {
  const desc = document.getElementById('dream-in-modal').value.trim();
  if (!desc) { toast('tell me your dreams first 🌠'); return; }
  const out = document.getElementById('dream-modal-out');
  const txt = document.getElementById('dream-modal-txt');
  out.style.display='block'; txt.textContent='loading your fuel... 🔥';
  try {
    const res = await groq(`${uData.name||"She"} aspires to be: "${desc}". Generate powerful personalised motivation. Custom affirmation, 2-3 concrete things she can do TODAY, one inspiring reference, end with something screenshot-worthy. Mix poetic with practical.`, 0.95, 320);
    txt.textContent = res;
  } catch { txt.textContent="you're already becoming her. 🔥"; }
};

// ─── BODY CHECK ───
window.openBodyCheck = async type => {
  const out = document.getElementById('body-check-out');
  const ttl = document.getElementById('bco-title');
  const txt = document.getElementById('bco-txt');
  out.style.display='block'; txt.textContent='Chinatsu is checking in... 🌿';
  const titles = { migraine:'🤯 Migraine', headache:'😣 Headache', eyes:'👁️ Eye Pain', cramps:'🔥 Cramps', fatigue:'😴 Fatigue', nausea:'🌊 Nausea' };
  ttl.textContent = titles[type] || type;
  const prompts = {
    migraine:  `Give warm reassuring tips for someone with a migraine. She's in her ${cycleInfo.phaseName||"cycle"} phase which can affect this. Include: 3 immediate relief tips, 1 thing to avoid, 1 gentle reassurance. Sound like a caring friend, not a doctor. No bullet points.`,
    headache:  `Give warm caring tips for a headache. She's in her ${cycleInfo.phaseName||"cycle"} phase. Include: possible causes related to her cycle, 3 relief tips, reassurance it'll pass. Sound like a caring friend.`,
    eyes:      `Give gentle tips for eye pain/screen fatigue for someone studying hard (NEET prep). Include: 3 relief tips, 20-20-20 rule explained simply, one cute reminder to rest. Warm and reassuring.`,
    cramps:    `Give warm caring tips for period cramps for someone in their ${cycleInfo.phaseName||"Womenstrual"} phase. Include: heat therapy, movement, what to eat, one reassurance. Sound like a caring friend. Use "Womenstrual" not "menstrual".`,
    fatigue:   `Give gentle tips for fatigue during the ${cycleInfo.phaseName||"luteal"} phase. Include: why this happens in this phase, 3 gentle energy restoring tips, one permission slip to rest. Warm and validating.`,
    nausea:    `Give warm tips for nausea that can happen during the cycle's ${cycleInfo.phaseName||"current"} phase. Include: 3 gentle relief tips, possible hormonal cause, reassurance. Sound like a caring friend.`
  };
  try {
    const res = await groq(prompts[type]||prompts.headache, 0.82, 240, MODEL_VENT);
    txt.textContent = res;
  } catch { txt.textContent="rest, hydrate, and be gentle with yourself. you've got this. 🌿"; }
  out.scrollIntoView({behavior:'smooth', block:'nearest'});
  haptic([8]);
};

// ─── PUSH NOTIFICATIONS ───
window.toggleNotifs = async checked => {
  if (!checked) return;
  if (!('Notification' in window)) { toast("notifications not supported on this browser"); document.getElementById('tog-notifs').checked=false; return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    toast("notifications enabled 🌸");
    uData.notifs = true;
    setDoc(doc(db,'users',user.uid), uData, {merge:true}).catch(()=>{});
    // schedule local notif as demo
    setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification('bloom 🌸', { body: `hey ${uData.name||"bestie"} — checking in on you 💉`, icon: '/icon-192.png' });
      }
    }, 3000);
  } else {
    toast("notifications blocked 😭");
    document.getElementById('tog-notifs').checked = false;
  }
};

// ─── PATCH LAUNCH FOR V9 ───
const _v9patch = () => {
  initPWA();
  scheduleJazzCheckin();
  scheduleChiAdvice();
  setTimeout(checkPatterns, 5000);
  setTimeout(checkCycleLetter, 3000);
  setTimeout(loadSelfInfo, 1000);
  setTimeout(loadVisionBoard, 2000);
  // dark mode restore
  const isDark = uData.darkMode !== false;
  document.body.setAttribute('data-mode', isDark ? 'dark' : 'light');
  const togDark = document.getElementById('tog-dark');
  if (togDark) togDark.checked = isDark;
  // notifs restore
  if (uData.notifs && Notification.permission==='granted') {
    const tog=document.getElementById('tog-notifs'); if(tog)tog.checked=true;
  }
  // checkin restore
  if (uData.settings?.checkin !== undefined) {
    const tc = document.getElementById('tog-checkin'); if(tc) tc.checked = uData.settings.checkin;
  }
  // compliments restore
  if (uData.settings?.compliments !== undefined) {
    const tco = document.getElementById('tog-compliments'); if(tco) tco.checked = uData.settings.compliments;
  }
};

// run after launch — attach to DOMContentLoaded as extra safety
if (document.readyState !== 'loading') { setTimeout(_v9patch, 500); }
else { document.addEventListener('DOMContentLoaded', () => setTimeout(_v9patch, 500)); }

// ─── PATCH system prompts to include selfInfo ───
// Store original functions and wrap them
const _baseEpiSys   = epipenSystem;
const _baseChi      = chinatsuSystem;
const _baseJazz     = jazzSystem;

// override at module level
window._getSelfInfoLine = getSelfInfoLine;

// Monkeypatch sendBotMsg to inject selfInfo into system
const _origSendBotMsg = window.sendBotMsg;
window.sendBotMsg = async bot => {
  // inject selfInfo into memory before sending
  if (userSelfInfo && !memory.includes(userSelfInfo.slice(0,30))) {
    memory = `USER ABOUT HERSELF: "${userSelfInfo}"\n` + memory;
  }
  return _origSendBotMsg(bot);
};

// ═══════════════════════════════════════════
// BLOOM V10 ADDITIONS
// ═══════════════════════════════════════════

// ─── DESKTOP SIDEBAR BRAND + PROFILE ───
function injectDesktopSidebar() {
  if (window.innerWidth < 768) return;
  const nav = document.getElementById('main-nav');
  if (!nav || document.querySelector('.nav-brand')) return;

  // brand at top
  const brand = document.createElement('div');
  brand.className = 'nav-brand';
  brand.innerHTML = `<span class="nav-brand-logo">bloom 🌸</span><span class="nav-brand-tag">you bloom with dignity</span>`;
  nav.insertBefore(brand, nav.firstChild);

  // profile footer at bottom
  const footer = document.createElement('div');
  footer.className = 'nav-footer';
  const avatarSrc = uData.photoURL;
  footer.innerHTML = `
    ${avatarSrc ? `<img class="nav-footer-av" src="${avatarSrc}" alt="pfp"/>` : `<div class="nav-footer-av" style="background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700">${(uData.name||'B')[0].toUpperCase()}</div>`}
    <div style="flex:1;min-width:0">
      <div class="nav-footer-name">${uData.name||'bestie'}</div>
      <div class="nav-footer-streak">🔥 ${uData.streak||0} day streak</div>
    </div>`;
  nav.appendChild(footer);
}

// ─── RIGHT CONTEXTUAL PANEL ───
function injectRightPanel() {
  if (window.innerWidth < 1100) return;
  if (document.querySelector('.right-panel')) return;
  const shell = document.querySelector('.shell');
  if (!shell) return;

  const rp = document.createElement('div');
  rp.className = 'right-panel';
  rp.id = 'right-panel';
  rp.innerHTML = `
    <div class="rp-section">
      <p class="rp-title">📍 your cycle</p>
      <div class="rp-card">
        <div class="rp-phase-day" id="rp-day">Day —</div>
        <div class="rp-phase-name" id="rp-phase">—</div>
        <div class="rp-phase-next" id="rp-next">—</div>
      </div>
    </div>
    <div class="rp-section">
      <p class="rp-title">😊 mood this week</p>
      <canvas class="rp-mini-graph" id="rp-graph"></canvas>
    </div>
    <div class="rp-section">
      <p class="rp-title">🌿 chinatsu says</p>
      <div class="rp-card">
        <div class="rp-tip-label">today's tip</div>
        <p class="rp-tip" id="rp-tip">loading...</p>
      </div>
    </div>
    <div class="rp-section" style="margin-top:auto;padding-top:1rem;border-top:1px solid var(--border)">
      <p style="font-size:.5rem;color:rgba(155,111,212,.2);letter-spacing:.5px;text-align:center">made by jayesh · for the special one</p>
      <p style="font-size:.58rem;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;text-align:center;margin-top:.25rem">Bloom · Unravel Labs</p>
    </div>`;
  shell.appendChild(rp);
  updateRightPanel();
}

function updateRightPanel() {
  const d   = document.getElementById('rp-day');
  const ph  = document.getElementById('rp-phase');
  const nx  = document.getElementById('rp-next');
  const tip = document.getElementById('rp-tip');
  if (d)  d.textContent  = `Day ${cycleInfo.day||'—'}`;
  if (ph) ph.textContent = cycleInfo.phaseName||'—';
  if (nx && cycleInfo.day && cycleInfo.len) {
    const left = cycleInfo.len - cycleInfo.day;
    nx.textContent = left === 0 ? 'period may start today' : `next period in ${left}d`;
  }
  // mini mood graph
  const canvas = document.getElementById('rp-graph');
  if (canvas && user) {
    getDocs(query(collection(db,'mood_logs',user.uid,'entries'), orderBy('ts','desc'), limit(7)))
      .then(snap => {
        const entries = []; snap.forEach(d => entries.push(d.data())); entries.reverse();
        drawMiniGraph(canvas, entries);
      }).catch(()=>{});
  }
  // tip
  if (tip && cycleInfo.phaseName) {
    groq(`One very short (max 10 words) wellness tip for the ${cycleInfo.phaseName} phase. Start with emoji. No pregnancy/uterus references.`, 0.8, 40, MODEL_VENT)
      .then(t => { if(tip) tip.textContent = t; }).catch(()=>{});
  }
}

function drawMiniGraph(canvas, entries) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.offsetWidth || 260, H = 60;
  canvas.width  = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, W, H);
  if (!entries.length) return;
  const scores = entries.map(e => e.score||5);
  const pts    = scores.map((s,i) => ({ x: (i/(Math.max(scores.length-1,1)))*W, y: H - ((s-1)/9)*H*0.8 - H*0.1 }));
  const grad   = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'rgba(155,111,212,.3)'); grad.addColorStop(1,'rgba(155,111,212,0)');
  ctx.beginPath(); ctx.moveTo(pts[0].x, H);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, H); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach((p,i) => i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.strokeStyle = 'rgba(155,111,212,.8)'; ctx.lineWidth = 2; ctx.stroke();
}

// ─── PARALLAX STARS ───
function initParallax() {
  if (window.innerWidth < 768) return;
  const canvas = document.getElementById('stars');
  window.addEventListener('mousemove', e => {
    const mx = (e.clientX / window.innerWidth  - 0.5) * 2;
    const my = (e.clientY / window.innerHeight - 0.5) * 2;
    if (canvas) {
      canvas.style.transform = `translate(${mx * 8}px, ${my * 5}px)`;
    }
    // cursor glow on cards
    document.querySelectorAll('.cursor-glow-card, .tile, .gem, .ins-card').forEach(el => {
      const rect = el.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const y    = e.clientY - rect.top;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
    });
  });
}

// ─── SHOOTING STARS ───
function initShootingStars() {
  if (window.innerWidth < 768) return;
  const shoot = () => {
    const el   = document.createElement('div');
    el.className = 'shooting-star';
    el.style.left = `${Math.random() * 60}vw`;
    el.style.top  = `${Math.random() * 40}vh`;
    el.style.animationDuration = `${Math.random() * 0.6 + 0.3}s`;
    el.style.opacity = Math.random() * 0.7 + 0.3;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
    setTimeout(shoot, Math.random() * 15000 + 10000);
  };
  setTimeout(shoot, 3000);
}

// ─── CURSOR GLOW on CARDS ───
function initCursorGlow() {
  if (window.innerWidth < 768) return;
  document.addEventListener('mousemove', e => {
    document.querySelectorAll('.tile, .gem, .ins-card, .rp-card, .prof-sec').forEach(el => {
      const rect  = el.getBoundingClientRect();
      if (e.clientX < rect.left-100 || e.clientX > rect.right+100) return;
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  });
}

// ─── BLOOM ASSISTANT (smart navigator) ───
let baHist = [];

window.toggleAssistant = () => {
  const panel = document.getElementById('ba-panel');
  const ico   = document.getElementById('ba-toggle-ico');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (ico) ico.classList.toggle('open', open);
  if (open && !document.getElementById('ba-msgs').children.length) {
    appendBA("hey 🌸 what do you need? you can say things like 'log my period', 'I feel anxious', 'talk to Jazz', or just tell me what's going on.", 'bot');
  }
};

window.sendAssistant = async () => {
  const inp  = document.getElementById('ba-in');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  appendBA(text, 'user');
  baHist.push({role:'user', content:text});
  const typ = appendBATyping();
  try {
    const system = `You are Bloom Assistant — a smart navigator AI inside the Bloom wellness app. 
You understand what the user wants and either respond warmly OR trigger a navigation action.

PAGES AVAILABLE: home, bots (all AI chats), cycle (diary), period (health/cycle tracker), comfort, insights, profile
BOTS AVAILABLE: epipen (vent/argue/release), chinatsu (cycle/health mentor), jazz (mystery friend/Jayesh)

RESPONSE FORMAT — always respond in JSON only:
{
  "message": "your warm response here",
  "action": null OR one of: "nav:home", "nav:bots", "nav:cycle", "nav:period", "nav:comfort", "nav:insights", "nav:profile", "bot:epipen", "bot:chinatsu", "bot:jazz", "open:moodgate", "open:visionboard"
}

RULES:
- "log period / mark period / period started" → action: "nav:period"  
- "feel anxious / need to vent / having a bad day / talk to epipen" → action: "bot:epipen"
- "talk to jazz / jazz" → action: "bot:jazz"
- "cycle / health / body / chinatsu / symptoms" → action: "nav:period"
- "diary / write / journal" → action: "nav:cycle"
- "comfort / cheer me up / meme" → action: "nav:comfort"
- "mood / how am I / vibe check" → action: "open:moodgate"
- "vision board / dreams / goals" → action: "open:visionboard"
- "insights / stats / graph" → action: "nav:insights"
- "settings / profile / theme" → action: "nav:profile"
- For general emotional support: direct to epipen
- Keep messages short, warm, Hinglish ok
- You are ${uData.name||"her"} personal guide. Know her: Day ${cycleInfo.day||"?"} cycle, ${cycleInfo.phaseName||"unknown"} phase.`;

    const msgs   = [{role:'system',content:system}, ...baHist.slice(-6)];
    const raw    = await groqMsgs(msgs, 0.7, 200, MODEL_VENT);
    typ.remove();

    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g,'')); }
    catch { parsed = {message: raw, action: null}; }

    appendBA(parsed.message || raw, 'bot');
    baHist.push({role:'assistant', content:parsed.message||raw});

    // execute action after short delay
    if (parsed.action) {
      setTimeout(() => executeBAAction(parsed.action), 600);
    }
  } catch(e) {
    typ.remove();
    appendBA("oops, something went wrong — try again? 🌸", 'bot');
    console.error(e);
  }
};

function executeBAAction(action) {
  haptic([8,40,8]);
  if (action.startsWith('nav:')) {
    const page = action.split(':')[1];
    const navIdx = ['home','bots','cycle','period','comfort','insights','profile'].indexOf(page);
    const navEl  = navIdx >= 0 ? document.querySelector(`.ni:nth-child(${navIdx+1})`) : null;
    navTo(page, navEl);
  } else if (action.startsWith('bot:')) {
    const bot = action.split(':')[1];
    quickOpenBot(bot);
  } else if (action === 'open:moodgate') {
    openGate();
  } else if (action === 'open:visionboard') {
    document.getElementById('vision-modal').style.display = 'flex';
  }
}

function appendBA(text, who) {
  const c   = document.getElementById('ba-msgs');
  const div = document.createElement('div');
  div.className = who === 'user' ? 'ba-msg-user' : 'ba-msg-bot';
  div.textContent = text;
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function appendBATyping() {
  const c   = document.getElementById('ba-msgs');
  const div = document.createElement('div');
  div.className = 'ba-msg-bot typing';
  div.innerHTML = '<div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>';
  c.appendChild(div); c.scrollTop = c.scrollHeight;
  return div;
}

// ─── KAWAII THEME ───
window.setKawaii = (el, variant) => {
  document.querySelectorAll('.kw-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  document.body.setAttribute('data-kw', variant);
  uData.kawaiiVariant = variant;
  setDoc(doc(db,'users',user.uid), uData, {merge:true}).catch(()=>{});
  // swap petals to kawaii emojis
  const kawaiiEmojis = { bunny:'🐰', panda:'🐼', icecream:'🍦' };
  document.querySelectorAll('.petal').forEach((p,i) => {
    const emojis = { bunny:['🐰','🌸','💕','🌷','✨'], panda:['🐼','⚫','🍃','🌿','💚'], icecream:['🍦','🍬','🍭','🌈','💜'] };
    const pool = emojis[variant] || emojis.bunny;
    p.textContent = pool[i % pool.length];
  });
};

// patch setTheme to show kawaii picker
const _origSetTheme = window.setTheme;
window.setTheme = (el, theme) => {
  _origSetTheme(el, theme);
  const picker = document.getElementById('kawaii-picker');
  if (picker) picker.style.display = theme === 'kawaii' ? 'block' : 'none';
  if (theme === 'kawaii') {
    // restore variant
    const v = uData.kawaiiVariant || 'bunny';
    document.body.setAttribute('data-kw', v);
    document.querySelectorAll('.kw-opt').forEach(o => o.classList.toggle('active', o.dataset.kw === v));
  }
};

// ─── V10 LAUNCH PATCH ───
const _v10patch = () => {
  setTimeout(() => {
    injectDesktopSidebar();
    injectRightPanel();
    initParallax();
    initShootingStars();
    initCursorGlow();
    // restore kawaii variant
    if (uData.theme === 'kawaii' && uData.kawaiiVariant) {
      document.body.setAttribute('data-kw', uData.kawaiiVariant);
    }
  }, 800);
};

if (document.readyState !== 'loading') { setTimeout(_v10patch, 800); }
else { document.addEventListener('DOMContentLoaded', () => setTimeout(_v10patch, 800)); }
