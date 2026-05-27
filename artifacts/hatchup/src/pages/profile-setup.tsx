import { useState } from "react";
import { motion } from "framer-motion";
import { Egg, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlayer } from "@/lib/playerContext";
import { useUser } from "@clerk/react";

export default function ProfileSetup() {
  const { user } = useUser();
  const { createProfile } = usePlayer();

  const defaultName = user?.firstName ?? user?.username ?? "";
  const defaultUsername = defaultName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || `trainer_${Math.floor(Math.random() * 9999)}`;

  const [displayName, setDisplayName] = useState(defaultName);
  const [username, setUsername] = useState(defaultUsername);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) {
      setError("Both fields are required");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      setError("Username: 3-20 chars, lowercase letters, numbers, underscores only");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createProfile(username.trim(), displayName.trim());
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#050508] text-white flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#ff2d55] to-[#bf00ff] flex items-center justify-center mx-auto mb-4">
            <Egg size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black">Create Your Trainer Profile</h1>
          <p className="text-white/50 text-sm mt-1">Choose how you'll appear in HatchUp Fitness Pals</p>
        </div>

        {/* Sparkles */}
        <div className="bg-gradient-to-r from-[#ff2d55]/10 to-[#bf00ff]/10 border border-white/10 rounded-2xl p-1 mb-6">
          <div className="flex items-center gap-2 px-3 py-2">
            <Sparkles size={14} className="text-[#ff2d55]" />
            <span className="text-xs text-white/60">Your first Pal is waiting — just pick your name!</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Dragon Master"
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30 focus:border-[#ff2d55]"
              maxLength={30}
            />
            <p className="text-xs text-white/40 mt-1">This is your public name shown on the leaderboard</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="dragon_master"
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 focus:border-[#ff2d55] pl-7"
                maxLength={20}
              />
            </div>
            <p className="text-xs text-white/40 mt-1">3–20 chars, lowercase, letters/numbers/underscores</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white border-0 hover:opacity-90 font-bold h-11"
          >
            {loading ? "Creating your profile..." : "Start Your Fitness Pals Journey →"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
