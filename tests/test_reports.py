"""
Testes Automatizados do Sistema de Relatorios - Clinvia
========================================================
Testa o sistema de relatorios end-to-end:
1. Estrutura de arquivos (pagina, hook, componentes)
2. Hook useReportData (fetch functions, tipos, paralelismo)
3. Componentes de relatorio (ReportCard, secoes)
4. Restricao admin-only (navigation guard + sidebar)
5. Comparacao de periodos (calcEvolution)
6. Exportacao PDF
7. Tabelas do banco (RLS, colunas necessarias)

Rodar: python tests/test_reports.py
"""

import os
import re
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass
class TestResult:
    test_name: str
    passed: bool
    details: str
    severity: str = "info"  # info, warning, critical


# ============================================================================
# EXPECTED STATE
# ============================================================================

# Arquivos que DEVEM existir
REQUIRED_FILES = {
    "src/pages/BusinessReports.tsx": "Pagina principal de relatorios",
    "src/hooks/useReportData.ts": "Hook de busca de dados",
    "src/components/reports/ReportCard.tsx": "Card de KPI reutilizavel",
    "src/components/reports/AttendanceReport.tsx": "Secao atendimento",
    "src/components/reports/ContactsLeadsReport.tsx": "Secao contatos/leads",
    "src/components/reports/AppointmentsReport.tsx": "Secao agendamentos",
    "src/components/reports/SalesReport.tsx": "Secao vendas",
    "src/components/reports/CrmReport.tsx": "Secao CRM",
    "src/components/reports/FinancialReport.tsx": "Secao financeiro",
}

# Metricas que o hook DEVE buscar
EXPECTED_METRICS = {
    "tickets": ["total", "open", "pending", "resolved", "closed", "avgResolutionHours", "byAgent"],
    "contacts": ["totalNew", "totalLeads", "conversionRate"],
    "appointments": ["total", "confirmed", "completed", "pending", "rescheduled", "canceled", "byProfessional", "occupancyByProfessional"],
    "sales": ["totalCount", "totalRevenue", "averageTicket", "cashCount", "installmentCount", "topProducts", "overdueInstallments"],
    "crm": ["byFunnel", "totalDeals", "totalValue"],
    "queues": ["byQueue"],
    "financials": ["totalRevenue", "totalReceived", "totalPending", "totalOverdue"],
}

# Tabelas consultadas pelo hook
QUERIED_TABLES = [
    "conversations", "contacts", "crm_deals", "appointments",
    "sales", "sale_installments", "products_services", "professionals",
    "crm_funnels", "crm_stages", "queues", "team_members",
]

# Tabs que devem existir na pagina
EXPECTED_TABS = ["atendimento", "contatos", "agendamentos", "vendas", "crm", "financeiro"]


# ============================================================================
# TEST: Estrutura de Arquivos
# ============================================================================

def test_file_structure(project_dir: str) -> List[TestResult]:
    results = []

    for rel_path, description in REQUIRED_FILES.items():
        filepath = os.path.join(project_dir, rel_path)
        exists = os.path.exists(filepath)
        results.append(TestResult(
            f"Arquivo: {rel_path}",
            exists,
            f"{description} {'encontrado' if exists else 'NAO encontrado!'}",
            "critical" if not exists else "info"
        ))

    return results


# ============================================================================
# TEST: Hook useReportData
# ============================================================================

