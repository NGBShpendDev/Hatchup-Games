import { useState, useEffect } from "react";
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
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!playerId || loaded) return;
    fetch(`/api/players/${playerId}/privacy-settings`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setLocationVisibility(data.locationVisibility ?? "city");
        setRequireApproval(data.requireWorkoutApproval ?? false);
        setEmergencyName(data.emergencyContactName ?? "");
        setEmergencyPhone(data.emergencyContactPhone ?? "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [playerId]);

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
            {player && (player as { isVerified?: boolean }).isVerified ? (
              <Badge className="bg-blue-500 text-white font-black shrink-0">Verified ✓</Badge>
            ) : (
              <Button size="sm" variant="outline" className="shrink-0 text-xs font-bold border-blue-500/30 text-blue-400">
                Verify
              </Button>
            )}
          </CardContent>
        </Card>

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
