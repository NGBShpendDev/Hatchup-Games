import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Explore from "@/pages/explore";
import Hatch from "@/pages/hatch";
import Training from "@/pages/training";
import Social from "@/pages/social";
import HatchlingDetail from "@/pages/hatchling-detail";
import Race from "@/pages/race";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/explore" component={Explore} />
      <Route path="/hatch" component={Hatch} />
      <Route path="/training" component={Training} />
      <Route path="/social" component={Social} />
      <Route path="/hatchlings/:id" component={HatchlingDetail} />
      <Route path="/compete/race" component={Race} />
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
