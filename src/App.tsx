import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ChangePasswordModal } from "@/components/auth/ChangePasswordModal";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import WhatsAppConnection from "./pages/WhatsAppConnection";
import Connections from "./pages/Connections";
import NotFound from "./pages/NotFound";
import InternalInbox from "./pages/InternalInbox";

import Queues from "./pages/Queues";
import QueuesManager from "./pages/QueuesManager";
import Tags from "./pages/Tags";
import Contacts from "./pages/Contacts";
import Patients from "./pages/Patients";
import Team from "./pages/Team";
import CRM from "./pages/CRM";
import Tasks from "./pages/Tasks";
import ProductsServices from "./pages/ProductsServices";
import Scheduling from "./pages/Scheduling";
import IAConfig from "./pages/IAConfig";
import Settings from "./pages/Settings";
import Financial from "./pages/Financial";
import Sales from "./pages/Sales";
import FollowUp from "./pages/FollowUp";
import Support from "./pages/Support";
import Admin from "./pages/Admin";
import AdminAuth from "./pages/AdminAuth";
import DevManager from "./pages/DevManager";
import { Layout } from "./components/Layout";
import { NotificationManager } from "./components/NotificationManager";
import { AutoFollowUpProcessor } from "./components/AutoFollowUpProcessor";
import { MobileMenuProvider } from "./contexts/MobileMenuContext";
import { TypingProvider } from "./contexts/TypingContext";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TypingProvider>
      <MobileMenuProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ChangePasswordModal />
            <ImpersonationBanner />
            <NotificationManager />
            <AutoFollowUpProcessor />
            <Routes>

              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/admin-oath" element={<AdminAuth />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/dev-manager" element={<DevManager />} />
              <Route element={<ErrorBoundary name="MainLayout"><Layout /></ErrorBoundary>}>
                <Route path="/" element={<Index />} />
                <Route path="/internal_inbox" element={<InternalInbox />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/whatsapp-connection" element={<Connections />} />
                <Route path="/queues" element={<Queues />} />
                <Route path="/queues_manager" element={<QueuesManager />} />
                <Route path="/tags" element={<Tags />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/patients" element={<Patients />} />
                <Route path="/team" element={<Team />} />
                <Route path="/crm" element={<CRM />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/products-services" element={<ProductsServices />} />
                <Route path="/scheduling" element={<Scheduling />} />
                <Route path="/ia-config" element={<IAConfig />} />
                <Route path="/financial" element={<Financial />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/follow-up" element={<FollowUp />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/support" element={<Support />} />
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
