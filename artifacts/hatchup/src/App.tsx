import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Hatchlings from "@/pages/hatchlings";
import HatchlingDetail from "@/pages/hatchling-detail";
import Evolutions from "@/pages/evolutions";
import Compete from "@/pages/compete";
import Race from "@/pages/race";
import Leaderboard from "@/pages/leaderboard";
import Events from "@/pages/events";
import ClubHub from "@/pages/club";
import Hatch from "@/pages/hatch";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/hatchlings" component={Hatchlings} />
      <Route path="/hatchlings/:id" component={HatchlingDetail} />
      <Route path="/evolutions" component={Evolutions} />
      <Route path="/compete" component={Compete} />
      <Route path="/compete/race" component={Race} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/events" component={Events} />
      <Route path="/club" component={ClubHub} />
      <Route path="/hatch" component={Hatch} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
