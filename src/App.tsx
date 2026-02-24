import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ChangePasswordModal } from "@/components/auth/ChangePasswordModal";
import { Layout } from "./components/Layout";
import { NotificationManager } from "./components/NotificationManager";
import { AutoFollowUpProcessor } from "./components/AutoFollowUpProcessor";
import { MobileMenuProvider } from "./contexts/MobileMenuContext";
import { TypingProvider } from "./contexts/TypingContext";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";

// ============================================
// LAZY LOADING — Code Splitting por página
// Cada página é carregada sob demanda (reduz bundle inicial em ~50%)
// ============================================
const Index = React.lazy(() => import("./pages/Index"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Auth = React.lazy(() => import("./pages/Auth"));
const Connections = React.lazy(() => import("./pages/Connections"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const InternalInbox = React.lazy(() => import("./pages/InternalInbox"));
const Queues = React.lazy(() => import("./pages/Queues"));
const QueuesManager = React.lazy(() => import("./pages/QueuesManager"));
const Tags = React.lazy(() => import("./pages/Tags"));
const Contacts = React.lazy(() => import("./pages/Contacts"));
const Patients = React.lazy(() => import("./pages/Patients"));
const Team = React.lazy(() => import("./pages/Team"));
const CRM = React.lazy(() => import("./pages/CRM"));
const Tasks = React.lazy(() => import("./pages/Tasks"));
const ProductsServices = React.lazy(() => import("./pages/ProductsServices"));
const Scheduling = React.lazy(() => import("./pages/Scheduling"));
const IAConfig = React.lazy(() => import("./pages/IAConfig"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Financial = React.lazy(() => import("./pages/Financial"));
const Sales = React.lazy(() => import("./pages/Sales"));
const FollowUp = React.lazy(() => import("./pages/FollowUp"));
const Support = React.lazy(() => import("./pages/Support"));
const Admin = React.lazy(() => import("./pages/Admin"));
const AdminAuth = React.lazy(() => import("./pages/AdminAuth"));
const DevManager = React.lazy(() => import("./pages/DevManager"));

// Fallback de loading enquanto o chunk da página carrega
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">Carregando...</span>
    </div>
  </div>
);

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
            <Suspense fallback={<PageLoader />}>
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
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </MobileMenuProvider>
    </TypingProvider>
  </QueryClientProvider>
);

export default App;
