import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronRight,
  Egg,
  Flame,
  Footprints,
  HeartPulse,
  Home,
  LockKeyhole,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";

type Screen = "welcome" | "setup" | "connect" | "home" | "monster" | "settings";
type StageId = "egg" | "baby" | "teen" | "final";

interface HealthSummary {
  date: string;
  steps: number;
  activeCalories: number;
  workouts: number;
}

interface DailyXp {
  steps: number;
  activeCalories: number;
  workouts: number;
  total: number;
}

interface DailyAward {
  date: string;
  health: HealthSummary;
  xp: DailyXp;
}

interface DemoState {
  monsterName: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastSyncedDate: string | null;
  onboardingStatus: "notStarted" | "monsterCreated" | "complete";
  healthConnected: boolean;
  lastRewardDate: string | null;
  dailyAward: DailyAward | null;
  demoDayOffset: number;
  demoSyncCount: number;
}

const STORAGE_KEY = "hatchup-live-demo-v1";
const PRIVACY_COPY =
  "HatchUp reads your steps, workouts, and active energy only to reward your monster with XP. We do not sell your health data or use it for ads.";
const STAGES = [
  { id: "egg", label: "Egg", xp: 0, color: "from-amber-300 to-orange-400" },
  { id: "baby", label: "Baby", xp: 200, color: "from-emerald-300 to-teal-500" },
  { id: "teen", label: "Teen", xp: 700, color: "from-cyan-400 to-indigo-500" },
  { id: "final", label: "Final", xp: 1500, color: "from-fuchsia-400 to-violet-600" },
] as const;