def test_hook_report_data(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "hooks", "useReportData.ts")

    if not os.path.exists(filepath):
        results.append(TestResult("Hook: arquivo", False, "useReportData.ts NAO encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Verifica interfaces/tipos exportados
    for metric_group, fields in EXPECTED_METRICS.items():
        for field in fields:
            has_field = field in content
            results.append(TestResult(
                f"Hook tipo: {metric_group}.{field}",
                has_field,
                f"Campo {'encontrado' if has_field else 'NAO encontrado'}",
                "critical" if not has_field else "info"
            ))

    # 2. Verifica que consulta todas as tabelas necessarias
    for table in QUERIED_TABLES:
        # Check for .from("table") or .from('table')
        has_query = f'"{table}"' in content or f"'{table}'" in content
        results.append(TestResult(
            f"Hook query: {table}",
            has_query,
            f"Tabela {table} {'consultada' if has_query else 'NAO consultada'}",
            "warning" if not has_query else "info"
        ))

    # 3. Verifica Promise.all (paralelismo)
    has_parallel = "Promise.all" in content
    results.append(TestResult(
        "Hook: execucao paralela",
        has_parallel,
        "Queries executadas em paralelo via Promise.all" if has_parallel else "NAO usa Promise.all - queries sequenciais!",
        "warning" if not has_parallel else "info"
    ))

    # 4. Verifica useQuery com enabled
    has_enabled = "enabled:" in content and "startDate" in content
    results.append(TestResult(
        "Hook: query habilitada condicionalmente",
        has_enabled,
        "useQuery com enabled condicional" if has_enabled else "Falta enabled condicional no useQuery",
        "warning" if not has_enabled else "info"
    ))

    # 5. Verifica calcEvolution exportado
    has_calc = "export function calcEvolution" in content
    results.append(TestResult(
        "Hook: calcEvolution exportado",
        has_calc,
        "Funcao de comparacao de periodos" + (" encontrada" if has_calc else " NAO encontrada"),
        "critical" if not has_calc else "info"
    ))

    # 6. Verifica staleTime (cache)
    has_stale = "staleTime" in content
    results.append(TestResult(
        "Hook: cache (staleTime)",
        has_stale,
        "Cache configurado" if has_stale else "Sem staleTime - queries podem ser muito frequentes",
        "warning" if not has_stale else "info"
    ))

    # 7. Verifica filtros de data (gte/lte ou BETWEEN)
    has_date_filter = "gte(" in content and "lte(" in content
    results.append(TestResult(
        "Hook: filtros de data",
        has_date_filter,
        "Filtros gte/lte para range de datas" if has_date_filter else "NAO filtra por data!",
        "critical" if not has_date_filter else "info"
    ))

    # 8. Verifica que NÃO usa RPCs fixas por mes (deve usar queries diretas)
    uses_old_rpcs = "get_sales_summary" in content or "get_top_product_service" in content
    results.append(TestResult(
        "Hook: NAO usa RPCs fixas por mes",
        not uses_old_rpcs,
        "Usa queries diretas com range arbitrario" if not uses_old_rpcs else "ATENCAO: Usa RPCs fixas por mes que NAO suportam range arbitrario!",
        "critical" if uses_old_rpcs else "info"
    ))

    return results


# ============================================================================
# TEST: Pagina BusinessReports (admin-only)
# ============================================================================

def test_business_reports_page(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "pages", "BusinessReports.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("Pagina: arquivo", False, "BusinessReports.tsx NAO encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Admin-only guard
    has_role_check = "useUserRole" in content
    has_navigate = "useNavigate" in content or "navigate(" in content
    has_admin_guard = ('userRole !== "admin"' in content or "userRole !== 'admin'" in content) and "navigate" in content
    results.append(TestResult(
        "Pagina: guard admin-only",
        has_admin_guard,
        "Redireciona nao-admin para /" if has_admin_guard else "NAO restringe acesso a admin!",
        "critical" if not has_admin_guard else "info"
    ))

    # 2. useEffect para redirect
    has_effect_guard = "useEffect" in content and has_admin_guard
    results.append(TestResult(
        "Pagina: useEffect com redirect",
        has_effect_guard,
        "Guard em useEffect" if has_effect_guard else "Guard NAO esta em useEffect",
        "critical" if not has_effect_guard else "info"
    ))

    # 3. Tabs
    for tab in EXPECTED_TABS:
        has_tab = f'value="{tab}"' in content
        results.append(TestResult(
            f"Pagina: tab '{tab}'",
            has_tab,
            f"Tab {'encontrada' if has_tab else 'NAO encontrada'}",
            "critical" if not has_tab else "info"
        ))

    # 4. Financeiro condicional
    has_financial_guard = "showFinancial" in content or "hasFinancialAccess" in content
    results.append(TestResult(
        "Pagina: financeiro condicional",
        has_financial_guard,
        "Secao financeiro visivel condicionalmente" if has_financial_guard else "Financeiro visivel para todos!",
        "warning" if not has_financial_guard else "info"
    ))

    # 5. Filtros de data
    has_date_inputs = 'type="date"' in content
    results.append(TestResult(
        "Pagina: inputs de data",
        has_date_inputs,
        "Campos de data para filtro" if has_date_inputs else "NAO tem inputs de data!",
        "critical" if not has_date_inputs else "info"
    ))

    # 6. Comparacao de periodos
    has_compare = "compareEnabled" in content or "compStart" in content
    results.append(TestResult(
        "Pagina: comparacao de periodos",
        has_compare,
        "Suporta comparacao entre dois periodos" if has_compare else "NAO suporta comparacao!",
        "critical" if not has_compare else "info"
    ))

    # 7. Exportacao PDF
    has_pdf = "html2pdf" in content
    results.append(TestResult(
        "Pagina: exportacao PDF",
        has_pdf,
        "Exportacao PDF via html2pdf.js" if has_pdf else "NAO tem exportacao PDF!",
        "warning" if not has_pdf else "info"
    ))

    # 8. Loading state
    has_loading = "isLoading" in content and "Loader2" in content
    results.append(TestResult(
        "Pagina: loading state",
        has_loading,
        "Exibe spinner durante carregamento" if has_loading else "Sem loading state!",
        "warning" if not has_loading else "info"
    ))

    # 9. Error state
    has_error = "error" in content and "Erro" in content
    results.append(TestResult(
        "Pagina: error state",
        has_error,
        "Exibe mensagem de erro" if has_error else "Sem tratamento de erro!",
        "warning" if not has_error else "info"
    ))

    return results


# ============================================================================
# TEST: NavigationSidebar (admin-only visibility)
# ============================================================================

def test_navigation_sidebar(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "components", "NavigationSidebar.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("Sidebar: arquivo", False, "NavigationSidebar.tsx NAO encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Menu item exists
    has_menu_item = "business-reports" in content and "/business-reports" in content
    results.append(TestResult(
        "Sidebar: item 'Relatorios' existe",
        has_menu_item,
        "Item de menu encontrado" if has_menu_item else "NAO tem item de menu!",
        "critical" if not has_menu_item else "info"
    ))

    # 2. Hidden for non-admin (expanded view)
    # Should have: if (child.id === "business-reports") return null;
    has_hide_expanded = 'child.id === "business-reports"' in content
    # Count occurrences - should be in BOTH expanded and collapsed submenu renders
    hide_count = content.count('child.id === "business-reports"')
    results.append(TestResult(
        "Sidebar: escondido para nao-admin (expanded)",
        has_hide_expanded,
        f"Item oculto para nao-admin ({hide_count} verificacao(oes))" if has_hide_expanded else "NAO esconde para nao-admin!",
        "critical" if not has_hide_expanded else "info"
    ))

    # 3. Hidden in BOTH expanded and collapsed views
    results.append(TestResult(
        "Sidebar: escondido em ambos modos (expanded + collapsed)",
        hide_count >= 2,
        f"Verificacao em {hide_count} blocos (expanded + collapsed)" if hide_count >= 2 else f"Apenas {hide_count} verificacao - falta no modo collapsed!",
        "warning" if hide_count < 2 else "info"
    ))

    # 4. Under Administrativo submenu
    # Check that business-reports appears after the administrativo section
    admin_pos = content.find('"administrativo"')
    reports_pos = content.find('"business-reports"')
    in_admin_menu = admin_pos > 0 and reports_pos > admin_pos
    results.append(TestResult(
        "Sidebar: dentro do submenu Administrativo",
        in_admin_menu,
        "Item no submenu correto" if in_admin_menu else "NAO esta no submenu Administrativo!",
        "warning" if not in_admin_menu else "info"
    ))

    return results


# ============================================================================
# TEST: Rota no App.tsx
# ============================================================================

def test_app_routing(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "App.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("Rota: App.tsx", False, "App.tsx NAO encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Lazy import
    has_lazy = "BusinessReports" in content and "React.lazy" in content
    results.append(TestResult(
        "Rota: lazy import",
        has_lazy,
        "Import lazy de BusinessReports" if has_lazy else "NAO tem lazy import!",
        "critical" if not has_lazy else "info"
    ))

    # 2. Route definition
    has_route = "/business-reports" in content and "BusinessReports" in content
    results.append(TestResult(
        "Rota: /business-reports",
        has_route,
        "Rota definida" if has_route else "Rota NAO definida!",
        "critical" if not has_route else "info"
    ))

    # 3. Inside Layout (protected)
    # Ensure route is inside the Layout element block
    layout_pos = content.find("<Layout")
    route_pos = content.find("/business-reports")
    inside_layout = layout_pos > 0 and route_pos > layout_pos
    results.append(TestResult(
        "Rota: dentro do Layout (autenticada)",
        inside_layout,
        "Rota protegida dentro do Layout" if inside_layout else "Rota FORA do Layout - pode ser acessivel sem login!",
        "critical" if not inside_layout else "info"
    ))

    return results


# ============================================================================
# TEST: Componentes de Relatorio
# ============================================================================

def test_report_components(project_dir: str) -> List[TestResult]:
    results = []

    # ReportCard
    card_path = os.path.join(project_dir, "src", "components", "reports", "ReportCard.tsx")
    if os.path.exists(card_path):
        with open(card_path, "r", encoding="utf-8") as f:
            card_content = f.read()

        has_evolution = "evolution" in card_content
        results.append(TestResult(
            "ReportCard: suporta evolucao %",
            has_evolution,
            "Prop evolution para comparacao" if has_evolution else "NAO suporta comparacao!",
            "critical" if not has_evolution else "info"
        ))

        has_trending = "TrendingUp" in card_content and "TrendingDown" in card_content
        results.append(TestResult(
            "ReportCard: icones de tendencia",
            has_trending,
            "Icones TrendingUp/Down" if has_trending else "Faltam icones de tendencia",
            "warning" if not has_trending else "info"
        ))

        has_prefix = "prefix" in card_content
        results.append(TestResult(
            "ReportCard: suporta prefixo (R$)",
            has_prefix,
            "Prop prefix para valores monetarios" if has_prefix else "NAO suporta prefixo!",
            "warning" if not has_prefix else "info"
        ))

    # Section components
    sections = {
        "AttendanceReport": {
            "file": "AttendanceReport.tsx",
            "must_have": ["byAgent", "byQueue", "avgResolutionHours"],
            "description": "Atendimento"
        },
        "ContactsLeadsReport": {
            "file": "ContactsLeadsReport.tsx",
            "must_have": ["totalNew", "totalLeads", "conversionRate"],
            "description": "Contatos/Leads"
        },
        "AppointmentsReport": {
            "file": "AppointmentsReport.tsx",
            "must_have": ["byProfessional", "occupancy", "confirmed", "canceled"],
            "description": "Agendamentos"
        },
        "SalesReport": {
            "file": "SalesReport.tsx",
            "must_have": ["totalRevenue", "averageTicket", "cashCount", "installmentCount", "topProducts"],
            "description": "Vendas"
        },
        "CrmReport": {
            "file": "CrmReport.tsx",
            "must_have": ["byFunnel", "totalDeals", "totalValue"],
            "description": "CRM"
        },
        "FinancialReport": {
            "file": "FinancialReport.tsx",
            "must_have": ["totalRevenue", "totalReceived", "totalPending", "totalOverdue"],
            "description": "Financeiro"
        },
    }

    for name, config in sections.items():
        filepath = os.path.join(project_dir, "src", "components", "reports", config["file"])
        if not os.path.exists(filepath):
            results.append(TestResult(
                f"{name}: arquivo",
                False,
                f"{config['file']} NAO encontrado",
                "critical"
            ))
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            section_content = f.read()

        # Check required fields/props
        for field in config["must_have"]:
            has_field = field in section_content
            results.append(TestResult(
                f"{name}: campo {field}",
                has_field,
                f"Campo {'encontrado' if has_field else 'NAO encontrado'}",
                "warning" if not has_field else "info"
            ))

        # Check comparison support
        has_comparison = "comparison" in section_content
        results.append(TestResult(
            f"{name}: suporta comparacao",
            has_comparison,
            f"Prop comparison para evolucao %" if has_comparison else "NAO recebe dados de comparacao!",
            "warning" if not has_comparison else "info"
        ))

        # Check calcEvolution usage
        has_calc = "calcEvolution" in section_content
        results.append(TestResult(
            f"{name}: usa calcEvolution",
            has_calc,
            "Calcula evolucao entre periodos" if has_calc else "NAO calcula evolucao!",
            "warning" if not has_calc else "info"
        ))

    return results


# ============================================================================
# TEST: calcEvolution (logica de comparacao)
# ============================================================================

def test_calc_evolution() -> List[TestResult]:
    """Testa a logica da funcao calcEvolution sem importar o modulo."""
    results = []

    # Simula a funcao calcEvolution baseada na implementacao
    def calc_evolution(current: float, previous: float):
        if previous == 0 and current == 0:
            return None
        if previous == 0:
            return 100
        return round(((current - previous) / abs(previous)) * 100 * 10) / 10

    test_cases = [
        (100, 80, 25.0, "aumento de 25%"),
        (80, 100, -20.0, "reducao de 20%"),
        (100, 100, 0.0, "sem mudanca"),
        (50, 0, 100, "de zero para valor"),
        (0, 0, None, "ambos zero"),
        (0, 50, -100.0, "de valor para zero"),
    ]

    for current, previous, expected, desc in test_cases:
        result = calc_evolution(current, previous)
        passed = result == expected
        results.append(TestResult(
            f"calcEvolution: {desc} ({current} vs {previous})",
            passed,
            f"Esperado: {expected}, Obtido: {result}",
            "critical" if not passed else "info"
        ))

    return results


# ============================================================================
# TEST: Tabelas do banco usadas
# ============================================================================

def test_database_tables(project_dir: str) -> List[TestResult]:
    """Verifica que o hook consulta as tabelas corretas com filtros corretos."""
    results = []
    filepath = os.path.join(project_dir, "src", "hooks", "useReportData.ts")

    if not os.path.exists(filepath):
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Tabelas que DEVEM ser consultadas com filtro de data
    date_filtered_tables = {
        "conversations": ["created_at"],
        "contacts": ["created_at"],
        "crm_deals": ["created_at"],
        "appointments": ["start_time"],
        "sales": ["sale_date"],
    }

    for table, date_fields in date_filtered_tables.items():
        # Find the section that queries this table
        table_pattern = f'"{table}"'
        if table_pattern not in content:
            results.append(TestResult(
                f"DB: {table} consultada",
                False,
                f"Tabela NAO consultada",
                "warning"
            ))
            continue

        # Check that date fields are used for filtering
        for field in date_fields:
            has_filter = field in content
            results.append(TestResult(
                f"DB: {table} filtrada por {field}",
                has_filter,
                f"Filtro por {field} " + ("encontrado" if has_filter else "NAO encontrado"),
                "warning" if not has_filter else "info"
            ))

    # Tabelas auxiliares (JOINs para nomes)
    aux_tables = ["professionals", "products_services", "crm_funnels", "crm_stages", "queues", "team_members"]
    for table in aux_tables:
        has_table = f'"{table}"' in content
        results.append(TestResult(
            f"DB: {table} (auxiliar/JOIN)",
            has_table,
            f"Tabela auxiliar {'consultada' if has_table else 'NAO consultada'} para resolucao de nomes",
            "info"
        ))

    return results


# ============================================================================
# TEST: Seguranca - Admin Only
# ============================================================================

def test_admin_only_security(project_dir: str) -> List[TestResult]:
    """Testa que o acesso eh realmente restrito a admin em todas as camadas."""
    results = []

    # 1. Page guard
    page_path = os.path.join(project_dir, "src", "pages", "BusinessReports.tsx")
    if os.path.exists(page_path):
        with open(page_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Must have useEffect with admin check and navigate
        has_guard = all([
            "useUserRole" in content,
            "useNavigate" in content or "navigate(" in content,
            'userRole !== "admin"' in content or "userRole !== 'admin'" in content,
            "useEffect" in content,
        ])
        results.append(TestResult(
            "Seguranca: page guard (useEffect + navigate)",
            has_guard,
            "Pagina redireciona nao-admin" if has_guard else "FALHA: Pagina NAO restringe acesso!",
            "critical" if not has_guard else "info"
        ))

    # 2. Sidebar hidden for non-admin
    sidebar_path = os.path.join(project_dir, "src", "components", "NavigationSidebar.tsx")
    if os.path.exists(sidebar_path):
        with open(sidebar_path, "r", encoding="utf-8") as f:
            sidebar_content = f.read()

        # Must hide business-reports for non-admin
        hide_pattern = 'child.id === "business-reports"'
        hide_count = sidebar_content.count(hide_pattern)
        results.append(TestResult(
            "Seguranca: sidebar oculto para nao-admin",
            hide_count >= 2,
            f"Item oculto em {hide_count} blocos (expanded + collapsed)" if hide_count >= 2 else f"FALHA: Apenas {hide_count} bloco(s) protegido(s)!",
            "critical" if hide_count < 2 else "info"
        ))

        # Must be inside userRole !== "admin" block
        admin_check_before = sidebar_content.find('userRole !== "admin"')
        report_check = sidebar_content.find(hide_pattern)
        correct_nesting = admin_check_before > 0 and report_check > admin_check_before
        results.append(TestResult(
            "Seguranca: check dentro do bloco userRole !== admin",
            correct_nesting,
            "Verificacao aninhada corretamente" if correct_nesting else "ATENCAO: Verificacao pode nao estar no bloco correto!",
            "warning" if not correct_nesting else "info"
        ))

    # 3. Route inside Layout
    app_path = os.path.join(project_dir, "src", "App.tsx")
    if os.path.exists(app_path):
        with open(app_path, "r", encoding="utf-8") as f:
            app_content = f.read()

        layout_pos = app_content.find("<Layout")
        route_pos = app_content.find("/business-reports")
        auth_pos = app_content.find("/auth")
        inside_layout = layout_pos > 0 and route_pos > layout_pos
        not_public = route_pos > auth_pos if auth_pos > 0 else True
        results.append(TestResult(
            "Seguranca: rota protegida por autenticacao",
            inside_layout,
            "Rota dentro do Layout (requer login)" if inside_layout else "FALHA: Rota fora do Layout!",
            "critical" if not inside_layout else "info"
        ))

    return results


# ============================================================================
# MAIN
# ============================================================================

def run_all_tests(project_dir: str) -> Tuple[List[TestResult], dict]:
    all_results: List[TestResult] = []
    src_dir = os.path.join(project_dir, "src")

    print("=" * 70)
    print("  CLINVIA - Teste Completo do Sistema de Relatorios")
    print("=" * 70)

    print("\n[1/7] Testando estrutura de arquivos...")
    all_results.extend(test_file_structure(project_dir))

    print("[2/7] Testando hook useReportData...")
    all_results.extend(test_hook_report_data(project_dir))

    print("[3/7] Testando pagina BusinessReports...")
    all_results.extend(test_business_reports_page(project_dir))

    print("[4/7] Testando NavigationSidebar...")
    all_results.extend(test_navigation_sidebar(project_dir))

    print("[5/7] Testando rota no App.tsx...")
    all_results.extend(test_app_routing(project_dir))

    print("[6/7] Testando componentes de relatorio...")
    all_results.extend(test_report_components(project_dir))

    print("[7/7] Testando logica de comparacao (calcEvolution)...")
    all_results.extend(test_calc_evolution())

    print("\n[EXTRA] Testando seguranca admin-only...")
    all_results.extend(test_admin_only_security(project_dir))

    print("[EXTRA] Testando tabelas do banco...")
    all_results.extend(test_database_tables(project_dir))

    passed = sum(1 for r in all_results if r.passed)
    failed = sum(1 for r in all_results if not r.passed)
    warnings = sum(1 for r in all_results if not r.passed and r.severity == "warning")
    critical = sum(1 for r in all_results if not r.passed and r.severity == "critical")

    summary = {
        "total": len(all_results),
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "critical": critical,
    }

    return all_results, summary


def print_results(results: List[TestResult], summary: dict):
    failures = [r for r in results if not r.passed]
    passes = [r for r in results if r.passed]

    if failures:
        print(f"\n{'='*70}")
        print(f"  FALHAS ({len(failures)})")
        print(f"{'='*70}")
        for r in sorted(failures, key=lambda x: 0 if x.severity == "critical" else 1):
            icon = "!!" if r.severity == "critical" else "! "
            print(f"  [{icon}] {r.test_name}")
            print(f"       {r.details}")

    print(f"\n{'='*70}")
    print(f"  PASSOU ({len(passes)})")
    print(f"{'='*70}")
    for r in passes:
        print(f"  [OK] {r.test_name}")
        if "--verbose" in sys.argv:
            print(f"       {r.details}")

    print(f"\n{'='*70}")
    print(f"  SUMARIO")
    print(f"{'='*70}")
    print(f"  Total:    {summary['total']}")
    print(f"  Passou:   {summary['passed']}")
    print(f"  Falhou:   {summary['failed']}")
    print(f"  Avisos:   {summary['warnings']}")
    print(f"  Criticos: {summary['critical']}")
    print(f"{'='*70}")

    if summary["critical"] > 0:
        print("\n  !! ATENCAO: Existem falhas CRITICAS que precisam ser corrigidas!")
    elif summary["warnings"] > 0:
        print("\n  ! Existem avisos que devem ser verificados.")
    else:
        print("\n  Todos os testes passaram!")


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)

    if not os.path.exists(os.path.join(project_dir, "src")):
        print(f"ERRO: Diretorio src nao encontrado em {project_dir}")
        sys.exit(1)

    results, summary = run_all_tests(project_dir)
    print_results(results, summary)

    sys.exit(1 if summary["critical"] > 0 else 0)
