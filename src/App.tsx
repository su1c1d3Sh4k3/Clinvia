import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import WhatsAppConnection from "./pages/WhatsAppConnection";
import Connections from "./pages/Connections";
import NotFound from "./pages/NotFound";

import Queues from "./pages/Queues";
import Tags from "./pages/Tags";
import Contacts from "./pages/Contacts";
import Team from "./pages/Team";
import CRM from "./pages/CRM";
import Tasks from "./pages/Tasks";
import ProductsServices from "./pages/ProductsServices";
import Scheduling from "./pages/Scheduling";
import IAConfig from "./pages/IAConfig";
import Settings from "./pages/Settings";
import Financial from "./pages/Financial";
import FollowUp from "./pages/FollowUp";
import Admin from "./pages/Admin";
import AdminAuth from "./pages/AdminAuth";
import { Layout } from "./components/Layout";
import { NotificationManager } from "./components/NotificationManager";
import { AutoFollowUpProcessor } from "./components/AutoFollowUpProcessor";
import { MobileMenuProvider } from "./contexts/MobileMenuContext";
import { TypingProvider } from "./contexts/TypingContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TypingProvider>
      <MobileMenuProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <NotificationManager />
            <AutoFollowUpProcessor />
            <Routes>

              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/admin-oath" element={<AdminAuth />} />
              <Route path="/admin" element={<Admin />} />
              <Route element={<Layout />}>
                <Route path="/" element={<Index />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/whatsapp-connection" element={<Connections />} />
                <Route path="/queues" element={<Queues />} />
                <Route path="/tags" element={<Tags />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/team" element={<Team />} />
                <Route path="/crm" element={<CRM />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/products-services" element={<ProductsServices />} />
                <Route path="/scheduling" element={<Scheduling />} />
                <Route path="/ia-config" element={<IAConfig />} />
                <Route path="/financial" element={<Financial />} />
                <Route path="/follow-up" element={<FollowUp />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </MobileMenuProvider>
    </TypingProvider>
  </QueryClientProvider>
);

export default App;
