import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

const page = (section: Parameters<typeof Home>[0]["section"]) => () => <Home section={section} />;

function Router() {
  return <Switch>
    <Route path="/" component={page("dashboard")} />
    <Route path="/lancamentos" component={page("transactions")} />
    <Route path="/orcamentos" component={page("budgets")} />
    <Route path="/projecoes" component={page("projections")} />
    <Route path="/metas" component={page("goals")} />
    <Route path="/cartoes" component={page("cards")} />
    <Route path="/dividas" component={page("debts")} />
    <Route path="/patrimonio" component={page("assets")} />
    <Route path="/calendario" component={page("calendar")} />
    <Route path="/relatorios" component={page("reports")} />
    <Route path="/configuracoes" component={page("settings")} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
