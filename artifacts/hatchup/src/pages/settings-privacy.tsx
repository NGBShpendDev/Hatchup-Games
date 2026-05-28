import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SafetyGuidelinesSheet } from "@/components/safety-guidelines-sheet";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  MapPin,
  Phone,
  Lock,
  CheckCircle,
  Eye,
  EyeOff,
  Ban,
  AlertTriangle,
  ChevronRight,
  Camera,
  KeyRound,
  Baby,
  Bell,
  CalendarClock,
} from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const LOCATION_OPTIONS = [
  { value: "exact", label: "Exact location", desc: "Other users see your precise location", icon: <MapPin className="w-4 h-4 text-red-400" />, color: "text-red-400" },
  { value: "neighborhood", label: "Neighborhood", desc: "Show approx. 1-mile area", icon: <MapPin className="w-4 h-4 text-amber-400" />, color: "text-amber-400" },
  { value: "city", label: "City only", desc: "Only your city is shown (recommended)", icon: <MapPin className="w-4 h-4 text-green-400" />, color: "text-green-400" },
  { value: "hidden", label: "Hidden", desc: "Location completely private", icon: <EyeOff className="w-4 h-4 text-blue-400" />, color: "text-blue-400" },
];

export default function SettingsPrivacy() {
  const { playerId, player } = usePlayer();
  const { toast } = useToast();

  const [locationVisibility, setLocationVisibility] = useState("city");
  const [requireApproval, setRequireApproval] = useState(false);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [isMinor, setIsMinor] = useState(false);
  const [recapEnabled, setRecapEnabled] = useState(true);
  const [recapDay, setRecapDay] = useState(0);
  const [recapHour, setRecapHour] = useState(9);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [recapPreviewSending, setRecapPreviewSending] = useState(false);
  const [recapPreview, setRecapPreview] = useState<{ title: string; body: string } | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyPhotoName, setVerifyPhotoName] = useState<string | null>(null);
  const todayLabel = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), []);

  // Web push state ──
  const push = usePushSubscription();
  const [pushPrefs, setPushPrefs] = useState({ invites: true, endingSoon: true, completed: true });
  const [pushPrefsLoaded, setPushPrefsLoaded] = useState(false);

  useEffect(() => {
    if (!playerId || pushPrefsLoaded) return;
    fetch("/api/push/preferences", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setPushPrefs({ invites: !!data.invites, endingSoon: !!data.endingSoon, completed: !!data.completed });
        setPushPrefsLoaded(true);
      })
      .catch(() => setPushPrefsLoaded(true));
  }, [playerId, pushPrefsLoaded]);

  const updatePushPref = async (key: "invites" | "endingSoon" | "completed", value: boolean) => {
    setPushPrefs(prev => ({ ...prev, [key]: value }));
    try {
      await fetch("/api/push/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      toast({ title: "Could not update notification preference", variant: "destructive" });
    }
  };

  const togglePush = async (next: boolean) => {
    if (next) {
      const ok = await push.enable();
      if (ok) toast({ title: "Push notifications enabled", description: "We'll ping you when challenges need your attention." });
      else if (push.error) toast({ title: "Couldn't enable push", description: push.error, variant: "destructive" });
    } else {
      await push.disable();
      toast({ title: "Push notifications disabled" });
    }
  };

  useEffect(() => {
    if (!playerId || loaded) return;
    fetch(`/api/players/${playerId}/privacy-settings`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setLocationVisibility(data.locationVisibility ?? "city");
        setRequireApproval(data.requireWorkoutApproval ?? false);
        setEmergencyName(data.emergencyContactName ?? "");
        setEmergencyPhone(data.emergencyContactPhone ?? "");
        setIsMinor(Boolean(data.isMinor));
        if (typeof data.weeklyRecapEnabled === "boolean") setRecapEnabled(data.weeklyRecapEnabled);
        if (typeof data.weeklyRecapDayOfWeek === "number") setRecapDay(data.weeklyRecapDayOfWeek);
        if (typeof data.weeklyRecapHourLocal === "number") setRecapHour(data.weeklyRecapHourLocal);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [playerId]);

  const handleVerifySubmit = async () => {
    if (!playerId) return;
    setVerifySubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "verification_request",
          contentType: "verification",
          description: `Verification request submitted on ${todayLabel}`,
        }),
      });
      if (res.ok) {
        setVerifyPending(true);
        setVerifyOpen(false);
        toast({ title: "Verification submitted", description: "Our team will review your request within 24 hours." });
      } else {
        toast({ title: "Error", description: "Could not submit verification. Please try again.", variant: "destructive" });
      }
    } finally {
      setVerifySubmitting(false);
    }
  };

  const handleSendRecapPreview = async () => {
    if (!playerId || recapPreviewSending) return;
    setRecapPreviewSending(true);
    try {
      const res = await fetch("/api/nutrition/recap/preview", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 429) {
        toast({
          title: "Slow down",
          description: "You can only send one recap preview per hour. Try again later.",
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) {
        toast({ title: "Couldn't send preview", description: "Please try again in a moment.", variant: "destructive" });
        return;
      }
      const data = await res.json() as { title: string; body: string };
      setRecapPreview({ title: data.title, body: data.body });
      toast({
        title: "Preview sent",
        description: "Check your notifications for a sample of your weekly recap.",
      });
    } catch {
      toast({ title: "Couldn't send preview", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setRecapPreviewSending(false);
    }
  };

  const handleSave = async () => {
    if (!playerId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/players/${playerId}/privacy-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationVisibility,
          requireWorkoutApproval: requireApproval,
          emergencyContactName: emergencyName || null,
          emergencyContactPhone: emergencyPhone || null,
          isMinor,
          weeklyRecapEnabled: recapEnabled,
          weeklyRecapDayOfWeek: recapDay,
          weeklyRecapHourLocal: recapHour,
          weeklyRecapTzOffsetMinutes: -new Date().getTimezoneOffset(),
          weeklyRecapTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (res.ok) {
        toast({ title: "Privacy settings saved", description: "Your safety preferences have been updated." });
      } else {
        toast({ title: "Error", description: "Could not save settings.", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="font-black text-2xl">Privacy & Safety</h1>
            <p className="text-xs text-muted-foreground font-medium">Control your location, requests, and emergency contact</p>
          </div>
        </div>

        {/* Verification badge */}
        <GlassCard glow="cyan" className="p-4">
          <div className="relative z-10 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Profile Verification</p>
              <p className="text-xs text-muted-foreground font-medium">Verified profiles earn more trust and unlock group features.</p>
            </div>
            {(player as { isVerified?: boolean } | null)?.isVerified ? (
              <GlowBadge tone="cyan" className="shrink-0">Verified ✓</GlowBadge>
            ) : verifyPending ? (
              <GlowBadge tone="yellow" className="shrink-0">Pending Review</GlowBadge>
            ) : (
              <NeonButton
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => setVerifyOpen(true)}
              >
                Start Verification
              </NeonButton>
            )}
          </div>
        </GlassCard>

        {/* Verification dialog */}
        <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
          <DialogContent className="bg-card max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-black">
                <Camera className="w-5 h-5 text-blue-400" />
                Verify Your Profile
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground font-medium">
                Complete these steps, then submit. Our team will review within 24 hours:
              </p>
              <ol className="space-y-2 text-sm font-medium list-decimal list-inside">
                <li>Take a selfie holding a handwritten note with today's date:</li>
              </ol>
              <div className="bg-muted/40 rounded-xl px-4 py-3 text-center font-black text-blue-300 text-sm border border-blue-500/20">
                {todayLabel}
              </div>
              <div>
                <p className="text-sm font-bold mb-2">2. Attach your photo:</p>
                <label className={`flex items-center gap-2 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                  verifyPhotoName ? "border-green-500 bg-green-500/10" : "border-dashed border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10"
                }`}>
                  <Camera className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {verifyPhotoName ?? "Tap to attach selfie photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={e => setVerifyPhotoName(e.target.files?.[0]?.name ?? null)}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground italic">
                3. Submit — our team reviews manually within 24 hours. No government ID is collected.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerifyOpen(false)} className="flex-1">Cancel</Button>
              <Button
                onClick={handleVerifySubmit}
                disabled={verifySubmitting || !verifyPhotoName}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black disabled:opacity-50"
              >
                {verifySubmitting ? "Submitting..." : "Submit for Review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Location Visibility */}
        <GlassCard className="p-4">
          <div className="relative z-10 space-y-3">
            <div className="text-base font-black flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Location Visibility
            </div>
            <div className="space-y-2">
            {LOCATION_OPTIONS.map((opt) => (
              <motion.button
                key={opt.value}
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocationVisibility(opt.value)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                  locationVisibility === opt.value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background/50 hover:border-border/80"
                }`}
              >
                {opt.icon}
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${locationVisibility === opt.value ? opt.color : ""}`}>{opt.label}</p>
                  <p className="text-xs text-muted-foreground font-medium">{opt.desc}</p>
                </div>
                {locationVisibility === opt.value && (
                  <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                )}
              </motion.button>
            ))}
            </div>
          </div>
        </GlassCard>

        {/* Workout Approval */}
        <GlassCard className="p-4">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-purple-400 shrink-0" />
              <div>
                <p className="font-bold text-sm">Approve Workout Requests</p>
                <p className="text-xs text-muted-foreground font-medium">
                  Manually approve before anyone can add you as a workout partner
                </p>
              </div>
            </div>
            <Switch
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
            />
          </div>
        </GlassCard>

        {/* Emergency Contact */}
        <GlassCard glow="accent" className="p-4">
          <div className="relative z-10 space-y-3">
            <div>
              <div className="text-base font-black flex items-center gap-2">
                <Phone className="w-4 h-4 text-green-400" />
                Emergency Contact
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-1">
                Displayed on your profile during live events so others know who to contact in an emergency.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-name" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Name
              </Label>
              <Input
                id="ec-name"
                placeholder="e.g. Jane Smith"
                value={emergencyName}
                onChange={e => setEmergencyName(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-phone" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Phone Number
              </Label>
              <Input
                id="ec-phone"
                placeholder="e.g. +1 555-123-4567"
                value={emergencyPhone}
                onChange={e => setEmergencyPhone(e.target.value)}
                className="h-10"
                type="tel"
              />
            </div>
          </div>
        </GlassCard>

        {/* Minor account / parental controls */}
        <GlassCard glow="primary" className="p-4">
          <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Baby className="w-5 h-5 text-pink-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-sm">Minor account (parental controls)</p>
                  <p className="text-xs text-muted-foreground font-medium">
                    Enables safer defaults: blocks social posts, comments, follows, and group chat. Forces "City only" location and approval-required workout partners.
                  </p>
                </div>
              </div>
              <Switch
                checked={isMinor}
                onCheckedChange={(v) => {
                  // One-way toggle: enabling requires confirmation; disabling
                  // requires guardian/admin review and is blocked client-side.
                  if (!v && isMinor) {
                    toast({
                      title: "Guardian review required",
                      description: "Removing minor status requires a guardian or admin. Please contact support.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (v && !isMinor) {
                    const ok = window.confirm(
                      "Mark this account as a minor? This will block social posting, force City-only location, and require workout-partner approval. You will need a guardian or admin to remove this later.",
                    );
                    if (!ok) return;
                  }
                  setIsMinor(v);
                }}
                disabled={isMinor}
              />
          </div>
        </GlassCard>

        {/* Push notifications */}
        <GlassCard glow="cyan" className="p-4">
          <div className="relative z-10 space-y-3">
            <div>
              <div className="text-base font-black flex items-center gap-2">
                <Bell className="w-4 h-4 text-cyan-400" />
                Push Notifications
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-1">
                Get pinged about challenge invites and deadlines even when HatchUp is closed.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-sm">Enable on this device</p>
                <p className="text-xs text-muted-foreground font-medium">
                  {!push.supported
                    ? "Not supported in this browser."
                    : push.permission === "denied"
                      ? "Blocked by your browser — enable notifications in site settings."
                      : push.subscribed
                        ? "This device will receive push notifications."
                        : "Turn on to receive pushes on this device."}
                </p>
              </div>
              <Switch
                checked={push.subscribed}
                disabled={!push.supported || push.enabling || push.permission === "denied"}
                onCheckedChange={togglePush}
              />
            </div>

            <div className="border-t border-cyan-500/10 pt-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Categories</p>
              {[
                { key: "invites" as const, label: "Challenge invites", desc: "Someone invites you to a challenge" },
                { key: "endingSoon" as const, label: "Ending soon", desc: "A joined challenge has under 24 hours left" },
                { key: "completed" as const, label: "Challenge complete", desc: "A challenge you joined wrapped up" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground font-medium">{desc}</p>
                  </div>
                  <Switch
                    checked={pushPrefs[key]}
                    disabled={!pushPrefsLoaded}
                    onCheckedChange={(v) => updatePushPref(key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Weekly nutrition recap */}
        <Card className="border border-emerald-500/20 bg-emerald-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-emerald-400" />
              Weekly Nutrition Recap
            </CardTitle>
            <p className="text-xs text-muted-foreground font-medium">
              A summary of last week's macros, top foods, and your Hatchling's mood. Pick when (or whether) we send it.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-sm">Send me a weekly recap</p>
                <p className="text-xs text-muted-foreground font-medium">Delivered to your in-app notifications.</p>
              </div>
              <Switch checked={recapEnabled} onCheckedChange={setRecapEnabled} />
            </div>

            {recapEnabled && (
              <div className="border-t border-emerald-500/10 pt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="recap-day" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Day
                  </Label>
                  <select
                    id="recap-day"
                    value={recapDay}
                    onChange={(e) => setRecapDay(Number(e.target.value))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-medium"
                  >
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, i) => (
                      <option key={label} value={i}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recap-hour" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Local time
                  </Label>
                  <select
                    id="recap-hour"
                    value={recapHour}
                    onChange={(e) => setRecapHour(Number(e.target.value))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-medium"
                  >
                    {Array.from({ length: 24 }, (_, h) => {
                      const suffix = h < 12 ? "AM" : "PM";
                      const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
                      return <option key={h} value={h}>{display}:00 {suffix}</option>;
                    })}
                  </select>
                </div>
                <p className="col-span-2 text-[11px] text-muted-foreground italic">
                  Saved in your device's timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
                </p>
              </div>
            )}

            <div className="border-t border-emerald-500/10 pt-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm">Send a preview</p>
                  <p className="text-xs text-muted-foreground font-medium">
                    See exactly what your weekly recap will look like — no need to wait until {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][recapDay]}.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendRecapPreview}
                  disabled={recapPreviewSending}
                  className="shrink-0 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                >
                  {recapPreviewSending ? "Sending..." : "Send a preview"}
                </Button>
              </div>
              {recapPreview && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                  <p className="font-bold text-sm">{recapPreview.title}</p>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">{recapPreview.body}</p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground italic">
                Limited to one preview per hour.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* MFA / account security pointer */}
        <GlassCard interactive className="p-4">
          <a href="/user" className="relative z-10 flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-indigo-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Account & security</p>
              <p className="text-xs text-muted-foreground font-medium">
                Manage your password, two-factor authentication (MFA), connected devices, and account recovery.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </a>
        </GlassCard>

        {/* Block list link */}
        <GlassCard interactive className="p-4">
          <div className="relative z-10 flex items-center gap-3">
            <Ban className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Blocked Users</p>
              <p className="text-xs text-muted-foreground font-medium">View and manage your block list</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </GlassCard>

        {/* Safety Guidelines link */}
        <SafetyGuidelinesSheet
          trigger={
            <div className="flex items-center gap-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-colors">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-amber-300">Safety Guidelines</p>
                <p className="text-xs text-amber-300/70 font-medium">Public meetups, reporting tips, and more</p>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400/60 shrink-0" />
            </div>
          }
        />

        <NeonButton
          onClick={handleSave}
          disabled={saving || !loaded}
          size="lg"
          className="w-full"
        >
          {saving ? "Saving..." : "Save Privacy Settings"}
        </NeonButton>
      </div>
    </Layout>
  );
}
