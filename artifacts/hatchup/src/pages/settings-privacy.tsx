import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

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
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyPhotoName, setVerifyPhotoName] = useState<string | null>(null);
  const todayLabel = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), []);

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
        <Card className="border border-blue-500/20 bg-blue-950/10">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Profile Verification</p>
              <p className="text-xs text-muted-foreground font-medium">Verified profiles earn more trust and unlock group features.</p>
            </div>
            {(player as { isVerified?: boolean } | null)?.isVerified ? (
              <Badge className="bg-blue-500 text-white font-black shrink-0">Verified ✓</Badge>
            ) : verifyPending ? (
              <Badge className="bg-amber-500 text-black font-black shrink-0 text-[10px]">Pending Review</Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-xs font-bold border-blue-500/30 text-blue-400"
                onClick={() => setVerifyOpen(true)}
              >
                Start Verification
              </Button>
            )}
          </CardContent>
        </Card>

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
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Location Visibility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
          </CardContent>
        </Card>

        {/* Workout Approval */}
        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
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
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card className="border border-green-500/20 bg-green-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-400" />
              Emergency Contact
            </CardTitle>
            <p className="text-xs text-muted-foreground font-medium">
              Displayed on your profile during live events so others know who to contact in an emergency.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>

        {/* Minor account / parental controls */}
        <Card className="border border-pink-500/20 bg-pink-950/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
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
          </CardContent>
        </Card>

        {/* MFA / account security pointer */}
        <Card className="border border-indigo-500/20 bg-indigo-950/10">
          <CardContent className="p-4">
            <a
              href="/user"
              className="flex items-center gap-3"
            >
              <KeyRound className="w-5 h-5 text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Account & security</p>
                <p className="text-xs text-muted-foreground font-medium">
                  Manage your password, two-factor authentication (MFA), connected devices, and account recovery.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </a>
          </CardContent>
        </Card>

        {/* Block list link */}
        <Card className="border border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Ban className="w-5 h-5 text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Blocked Users</p>
                <p className="text-xs text-muted-foreground font-medium">View and manage your block list</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>

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

        <Button
          onClick={handleSave}
          disabled={saving || !loaded}
          className="w-full h-12 font-black text-base bg-gradient-to-r from-primary to-purple-600"
        >
          {saving ? "Saving..." : "Save Privacy Settings"}
        </Button>
      </div>
    </Layout>
  );
}
