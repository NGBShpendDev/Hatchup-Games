import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlayerProvider, usePlayer } from "@/lib/playerContext";

import Landing from "@/pages/landing";
import ProfileSetup from "@/pages/profile-setup";
import Home from "@/pages/home";
import Explore from "@/pages/explore";
import Hatch from "@/pages/hatch";
import Training from "@/pages/training";
import Social from "@/pages/social";
import HatchlingDetail from "@/pages/hatchling-detail";
import Race from "@/pages/race";
import HealthSettings from "@/pages/health-settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#ff2d55",
    colorForeground: "#ffffff",
    colorMutedForeground: "#a0a0b0",
    colorDanger: "#ff4444",
    colorBackground: "#0d0d14",
    colorInput: "#1a1a2e",
    colorInputForeground: "#ffffff",
    colorNeutral: "#2a2a3e",
    fontFamily: "system-ui, -apple-system, sans-serif",
    borderRadius: "12px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#0d0d14] rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-black",
    headerSubtitle: "text-white/50",
    socialButtonsBlockButtonText: "text-white font-medium",
    formFieldLabel: "text-white/70 text-sm",
    footerActionLink: "text-[#ff2d55] hover:text-[#ff2d55]/80",
    footerActionText: "text-white/50",
    dividerText: "text-white/30",
    identityPreviewEditButton: "text-[#ff2d55]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-red-400",
    logoBox: "flex justify-center py-2",
    logoImage: "h-8",
    socialButtonsBlockButton: "border border-white/10 bg-white/5 hover:bg-white/10",
    formButtonPrimary: "bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white hover:opacity-90",
    formFieldInput: "bg-[#1a1a2e] border-white/20 text-white",
    footerAction: "border-t border-white/10",
    dividerLine: "bg-white/10",
    alert: "bg-red-500/10 border border-red-500/20",
    otpCodeFieldInput: "bg-[#1a1a2e] border-white/20 text-white",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#050508] px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#050508] px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function PassiveXpNudge() {
  const { player, acknowledgePassiveXp } = usePlayer();
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (!player || hasShownRef.current) return;
    const passiveXp = player.passiveXpSinceLastVisit ?? 0;
    if (passiveXp > 0) {
      hasShownRef.current = true;
      const toastContainer = document.getElementById("passive-xp-toast");
      if (toastContainer) {
        toastContainer.setAttribute("data-xp", String(passiveXp));
        toastContainer.setAttribute("data-show", "true");
      }
      setTimeout(() => {
        acknowledgePassiveXp();
      }, 6000);
    }
  }, [player?.id]);

  return null;
}

function PassiveXpBanner() {
  const [xp, setXp] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      const el = document.getElementById("passive-xp-toast");
      if (el?.getAttribute("data-show") === "true") {
        const xpVal = Number(el.getAttribute("data-xp") ?? 0);
        setXp(xpVal);
        setVisible(true);
        el.removeAttribute("data-show");
      }
    };
    const interval = setInterval(check, 200);
    return () => clearInterval(interval);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-gradient-to-r from-violet-600 to-pink-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-500 max-w-xs w-[calc(100%-2rem)]"
      onClick={() => setVisible(false)}
    >
      <span className="text-xl">⚡</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm leading-tight">Your Pals grew while you were away!</p>
        <p className="text-xs text-white/80">+{xp} XP earned from background sync</p>
      </div>
      <button className="text-white/60 hover:text-white text-lg leading-none flex-shrink-0" onClick={() => setVisible(false)}>×</button>
    </div>
  );
}

function AppRoutes() {
  const { player, isLoading, needsProfile } = usePlayer();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#050508] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[#ff2d55] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (needsProfile) {
    return <ProfileSetup />;
  }

  return (
    <>
      <div id="passive-xp-toast" className="hidden" aria-hidden="true" />
      <PassiveXpBanner />
      <PassiveXpNudge />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/explore" component={Explore} />
        <Route path="/hatch" component={Hatch} />
        <Route path="/training" component={Training} />
        <Route path="/social" component={Social} />
        <Route path="/health-settings" component={HealthSettings} />
        <Route path="/hatchlings/:id" component={HatchlingDetail} />
        <Route path="/compete/race" component={Race} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <PlayerProvider>
          <AppRoutes />
        </PlayerProvider>
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back to HatchUp Fitness Pals",
            subtitle: "Sign in to continue your fitness journey",
          },
        },
        signUp: {
          start: {
            title: "Join HatchUp Fitness Pals",
            subtitle: "Every step you take hatches something amazing",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={HomeRedirect} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
