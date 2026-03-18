import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BarChart3, Settings, RefreshCw, Loader2, Info } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useLatestReports } from "@/hooks/useStrategicReports";
import { useReportPreferences } from "@/hooks/useReportPreferences";
import { ReportFrequencySection } from "@/components/reports/ReportFrequencySection";
import { ReportPreferencesModal } from "@/components/reports/ReportPreferencesModal";
import { ReportDetailModal } from "@/components/reports/ReportDetailModal";
import type { StrategicReport } from "@/types/reports";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Reports = () => {
  const navigate = useNavigate();
  const { data: userRole, isLoading: roleLoading } = useUserRole();

  // Modais
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<StrategicReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Data
  const { data: latestReports, isLoading: reportsLoading, refetch } = useLatestReports();
  const { data: preferences } = useReportPreferences();

  // Controle de acesso: apenas admin e supervisor
  useEffect(() => {
    if (!roleLoading && userRole === "agent") {
      navigate("/");
    }
  }, [userRole, roleLoading, navigate]);

  if (roleLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (userRole === "agent") return null;

  const handleReportClick = (report: StrategicReport) => {
    setSelectedReport(report);
    setDetailOpen(true);
  };

  const handleGenerateNow = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão inválida");

      const { error } = await supabase.functions.invoke("generate-strategic-reports", {
        body: { frequency: "daily" },
      });

      if (error) throw error;

      toast.success("Relatórios gerados com sucesso!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao gerar relatórios: " + (err?.message || "Erro desconhecido"));
    } finally {
      setGenerating(false);
    }
  };

  const hasPreferences =
    preferences?.active_types && preferences.active_types.length > 0;

  const daily = latestReports?.daily || [];
  const weekly = latestReports?.weekly || [];
  const monthly = latestReports?.monthly || [];
  const totalReports = daily.length + weekly.length + monthly.length;

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 md:w-8 md:h-8 text-primary" />
            Relatórios Estratégicos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Análises automáticas diárias, semanais e mensais
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Gerar agora (manual trigger) */}
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleGenerateNow}
            disabled={generating || !hasPreferences}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Gerar Agora</span>
          </Button>

          {/* Configurar preferências */}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setPreferencesOpen(true)}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Configurar</span>
          </Button>
        </div>
      </div>

      {/* Aviso de configuração inicial */}
      {!hasPreferences && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Nenhum relatório configurado
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              Clique em{" "}
              <button
                onClick={() => setPreferencesOpen(true)}
                className="font-semibold underline underline-offset-2"
              >
                Configurar
              </button>{" "}
              para selecionar quais relatórios deseja gerar automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {reportsLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-lg border bg-accent/30 animate-pulse" />
          ))}
        </div>
      ) : totalReports === 0 && hasPreferences ? (
        /* Estado vazio — configurado mas sem dados ainda */
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <BarChart3 className="w-14 h-14 text-muted-foreground/40" />
          <div>
            <p className="text-lg font-semibold">Nenhum relatório gerado ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              Os relatórios são gerados automaticamente todos os dias às 22h (horário de Brasília).
              <br />
              Clique em <strong>Gerar Agora</strong> para gerar os primeiros relatórios.
            </p>
          </div>
          <Button onClick={handleGenerateNow} disabled={generating}>
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Gerar Agora
          </Button>
        </div>
      ) : (
        /* Seções por frequência */
        <div className="space-y-4">
          <ReportFrequencySection
            frequency="daily"
            reports={daily}
            onReportClick={handleReportClick}
            defaultOpen={daily.length > 0}
          />
          <ReportFrequencySection
            frequency="weekly"
            reports={weekly}
            onReportClick={handleReportClick}
            defaultOpen={weekly.length > 0 && daily.length === 0}
          />
          <ReportFrequencySection
            frequency="monthly"
            reports={monthly}
            onReportClick={handleReportClick}
            defaultOpen={monthly.length > 0 && daily.length === 0 && weekly.length === 0}
          />
        </div>
      )}

      {/* Modais */}
      <ReportPreferencesModal
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
      />

      <ReportDetailModal
        report={selectedReport}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedReport(null);
        }}
      />
    </div>
  );
};

export default Reports;
