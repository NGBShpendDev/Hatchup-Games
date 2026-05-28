import { Shield, MapPin, Eye, Phone, Flag, Lock, CheckCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "wouter";

interface SafetyGuidelinesSheetProps {
  trigger: React.ReactNode;
}

const GUIDELINES = [
  {
    icon: <MapPin className="w-5 h-5 text-amber-400" />,
    title: "Public Locations Only",
    desc: "Always meet workout partners in public places — gyms, parks, tracks, recreation centers, or sports facilities. Never meet strangers at private homes.",
  },
  {
    icon: <Eye className="w-5 h-5 text-blue-400" />,
    title: "Control Your Location",
    desc: "Use your privacy settings to set your location visibility. You can hide your exact location and show only your city or neighborhood.",
  },
  {
    icon: <CheckCircle className="w-5 h-5 text-green-400" />,
    title: "Approve Workout Requests",
    desc: "Enable manual approval for workout partner requests so you choose who can connect with you before meeting.",
  },
  {
    icon: <Phone className="w-5 h-5 text-purple-400" />,
    title: "Emergency Contact",
    desc: "Add an emergency contact in your privacy settings. Let someone you trust know when and where you're meeting.",
  },
  {
    icon: <Flag className="w-5 h-5 text-red-400" />,
    title: "Report Suspicious Behavior",
    desc: "Tap the three-dot menu on any profile or message to report suspicious, inappropriate, or concerning behavior immediately.",
  },
  {
    icon: <Lock className="w-5 h-5 text-pink-400" />,
    title: "Block & Protect Yourself",
    desc: "You can block any user at any time from their profile. Blocked users cannot see your posts, find your profile, or contact you.",
  },
];

const SAFE_LOCATIONS = [
  "Public gyms & fitness centers",
  "Parks & outdoor tracks",
  "Public basketball & sports courts",
  "Recreation centers",
  "Public running paths",
  "Organized fitness events",
];

export function SafetyGuidelinesSheet({ trigger }: SafetyGuidelinesSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="bg-card rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-2xl font-black">
            <Shield className="w-6 h-6 text-amber-400" />
            Safety Guidelines
          </SheetTitle>
          <p className="text-sm text-muted-foreground font-medium text-left">
            HatchUp is designed to be a safe, trusted, and family-friendly community.
          </p>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {GUIDELINES.map((g, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-2xl bg-background/50 border border-border/50">
              <div className="shrink-0 mt-0.5">{g.icon}</div>
              <div>
                <p className="font-bold text-sm">{g.title}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{g.desc}</p>
              </div>
            </div>
          ))}

          <div className="rounded-2xl bg-green-950/30 border border-green-500/20 p-4">
            <p className="font-black text-sm text-green-400 mb-2">Recommended Public Meetup Spots</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SAFE_LOCATIONS.map((loc, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-green-300/80 font-medium">
                  <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                  {loc}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-red-950/30 border border-red-500/20 p-4">
            <p className="font-black text-sm text-red-400 mb-1">Never Meet At</p>
            <p className="text-xs text-red-300/70 font-medium">Private homes, isolated areas, or anywhere you feel uncomfortable. Trust your instincts.</p>
          </div>

          <Link href="/settings/privacy">
            <div className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-primary/30 bg-primary/10 cursor-pointer hover:bg-primary/20 transition-colors">
              <Lock className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm text-primary">Manage Privacy Settings</span>
            </div>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