const initialState: DemoState = {
  monsterName: "",
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSyncedDate: null,
  onboardingStatus: "notStarted",
  healthConnected: false,
  lastRewardDate: null,
  dailyAward: null,
  demoDayOffset: 0,
  demoSyncCount: 0,
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDemoDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function isYesterday(previous: string, current: string) {
  const [year, month, day] = current.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return toDateKey(date) === previous;
}

function calculateXp(summary: HealthSummary): DailyXp {
  const steps = Math.min(Math.floor(summary.steps / 250), 40);
  const activeCalories = Math.min(Math.floor(summary.activeCalories / 25), 20);
  const workouts = Math.min(summary.workouts * 20, 40);
  return { steps, activeCalories, workouts, total: Math.min(steps + activeCalories + workouts, 100) };
}

function mergeXp(previous: DailyXp | null, latest: DailyXp): DailyXp {
  if (!previous) return latest;
  const steps = Math.max(previous.steps, latest.steps);
  const activeCalories = Math.max(previous.activeCalories, latest.activeCalories);
  const workouts = Math.max(previous.workouts, latest.workouts);
  return { steps, activeCalories, workouts, total: Math.min(steps + activeCalories + workouts, 100) };
}

function getProgression(totalXp: number) {
  const current = [...STAGES].reverse().find((stage) => totalXp >= stage.xp)!;
  const index = STAGES.findIndex((stage) => stage.id === current.id);
  const next = STAGES[index + 1] ?? null;
  const progress = next ? (totalXp - current.xp) / (next.xp - current.xp) : 1;
  return { current, next, progress: Math.min(Math.max(progress, 0), 1), xpToNext: next ? next.xp - totalXp : 0 };
}

function mockSummary(date: string, syncCount: number): HealthSummary {
  const samples = [
    { steps: 4250, activeCalories: 260, workouts: 1 },
    { steps: 6500, activeCalories: 400, workouts: 2 },
    { steps: 10000, activeCalories: 550, workouts: 2 },
  ];
  return { date, ...samples[Math.min(syncCount - 1, samples.length - 1)] };
}

function loadState(): DemoState {
  try {
    return { ...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return initialState;
  }
}

export default function Demo() {
  const [data, setData] = useState<DemoState>(loadState);
  const [screen, setScreen] = useState<Screen>(() =>
    loadState().onboardingStatus === "complete" ? "home" : "welcome",
  );
  const [name, setName] = useState(data.monsterName);
  const [syncMessage, setSyncMessage] = useState("Sync once to collect today's XP.");
  const progression = useMemo(() => getProgression(data.totalXp), [data.totalXp]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  function saveName() {
    if (!name.trim()) return;
    setData((current) => ({ ...current, monsterName: name.trim(), onboardingStatus: "monsterCreated" }));
    setScreen("connect");
  }

  function connectHealth() {
    setData((current) => ({ ...current, healthConnected: true, onboardingStatus: "complete" }));
    setScreen("home");
  }

  function syncHealth() {
    const date = getDemoDate(data.demoDayOffset);
    const sameDay = data.dailyAward?.date === date;
    const syncCount = sameDay ? data.demoSyncCount + 1 : 1;
    const health = mockSummary(date, syncCount);
    const xp = mergeXp(sameDay ? data.dailyAward?.xp ?? null : null, calculateXp(health));
    const previousXp = sameDay ? data.dailyAward?.xp.total ?? 0 : 0;
    const newXp = Math.max(xp.total - previousXp, 0);
    const continuesStreak = data.lastRewardDate ? isYesterday(data.lastRewardDate, date) : false;
    const currentStreak =
      newXp <= 0 || data.lastRewardDate === date
        ? data.currentStreak
        : continuesStreak
          ? data.currentStreak + 1
          : 1;

    setData((current) => ({
      ...current,
      totalXp: current.totalXp + newXp,
      currentStreak,
      longestStreak: Math.max(current.longestStreak, currentStreak),
      lastRewardDate: newXp > 0 && current.lastRewardDate !== date ? date : current.lastRewardDate,
      lastSyncedDate: new Date().toISOString(),
      dailyAward: { date, health, xp },
      demoSyncCount: syncCount,
    }));
    setSyncMessage(newXp > 0 ? `Movement synced. ${newXp} new XP awarded.` : "Today's XP is already fully collected.");
  }

  function advanceDay() {
    setData((current) => ({ ...current, demoDayOffset: current.demoDayOffset + 1, demoSyncCount: 0 }));
    setSyncMessage("Demo date advanced. Sync movement to continue your streak.");
  }

  function resetDemo() {
    localStorage.removeItem(STORAGE_KEY);
    setData(initialState);
    setName("");
    setSyncMessage("Sync once to collect today's XP.");
    setScreen("welcome");
  }

  return (
    <div className="min-h-screen bg-[#06060d] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-pink-600/20 blur-[120px]" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
      </div>
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <a className="flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white" href="/">
          <ArrowLeft className="h-4 w-4" /> Landing page
        </a>
        <div className="rounded-full border border-pink-400/30 bg-pink-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-pink-200">
          Live MVP demo
        </div>
      </header>
      <main className="relative mx-auto grid max-w-6xl gap-8 px-5 pb-10 lg:grid-cols-[1fr_390px] lg:items-start">
        <section className="pt-5 lg:sticky lg:top-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-pink-300">Browser test build</p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Test the pocket-monster MVP before native health sync lands.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/65">
            This Vercel demo mirrors the mobile flow with deterministic mock movement and browser-local storage. Apple Health and Health Connect reads remain device-build features.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Info icon={Check} title="Working now" body="Onboarding, naming, mock sync, XP caps, streaks, evolution, detail, privacy, and reset." />
            <Info icon={HeartPulse} title="Native-only later" body="Real read-only HealthKit and Health Connect data require installed iOS and Android builds." />
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
            <strong className="text-white">Fast test loop:</strong> name your egg, connect demo health, sync three times, advance the demo day, and sync again. Two capped days unlock the Baby stage.
          </div>
        </section>
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[34px] border-[8px] border-zinc-800 bg-[#f8f4ec] text-[#25312e] shadow-2xl shadow-pink-500/20">
          <div className="flex h-[740px] flex-col overflow-hidden">
            {screen === "welcome" && <Welcome onContinue={() => setScreen("setup")} />}
            {screen === "setup" && <Setup name={name} setName={setName} onBack={() => setScreen("welcome")} onContinue={saveName} />}
            {screen === "connect" && <Connect onBack={() => setScreen("setup")} onConnect={connectHealth} />}
            {screen === "home" && <Dashboard data={data} progression={progression} message={syncMessage} onSync={syncHealth} onAdvance={advanceDay} onNavigate={setScreen} />}
            {screen === "monster" && <MonsterDetail data={data} progression={progression} onNavigate={setScreen} />}
            {screen === "settings" && <SettingsScreen data={data} onNavigate={setScreen} onReset={resetDemo} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function Info({ icon: Icon, title, body }: { icon: typeof Check; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Icon className="h-5 w-5 text-pink-300" />
      <h2 className="mt-3 text-sm font-bold">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-white/55">{body}</p>
    </div>
  );
}

function PhonePage({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
      {footer && <div className="border-t border-[#e7ded2] bg-white px-4 py-3">{footer}</div>}
    </>
  );
}

function Button({ children, onClick, soft = false, disabled = false }: { children: React.ReactNode; onClick: () => void; soft?: boolean; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`w-full rounded-2xl px-4 py-3.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-40 ${soft ? "bg-[#ddf2ec] text-[#147d6f]" : "bg-[#147d6f] text-white"}`}>
      {children}
    </button>
  );
}

function Back({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <button className="flex items-center gap-1 text-xs font-bold text-[#147d6f]" onClick={onClick}><ArrowLeft className="h-4 w-4" /> Back</button>
      <span className="text-sm font-black">{title}</span>
      <span className="w-12" />
    </div>
  );
}

function Monster({ stage, small = false }: { stage: StageId; small?: boolean }) {
  const current = STAGES.find((item) => item.id === stage)!;
  return (
    <div className={`mx-auto grid place-items-center rounded-[42%] border-4 border-black/10 bg-gradient-to-br ${current.color} shadow-lg ${small ? "h-28 w-24" : "h-44 w-36"}`}>
      <div className="text-center">
        {stage === "egg" ? <Egg className="mx-auto h-14 w-14" /> : <div className="mb-4 flex justify-center gap-6"><span className="h-4 w-4 rounded-full bg-[#25312e]" /><span className="h-4 w-4 rounded-full bg-[#25312e]" /></div>}
        <p className="text-[10px] font-black tracking-widest">{current.label.toUpperCase()}</p>
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return <div className="h-2.5 overflow-hidden rounded-full bg-[#e7ded2]"><div className="h-full rounded-full bg-[#147d6f]" style={{ width: `${value * 100}%` }} /></div>;
}

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <PhonePage>
      <p className="mt-6 text-xs font-black tracking-widest text-[#147d6f]">HATCHUP GAMES</p>
      <h2 className="mt-3 text-4xl font-black leading-[1.05]">Raise a monster with your daily movement.</h2>
      <p className="mt-4 text-sm leading-6 text-[#6e7b77]">Your steps, active energy, and workouts turn into XP. Start with an egg and watch your pocket companion grow.</p>
      <div className="py-8"><Monster stage="egg" /></div>
      <div className="rounded-2xl bg-[#fff0d8] p-4">
        <p className="font-black">Move. Earn XP. Evolve.</p>
        <p className="mt-1 text-sm leading-5 text-[#6e7b77]">A simple daily loop built around progress you already make.</p>
      </div>
      <div className="mt-6"><Button onClick={onContinue}>Start raising my monster</Button></div>
    </PhonePage>
  );
}

function Setup({ name, setName, onBack, onContinue }: { name: string; setName: (name: string) => void; onBack: () => void; onContinue: () => void }) {
  return (
    <PhonePage>
      <Back onClick={onBack} title="Meet your egg" />
      <h2 className="text-3xl font-black leading-tight">Every big evolution starts small.</h2>
      <p className="mt-3 text-sm leading-6 text-[#6e7b77]">Give your new monster a name. You can build XP after demo health is connected.</p>
      <div className="py-7"><Monster stage="egg" small /></div>
      <label className="text-xs font-black">Monster name</label>
      <input autoFocus maxLength={24} value={name} onChange={(event) => setName(event.target.value)} placeholder="Try Moss, Ember, or Nova" className="mt-2 w-full rounded-2xl border border-[#e7ded2] bg-white px-4 py-3.5 text-sm outline-none focus:border-[#147d6f]" />
      <div className="mt-4"><Button disabled={!name.trim()} onClick={onContinue}>Keep this name</Button></div>
    </PhonePage>
  );
}

function Connect({ onBack, onConnect }: { onBack: () => void; onConnect: () => void }) {
  return (
    <PhonePage>
      <Back onClick={onBack} title="Connect health" />
      <h2 className="text-3xl font-black leading-tight">Turn movement into monster XP.</h2>
      <p className="mt-3 text-sm leading-6 text-[#6e7b77]">Connect the browser demo source so HatchUp can calculate your daily reward.</p>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#ddf2ec] p-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#147d6f] text-white"><HeartPulse className="h-5 w-5" /></div>
        <div><p className="text-sm font-black">Demo health data</p><p className="text-xs text-[#6e7b77]">Mock read-only access for browser testing</p></div>
      </div>
      <div className="mt-3 rounded-2xl bg-white p-4">
        <p className="text-sm font-black">HatchUp reads only</p>
        <p className="mt-2 text-sm leading-6 text-[#6e7b77]">Steps<br />Active calories<br />Workouts and exercise sessions</p>
      </div>
      <div className="mt-3 rounded-2xl bg-[#fff0d8] p-4">
        <p className="text-sm font-black">Your privacy matters</p>
        <p className="mt-1 text-xs leading-5 text-[#6e7b77]">{PRIVACY_COPY}</p>
      </div>
      <div className="mt-5"><Button onClick={onConnect}>Connect demo health</Button></div>
      <p className="mt-3 text-center text-[11px] leading-4 text-[#6e7b77]">Real native sync is intentionally unavailable in a browser.</p>
    </PhonePage>
  );
}

function Dashboard({ data, progression, message, onSync, onAdvance, onNavigate }: { data: DemoState; progression: ReturnType<typeof getProgression>; message: string; onSync: () => void; onAdvance: () => void; onNavigate: (screen: Screen) => void }) {
  const award = data.dailyAward?.date === getDemoDate(data.demoDayOffset) ? data.dailyAward : null;
  return (
    <PhonePage footer={<Nav active="home" onNavigate={onNavigate} />}>
      <div className="flex items-center justify-between">
        <div><p className="text-[10px] font-black tracking-widest text-[#147d6f]">TODAY WITH</p><h2 className="text-3xl font-black">{data.monsterName}</h2></div>
        <div className="rounded-2xl bg-[#fff0d8] px-4 py-2 text-center"><p className="text-xl font-black">{data.currentStreak}</p><p className="text-[10px] font-bold text-[#6e7b77]">day streak</p></div>
      </div>
      <div className="mt-4 rounded-3xl bg-white p-4">
        <Monster stage={progression.current.id} small />
        <p className="mt-2 text-center text-xs font-black text-[#147d6f]">{progression.current.label} stage</p>
        <p className="mt-1 text-center text-xl font-black">{data.totalXp} total XP</p>
        <div className="mt-3"><Progress value={progression.progress} /></div>
        <p className="mt-2 text-center text-xs text-[#6e7b77]">{progression.next ? `${progression.xpToNext} XP until ${progression.next.label}` : "Final evolution reached"}</p>
      </div>
      <div className="mt-5 flex items-end justify-between"><p className="font-black">Today's movement</p><p className="text-[10px] text-[#6e7b77]">100 XP daily max</p></div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Steps" value={(award?.health.steps ?? 0).toLocaleString()} xp={award?.xp.steps ?? 0} />
        <Metric label="Active cal" value={String(award?.health.activeCalories ?? 0)} xp={award?.xp.activeCalories ?? 0} />
        <Metric label="Workouts" value={String(award?.health.workouts ?? 0)} xp={award?.xp.workouts ?? 0} />
      </div>
      <div className="mt-4"><Button onClick={onSync}>Sync mock health data</Button></div>
      <p className="mt-2 text-center text-[11px] leading-4 text-[#6e7b77]">{message}</p>
      <button onClick={onAdvance} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e7ded2] bg-white px-3 py-2 text-xs font-bold text-[#147d6f]"><CalendarPlus className="h-4 w-4" /> Advance demo day ({getDemoDate(data.demoDayOffset)})</button>
    </PhonePage>
  );
}

function Metric({ label, value, xp }: { label: string; value: string; xp: number }) {
  return <div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-bold text-[#6e7b77]">{label}</p><p className="mt-1 text-lg font-black">{value}</p><p className="text-[11px] font-black text-[#147d6f]">+{xp} XP</p></div>;
}

function MonsterDetail({ data, progression, onNavigate }: { data: DemoState; progression: ReturnType<typeof getProgression>; onNavigate: (screen: Screen) => void }) {
  return (
    <PhonePage footer={<Nav active="monster" onNavigate={onNavigate} />}>
      <Back onClick={() => onNavigate("home")} title="Monster detail" />
      <div className="rounded-3xl bg-white p-4">
        <Monster stage={progression.current.id} small />
        <h2 className="mt-3 text-center text-3xl font-black">{data.monsterName}</h2>
        <p className="mt-1 text-center text-xs font-black text-[#147d6f]">{progression.current.label} stage</p>
        <div className="mt-4"><Progress value={progression.progress} /></div>
      </div>
      <h3 className="mb-2 mt-5 font-black">Evolution path</h3>
      <div className="space-y-2">{STAGES.map((stage) => <div key={stage.id} className="flex items-center rounded-2xl bg-white p-3"><span className={`mr-3 h-3 w-3 rounded-full ${data.totalXp >= stage.xp ? "bg-[#147d6f]" : "bg-[#e7ded2]"}`} /><div className="flex-1"><p className="text-sm font-black">{stage.label}</p><p className="text-[11px] text-[#6e7b77]">{stage.xp} total XP</p></div><p className="text-[11px] font-bold text-[#147d6f]">{data.totalXp >= stage.xp ? "Unlocked" : "Locked"}</p></div>)}</div>
    </PhonePage>
  );
}

function SettingsScreen({ data, onNavigate, onReset }: { data: DemoState; onNavigate: (screen: Screen) => void; onReset: () => void }) {
  return (
    <PhonePage footer={<Nav active="settings" onNavigate={onNavigate} />}>
      <Back onClick={() => onNavigate("home")} title="Settings & privacy" />
      <h2 className="text-3xl font-black">Your data stays simple.</h2>
      <p className="mt-3 text-sm leading-6 text-[#6e7b77]">This browser demo stores progress locally on this device.</p>
      <div className="mt-5 divide-y divide-[#e7ded2] rounded-2xl bg-white px-4">
        <Setting label="Health source" value="Demo health data" />
        <Setting label="Connection" value={data.healthConnected ? "Connected" : "Not connected"} />
        <Setting label="Last sync" value={data.lastSyncedDate ? new Date(data.lastSyncedDate).toLocaleString() : "Not synced yet"} />
      </div>
      <div className="mt-3 rounded-2xl bg-[#fff0d8] p-4"><p className="text-sm font-black">Privacy promise</p><p className="mt-1 text-xs leading-5 text-[#6e7b77]">{PRIVACY_COPY}</p></div>
      <div className="mt-3 rounded-2xl bg-[#ddf2ec] p-4"><p className="text-sm font-black">Read-only health access</p><p className="mt-1 text-xs leading-5 text-[#6e7b77]">HatchUp never writes data back to Apple Health or Health Connect in this MVP.</p></div>
      <button onClick={onReset} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-100 px-4 py-3 text-sm font-black text-red-700"><RotateCcw className="h-4 w-4" /> Reset browser demo</button>
    </PhonePage>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return <div className="py-3"><p className="text-[10px] font-bold text-[#6e7b77]">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>;
}

function Nav({ active, onNavigate }: { active: "home" | "monster" | "settings"; onNavigate: (screen: Screen) => void }) {
  return <div className="grid grid-cols-3 gap-2"><NavButton icon={Home} label="Home" selected={active === "home"} onClick={() => onNavigate("home")} /><NavButton icon={Trophy} label="Monster" selected={active === "monster"} onClick={() => onNavigate("monster")} /><NavButton icon={Settings} label="Settings" selected={active === "settings"} onClick={() => onNavigate("settings")} /></div>;
}

function NavButton({ icon: Icon, label, selected, onClick }: { icon: typeof Home; label: string; selected: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-xl py-1 text-[10px] font-bold ${selected ? "text-[#147d6f]" : "text-[#6e7b77]"}`}><Icon className="h-4 w-4" />{label}</button>;
}
