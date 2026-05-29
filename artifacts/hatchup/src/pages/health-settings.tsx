import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePlayer } from "@/lib/playerContext";
import {
  Activity,
  Smartphone,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Shield,
  ChevronDown,
  ChevronUp,
  Apple,
  Clock,
  Zap,
  Watch,
  Link2,
  Unlink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type HealthConnection = {
  id: number;
  platform: string;
  isConnected: boolean;
  lastSyncedAt: string | null;
  consentGivenAt: string;
  createdAt: string;
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type PlatformDef = {
  key: string;
  label: string;
  subtitle: string;
  color: string;
  bgColor: string;
  borderColor: string;
  connectPath: string | null;   // null = mobile-only / via Apple Health
  description: string;
  dataPoints: string[];
  autoSyncs?: boolean;
};

const PLATFORMS: PlatformDef[] = [
  {
    key: "google_fit",
    label: "Google Fit",
    subtitle: "Android & Wear OS",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    connectPath: "/api/health/google/connect",
    description: "Sync steps, workouts, active minutes, and sleep from Google Fit. Works with Wear OS, Pixel Watch, and any Android wearable that syncs to Google Fit.",
    dataPoints: ["Steps & distance", "Workout sessions", "Active minutes", "Sleep duration", "Calories burned"],
    autoSyncs: true,
  },
  {
    key: "fitbit",
    label: "Fitbit",
    subtitle: "All Fitbit devices",
    color: "text-teal-400",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/30",
    connectPath: "/api/health/fitbit/connect",
    description: "Connect your Fitbit tracker or smartwatch to sync daily steps, active minutes, workouts, sleep stages, and heart rate to power your Pals.",
    dataPoints: ["Daily steps", "Active minutes", "Workout sessions", "Sleep stages", "Heart rate zones"],
    autoSyncs: true,
  },
  {
    key: "garmin",
    label: "Garmin",
    subtitle: "Garmin Connect",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    connectPath: "/api/health/garmin/connect",
    description: "Link your Garmin device via Garmin Connect. Syncs detailed GPS activity data, VO2 max, training load, steps, and sleep from all Garmin watches.",
    dataPoints: ["GPS activities & pace", "Daily steps & calories", "Sleep & body battery", "Training load & VO2 max", "Active minutes"],
    autoSyncs: true,
  },
  {
    key: "oura",
    label: "Oura Ring",
    subtitle: "Oura Gen3 & Gen4",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    connectPath: "/api/health/oura/connect",
    description: "Connect your Oura Ring to sync readiness, sleep quality, activity, heart rate variability, and workouts. The most comprehensive sleep and recovery data available.",
    dataPoints: ["Readiness & recovery score", "Sleep stages & HRV", "Daily activity & steps", "Workout sessions", "Body temperature"],
    autoSyncs: true,
  },
  {
    key: "apple_health",
    label: "Apple Health",
    subtitle: "iPhone & Apple Watch",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    connectPath: null,
    description: "Apple Health and Apple Watch sync natively through the HatchUp mobile app on iPhone. This includes data from Apple Watch, plus any wearable that syncs to Apple Health — like WHOOP, Polar, Amazfit, and more.",
    dataPoints: ["Apple Watch activity rings", "Steps & workouts", "Sleep (watchOS 9+)", "Heart rate & HRV", "Any app that writes to Apple Health"],
  },
];

const PASSIVE_WEARABLES = [
  { name: "WHOOP", via: "Apple Health / Google Fit" },
  { name: "Samsung Galaxy Watch", via: "Google Fit / Health Connect" },
  { name: "Polar", via: "Apple Health / Polar Flow" },
  { name: "Amazfit", via: "Apple Health / Zepp" },
  { name: "Suunto", via: "Apple Health / Suunto App" },
  { name: "Coros", via: "Apple Health / Garmin" },
];

export default function HealthSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { player } = usePlayer();
  const [connections, setConnections] = useState<HealthConnection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [consentPlatform, setConsentPlatform] = useState<PlatformDef | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      const def = PLATFORMS.find(p => p.key === connected);
      toast({
        title: `${def?.label ?? connected} connected!`,
        description: "Your workouts will now sync automatically every 30 minutes.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      const msgs: Record<string, string> = {
        oauth_denied: "Connection cancelled.",
        not_configured: "This integration isn't configured yet. API credentials are needed.",
        token_exchange_failed: "Authentication failed. Please try again.",
        invalid_state: "Invalid request. Please try again.",
        network_error: "Network error. Please check your connection and try again.",
      };
      toast({ title: "Connection failed", description: msgs[error] ?? error, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => { fetchConnections(); }, []);

  async function fetchConnections() {
    setIsLoadingConnections(true);
    try {
      const res = await fetch("/api/health/connections", { credentials: "include" });
      if (res.ok) setConnections(await res.json());
    } catch { /* silent */ }
    setIsLoadingConnections(false);
  }

  const connectionMap = Object.fromEntries(connections.map(c => [c.platform, c]));

  async function handleSync(platform: string) {
    setSyncingPlatform(platform);
    try {
      const res = await fetch(`/api/health/sync?platform=${platform}`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        const def = PLATFORMS.find(p => p.key === platform);
        toast({
          title: data.activitiesImported > 0
            ? `Synced! +${data.xpEarned} XP from ${data.activitiesImported} activities`
            : "Already up to date",
          description: data.activitiesImported > 0 ? `${def?.label ?? platform} data applied to your Pals.` : undefined,
        });
        fetchConnections();
      } else {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    }
    setSyncingPlatform(null);
  }

  async function handleDisconnect(platform: string) {
    const def = PLATFORMS.find(p => p.key === platform);
    setDisconnectingPlatform(platform);
    try {
      await fetch(`/api/health/connections/${platform}`, { method: "DELETE", credentials: "include" });
      toast({ title: `${def?.label ?? platform} disconnected` });
      fetchConnections();
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    }
    setDisconnectingPlatform(null);
  }

  function handleConnect(platform: PlatformDef) {
    setConsentPlatform(platform);
  }

  function handleConsentAccept() {
    if (!consentPlatform?.connectPath) return;
    setConsentPlatform(null);
    window.location.href = consentPlatform.connectPath;
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5 pb-10">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => setLocation("/")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-black text-foreground">Wearable Sync</h1>
            <p className="text-sm text-muted-foreground">Connect fitness trackers for passive Pal progression</p>
          </div>
        </div>

        {(player?.passiveXpSinceLastVisit ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 rounded-2xl p-4 flex items-center gap-3"
          >
            <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-foreground">
              Your Pals gained <span className="font-bold text-yellow-400">+{player?.passiveXpSinceLastVisit} XP</span> while you were away!
            </p>
          </motion.div>
        )}

        {/* Platform cards */}
        {PLATFORMS.map(platform => {
          const conn = connectionMap[platform.key];
          const isConnected = conn?.isConnected ?? false;
          const isSyncing = syncingPlatform === platform.key;
          const isDisconnecting = disconnectingPlatform === platform.key;
          const isMobileOnly = platform.connectPath === null;
          const isExpanded = expandedPlatform === platform.key;

          return (
            <div
              key={platform.key}
              className="bg-card border border-border/50 rounded-2xl overflow-hidden"
            >
              <div className="p-5">
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${platform.bgColor} flex items-center justify-center flex-shrink-0`}>
                      {platform.key === "apple_health" ? (
                        <Apple className={`w-5 h-5 ${platform.color}`} />
                      ) : platform.key === "google_fit" ? (
                        <Activity className={`w-5 h-5 ${platform.color}`} />
                      ) : (
                        <Watch className={`w-5 h-5 ${platform.color}`} />
                      )}
                    </div>
                    <div>
                      <h2 className="font-bold text-foreground leading-tight">{platform.label}</h2>
                      <p className="text-xs text-muted-foreground">{platform.subtitle}</p>
                    </div>
                  </div>

                  {isLoadingConnections ? (
                    <div className="w-20 h-6 bg-border/30 rounded-full animate-pulse" />
                  ) : isMobileOnly ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-border/20 px-2.5 py-1 rounded-full">
                      <Smartphone className="w-3 h-3" />
                      Mobile app
                    </div>
                  ) : isConnected ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full border border-green-400/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Connected
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-border/20 px-2.5 py-1 rounded-full">
                      <XCircle className="w-3 h-3" />
                      Not connected
                    </div>
                  )}
                </div>

                {/* Last synced */}
                {isConnected && conn?.lastSyncedAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 bg-border/10 rounded-lg p-2.5">
                    <Clock className="w-3.5 h-3.5" />
                    Last synced {timeAgo(conn.lastSyncedAt)}
                    {platform.autoSyncs && (
                      <span className="ml-auto text-[10px] text-muted-foreground/60">Auto-syncs every 30 min</span>
                    )}
                  </div>
                )}

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{platform.description}</p>

                {/* Data points toggle */}
                <button
                  onClick={() => setExpandedPlatform(isExpanded ? null : platform.key)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {isExpanded ? "Hide" : "Show"} what data is synced
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 gap-1.5 mb-3">
                        {platform.dataPoints.map(dp => (
                          <div key={dp} className="flex items-center gap-2 text-xs">
                            <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                            <span className="text-muted-foreground">{dp}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action buttons */}
                {isMobileOnly ? (
                  <div className={`text-xs ${platform.bgColor} ${platform.color} border ${platform.borderColor} rounded-xl px-4 py-2.5 flex items-center gap-2`}>
                    <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
                    Open the <strong>HatchUp mobile app</strong> on your iPhone to connect Apple Health and Apple Watch.
                  </div>
                ) : isConnected ? (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleSync(platform.key)}
                      disabled={isSyncing}
                      size="sm"
                      className={`flex-1 ${platform.bgColor} hover:opacity-80 ${platform.color} border ${platform.borderColor}`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
                      {isSyncing ? "Syncing…" : "Sync Now"}
                    </Button>
                    <Button
                      onClick={() => handleDisconnect(platform.key)}
                      disabled={isDisconnecting}
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Unlink className="w-3.5 h-3.5 mr-1 opacity-70" />
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleConnect(platform)}
                    size="sm"
                    className={`w-full bg-gradient-to-r ${
                      platform.key === "google_fit" ? "from-blue-500 to-blue-600" :
                      platform.key === "fitbit" ? "from-teal-500 to-teal-600" :
                      platform.key === "garmin" ? "from-emerald-500 to-emerald-600" :
                      "from-violet-500 to-violet-600"
                    } text-white hover:opacity-90`}
                  >
                    <Link2 className="w-3.5 h-3.5 mr-1.5" />
                    Connect {platform.label}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Other wearables via bridge */}
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
            <Watch className="w-4 h-4 text-muted-foreground" />
            More wearables supported
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            These devices sync automatically once you connect Apple Health (mobile) or Google Fit:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PASSIVE_WEARABLES.map(w => (
              <div key={w.name} className="bg-border/10 rounded-xl p-3">
                <p className="text-xs font-semibold text-foreground">{w.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">via {w.via}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Passive Progression Info */}
        <div className="bg-gradient-to-br from-violet-500/10 to-pink-500/10 border border-violet-500/20 rounded-2xl p-5">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            How passive progression works
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {[
              "Every 1,000 steps hatches your egg faster",
              "Workouts earn XP and evolve your Pals",
              "Sleep improves recovery stats overnight",
              "Activity streaks unlock special aura effects",
              "Your Pals keep growing even when the app is closed",
            ].map(item => (
              <div key={item} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 flex-shrink-0" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy */}
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <button
            onClick={() => setPrivacyOpen(!privacyOpen)}
            className="w-full p-5 flex items-center justify-between text-left hover:bg-border/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Privacy & data</span>
            </div>
            {privacyOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {privacyOpen && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-3 text-sm text-muted-foreground">
                  <p>HatchUp reads health data in <strong className="text-foreground">read-only</strong> mode — we never write back to your fitness apps.</p>
                  <ul className="space-y-1.5 list-none">
                    {["Step count & distance", "Workout sessions & type", "Active minutes", "Sleep duration", "Calories burned", "Heart rate (where available)"].map(item => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p>OAuth tokens are stored AES-256 encrypted. Data is used only to calculate XP rewards and egg progress — never shared.</p>
                  <p>Disconnect any tracker at any time to immediately revoke access.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Consent modal */}
      <AnimatePresence>
        {consentPlatform && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setConsentPlatform(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border/50 rounded-3xl p-6 w-full max-w-sm"
            >
              <div className={`w-12 h-12 rounded-2xl ${consentPlatform.bgColor} flex items-center justify-center mb-4 mx-auto`}>
                {consentPlatform.key === "apple_health" ? (
                  <Apple className={`w-6 h-6 ${consentPlatform.color}`} />
                ) : consentPlatform.key === "google_fit" ? (
                  <Activity className={`w-6 h-6 ${consentPlatform.color}`} />
                ) : (
                  <Watch className={`w-6 h-6 ${consentPlatform.color}`} />
                )}
              </div>
              <h2 className="text-xl font-black text-center mb-1">Connect {consentPlatform.label}</h2>
              <p className="text-sm text-muted-foreground text-center mb-5">
                HatchUp will read the following data to reward your Pals for your real-world activity:
              </p>
              <div className="space-y-2 mb-5">
                {consentPlatform.dataPoints.slice(0, 4).map(dp => (
                  <div key={dp} className="flex items-center gap-3 bg-border/10 rounded-xl px-3 py-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    <span className="text-sm">{dp}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center mb-5">
                Read-only access. Data is encrypted and never shared. Disconnect anytime.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setConsentPlatform(null)}>
                  No thanks
                </Button>
                <Button
                  className={`flex-1 bg-gradient-to-r ${
                    consentPlatform.key === "google_fit" ? "from-blue-500 to-blue-600" :
                    consentPlatform.key === "fitbit" ? "from-teal-500 to-teal-600" :
                    consentPlatform.key === "garmin" ? "from-emerald-500 to-emerald-600" :
                    "from-violet-500 to-violet-600"
                  } text-white hover:opacity-90`}
                  onClick={handleConsentAccept}
                >
                  Allow & Connect
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
