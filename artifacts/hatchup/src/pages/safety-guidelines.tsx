import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  MapPin,
  Flag,
  Eye,
  Phone,
  Lock,
  CheckCircle,
  AlertTriangle,
  Users,
  Heart,
  ChevronLeft,
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";

const RULES = [
  {
    icon: <MapPin className="w-5 h-5 text-amber-400" />,
    title: "Always Meet in Public",
    body: "Meet in public locations only. Use caution when meeting new people. Always choose gyms, parks, recreation centers, or other well-populated public spaces. Never meet at a private residence.",
    color: "border-amber-500/20 bg-amber-500/5",
  },
  {
    icon: <Eye className="w-5 h-5 text-blue-400" />,
    title: "Control Your Location Privacy",
    body: "Your default location is set to 'City only'. You decide what detail is shared. Never share your exact home address with anyone you don't know personally.",
    color: "border-blue-500/20 bg-blue-500/5",
  },
  {
    icon: <Flag className="w-5 h-5 text-red-400" />,
    title: "Report Suspicious Behavior",
    body: "Report suspicious behavior immediately. If something feels wrong, trust your instincts and use the Report button on any profile, message, or post. Our moderation team reviews every report.",
    color: "border-red-500/20 bg-red-500/5",
  },
  {
    icon: <Lock className="w-5 h-5 text-purple-400" />,
    title: "Control Partner Requests",
    body: "Enable the 'Approve Workout Requests' toggle in Privacy Settings to manually review anyone who wants to join your group or add you as a workout partner.",
    color: "border-purple-500/20 bg-purple-500/5",
  },
  {
    icon: <Phone className="w-5 h-5 text-green-400" />,
    title: "Add an Emergency Contact",
    body: "Add an emergency contact name and phone number in Privacy Settings. This is displayed on your profile during live events so others know who to contact if something happens.",
    color: "border-green-500/20 bg-green-500/5",
  },
  {
    icon: <CheckCircle className="w-5 h-5 text-blue-400" />,
    title: "Get Verified",
    body: "Verify your profile with a photo + date stamp. Verified users receive a blue checkmark badge that builds trust with other community members.",
    color: "border-blue-500/20 bg-blue-500/5",
  },
  {
    icon: <Users className="w-5 h-5 text-pink-400" />,
    title: "Block Unwanted Contacts",
    body: "Block anyone who makes you uncomfortable. Blocked users cannot see your profile or contact you in any way. Access your block list in Privacy Settings.",
    color: "border-pink-500/20 bg-pink-500/5",
  },
  {
    icon: <Heart className="w-5 h-5 text-primary" />,
    title: "Be Respectful & Inclusive",
    body: "HatchUp is a safe, trusted, and family-friendly community. Harassment, hate speech, and inappropriate content are not tolerated and will result in account suspension.",
    color: "border-primary/20 bg-primary/5",
  },
];

const APPROVED_LOCATIONS = [
  "Public gyms and fitness centers",
  "Parks and outdoor recreation areas",
  "Community recreation centers",
  "Sports fields and tracks",
  "Yoga studios and group fitness classes",
  "Shopping mall common areas (daytime only)",
];

export default function SafetyGuidelines() {
  const [, navigate] = useLocation();

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="gap-1 text-muted-foreground"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="font-black text-2xl">Safety Guidelines</h1>
            <p className="text-sm text-muted-foreground font-medium">How to stay safe while using HatchUp</p>
          </div>
        </div>

        {/* Primary banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm text-amber-300">Meet in public locations only.</p>
            <p className="text-xs text-amber-300/80 font-medium mt-0.5">
              Always meet workout partners in public places like gyms, parks, or recreation centers.
            </p>
          </div>
        </div>

        {/* 8 Rules */}
        <div className="space-y-3">
          {RULES.map((rule, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className={`border ${rule.color}`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{rule.icon}</div>
                  <div className="min-w-0">
                    <p className="font-black text-sm mb-1">{rule.title}</p>
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed">{rule.body}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Approved meetup locations */}
        <Card className="border border-green-500/20 bg-green-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <MapPin className="w-4 h-4 text-green-400" />
              Approved Meetup Location Types
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {APPROVED_LOCATIONS.map((loc, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                {loc}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Tagline */}
        <div className="text-center space-y-2 pt-2">
          <Badge className="bg-primary/20 text-primary border-primary/30 font-black px-4 py-1.5">
            HatchUp is a safe, trusted, and family-friendly community.
          </Badge>
          <p className="text-xs text-muted-foreground font-medium">
            Questions or concerns? Use the Report button on any profile or contact our support team.
          </p>
        </div>
      </div>
    </Layout>
  );
}
