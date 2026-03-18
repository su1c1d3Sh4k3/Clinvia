import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Table, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StrategicReport } from "@/types/reports";
import { REPORT_TYPE_CONFIG } from "@/types/reports";
import * as XLSX from "xlsx";

interface ReportExportButtonsProps {
  report: StrategicReport;
  contentRef?: React.RefObject<HTMLDivElement | null>;
}

export function ReportExportButtons({ report, contentRef }: ReportExportButtonsProps) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const config = REPORT_TYPE_CONFIG[report.report_type];
  const filename = `relatorio-${report.report_type}-${report.frequency}-${report.period_start}`;

  const handleExportPDF = async () => {
    if (!contentRef?.current) {
      toast.error("Conteúdo não disponível para exportação");
      return;
    }

    setExportingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = contentRef.current;

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `${filename}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait" as const,
        },
      };

      await html2pdf().set(opt).from(element).save();
      toast.success("PDF exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast.error("Erro ao exportar PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Metrics summary
      const metricsData = Object.entries(report.data?.metrics || {}).map(
        ([key, value]) => ({
          Métrica: key,
          Valor: typeof value === "object" ? JSON.stringify(value) : value,
        })
      );
      const metricsSheet = XLSX.utils.json_to_sheet(metricsData);
      XLSX.utils.book_append_sheet(wb, metricsSheet, "Métricas");

      // Sheet 2: Breakdown
      const breakdown = report.data?.breakdown;
      if (Array.isArray(breakdown) && breakdown.length > 0) {
        const breakdownSheet = XLSX.utils.json_to_sheet(breakdown);
        XLSX.utils.book_append_sheet(wb, breakdownSheet, "Detalhamento");
      }

      // Sheet 3: Previous period metrics (for comparison)
      if (report.previous_data?.metrics) {
        const prevData = Object.entries(report.previous_data.metrics).map(
          ([key, value]) => ({
            Métrica: key,
            Valor: typeof value === "object" ? JSON.stringify(value) : value,
          })
        );
        const prevSheet = XLSX.utils.json_to_sheet(prevData);
        XLSX.utils.book_append_sheet(wb, prevSheet, "Período Anterior");
      }

      XLSX.writeFile(wb, `${filename}.xlsx`);
      toast.success("Excel exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar Excel:", error);
      toast.error("Erro ao exportar Excel. Verifique se a biblioteca xlsx está instalada.");
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportPDF}
        disabled={exportingPdf}
      >
        {exportingPdf ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <FileText className="w-4 h-4 mr-1.5" />
        )}
        PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportExcel}
        disabled={exportingExcel}
      >
        {exportingExcel ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <Table className="w-4 h-4 mr-1.5" />
        )}
        Excel
      </Button>
    </div>
  );
}
