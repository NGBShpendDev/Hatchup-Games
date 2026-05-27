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

export default function HealthSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { player } = usePlayer();
  const [connections, setConnections] = useState<HealthConnection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  const googleFitConnection = connections.find(c => c.platform === "google_fit");
  const isGoogleConnected = googleFitConnection?.isConnected ?? false;

  const [appleNotifyRequested, setAppleNotifyRequested] = useState<boolean>(() => {
    try { return localStorage.getItem("hatchup_apple_health_notify") === "1"; } catch { return false; }
  });

  const handleAppleNotify = useCallback(() => {
    try { localStorage.setItem("hatchup_apple_health_notify", "1"); } catch { /* ignore */ }
    setAppleNotifyRequested(true);
    toast({ title: "You're on the list!", description: "We'll notify you when Apple Health support launches." });
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected === "google_fit") {
      toast({ title: "Google Fit connected!", description: "Your workouts will now sync automatically." });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      const msgs: Record<string, string> = {
        oauth_denied: "Connection cancelled.",
        not_configured: "Google Fit isn't configured yet. Add API credentials first.",
        token_exchange_failed: "Authentication failed. Please try again.",
        invalid_state: "Invalid request. Please try again.",
      };
      toast({ title: "Connection failed", description: msgs[error] ?? error, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, []);

  async function fetchConnections() {
    setIsLoadingConnections(true);
    try {
      const res = await fetch("/api/health/connections", { credentials: "include" });
      if (res.ok) setConnections(await res.json());
    } catch { /* silent */ }
    setIsLoadingConnections(false);
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/health/sync", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: data.activitiesImported > 0
            ? `Synced! +${data.xpEarned} XP from ${data.activitiesImported} activities`
            : "Already up to date",
          description: data.activitiesImported > 0 ? "Your Pals gained energy from your workouts." : undefined,
        });
        fetchConnections();
      } else {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    }
    setIsSyncing(false);
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      await fetch("/api/health/connections/google_fit", { method: "DELETE", credentials: "include" });
      toast({ title: "Google Fit disconnected" });
      fetchConnections();
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    }
    setIsDisconnecting(false);
  }

  function handleConnectGoogle() {
    setConsentModalOpen(true);
  }

  function handleConsentAccept() {
    setConsentModalOpen(false);
    window.location.href = "/api/health/google/connect";
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 pb-8">
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => setLocation("/")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-black text-foreground">Health Sync</h1>
            <p className="text-sm text-muted-foreground">Connect your fitness apps for passive progression</p>
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
              Your Pals gained <span className="font-bold text-yellow-400">+{player?.passiveXpSinceLastVisit} XP</span> while you were away from passive syncing!
            </p>
          </motion.div>
        )}

        {/* Google Fit */}
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Google Fit</h2>
                  <p className="text-xs text-muted-foreground">Android & web</p>
                </div>
              </div>
              {isLoadingConnections ? (
                <div className="w-16 h-6 bg-border/30 rounded-full animate-pulse" />
              ) : isGoogleConnected ? (
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

            {isGoogleConnected && googleFitConnection?.lastSyncedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 bg-border/10 rounded-lg p-2.5">
                <Clock className="w-3.5 h-3.5" />
                Last synced {timeAgo(googleFitConnection.lastSyncedAt)}
                <span className="ml-auto text-[10px] text-muted-foreground/60">Auto-syncs every 30 min</span>
              </div>
            )}

            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Automatically import steps, workouts, active minutes, and sleep from Google Fit. Your Pals grow even when the app is closed.
            </p>

            <div className="flex gap-2">
              {isGoogleConnected ? (
                <>
                  <Button
                    onClick={handleSync}
                    disabled={isSyncing}
                    size="sm"
                    className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing…" : "Sync Now"}
                  </Button>
                  <Button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleConnectGoogle}
                  size="sm"
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90"
                >
                  <Activity className="w-3.5 h-3.5 mr-1.5" />
                  Connect Google Fit
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Apple Health */}
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Apple className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Apple Health</h2>
                  <p className="text-xs text-muted-foreground">iPhone & Apple Watch</p>
                </div>
              </div>
              <div className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full">
                Coming soon
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Full Apple Health and Apple Watch support is coming in the HatchUp Fitness Pals mobile app. Steps, workouts, sleep, and heart rate will all sync to power your Pals.
            </p>
            {appleNotifyRequested ? (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-2.5">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                You're on the list! We'll notify you at launch.
              </div>
            ) : (
              <Button
                size="sm"
                className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
                onClick={handleAppleNotify}
              >
                <Smartphone className="w-3.5 h-3.5 mr-1.5" />
                Notify me when it launches
              </Button>
            )}
          </div>
        </div>

        {/* Wearables */}
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Watch className="w-4 h-4 text-muted-foreground" />
            Wearable Support (Mobile App)
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {["Apple Watch", "Fitbit", "Garmin", "Samsung Watch", "WHOOP", "Oura Ring"].map(device => (
              <div key={device} className="bg-border/10 rounded-lg p-2 text-center">
                <p className="text-xs text-muted-foreground">{device}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Full wearable integration coming in the HatchUp Fitness Pals mobile app.
          </p>
        </div>

        {/* Passive Progression Info */}
        <div className="bg-gradient-to-br from-violet-500/10 to-pink-500/10 border border-violet-500/20 rounded-2xl p-5">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Passive Progression
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {[
              "Walking at work progresses your eggs",
              "Gym sessions evolve your Pals",
              "Sleep improves recovery stats",
              "Streaks unlock special aura effects",
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
                  <p>HatchUp Fitness Pals reads the following data from Google Fit — <strong className="text-foreground">read-only, never written back</strong>:</p>
                  <ul className="space-y-1.5 list-none">
                    {["Step count & distance", "Workout sessions & type", "Active minutes", "Sleep duration", "Calories burned"].map(item => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p>Data is used only to calculate XP rewards and egg progress. Tokens are stored encrypted and never shared.</p>
                  <p>You can disconnect at any time to stop data access immediately.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Consent Modal */}
      <AnimatePresence>
        {consentModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setConsentModalOpen(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border/50 rounded-3xl p-6 w-full max-w-sm"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4 mx-auto">
                <Activity className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-xl font-black text-center mb-1">Connect Google Fit</h2>
              <p className="text-sm text-muted-foreground text-center mb-5">
                HatchUp Fitness Pals will read the following data to reward your Pals for your real-world activity:
              </p>
              <div className="space-y-2 mb-6">
                {[
                  { icon: "👟", label: "Steps & walking distance" },
                  { icon: "🏋️", label: "Workout sessions & type" },
                  { icon: "⚡", label: "Active minutes & calories" },
                  { icon: "😴", label: "Sleep duration" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 bg-border/10 rounded-xl px-3 py-2.5">
                    <span>{item.icon}</span>
                    <span className="text-sm">{item.label}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center mb-5">
                Read-only access. Data is never shared. Disconnect anytime.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setConsentModalOpen(false)}
                >
                  No thanks
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90"
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
