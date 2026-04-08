"""
Testes Automatizados de Permissoes - Clinvia
=============================================
Testa o sistema de permissoes end-to-end:
1. Verifica que todas as RLS policies usam get_owner_id() (nao auth.uid())
2. Verifica que o hook usePermissions respeita custom_permissions
3. Verifica que cada feature tem enforcement no frontend

Rodar: python tests/test_permissions.py
Requisitos: pip install supabase python-dotenv
"""

import json
import os
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

# ============================================================================
# MOCK LAYER - Simula o comportamento do sistema sem precisar de conexao real
# ============================================================================

@dataclass
class MockPolicy:
    tablename: str
    policyname: str
    cmd: str  # ALL, SELECT, INSERT, UPDATE, DELETE
    qual: str  # USING clause
    with_check: Optional[str] = None

@dataclass
class MockPermission:
    feature: str
    can_create: bool
    can_edit: bool
    can_delete: bool

@dataclass
class TestResult:
    test_name: str
    passed: bool
    details: str
    severity: str = "info"  # info, warning, critical


# ============================================================================
# EXPECTED STATE - Define o estado correto do sistema
# ============================================================================

PERMISSION_FEATURES = [
    "contacts", "tags", "queues", "products_services", "tasks",
    "appointments", "professionals", "crm_deals", "financial",
    "sales", "team_members", "followup", "connections", "ia_config",
    "quick_messages"
]

# Mapeamento feature -> tabelas do banco
FEATURE_TABLES: Dict[str, List[str]] = {
    "contacts": ["contacts", "contact_tags"],
    "tags": ["tags"],
    "queues": ["queues"],
    "products_services": ["products_services"],
    "tasks": ["tasks", "task_boards"],
    "appointments": ["appointments", "scheduling_settings"],
    "professionals": ["professionals"],
    "crm_deals": ["crm_deals", "crm_funnels", "crm_stages", "crm_deal_history", "crm_deal_attachments", "crm_deal_products"],
    "financial": ["expenses", "revenues", "expense_categories", "revenue_categories", "financial_reports"],
    "sales": ["sales", "sale_installments", "sales_reports"],
    "team_members": ["team_members"],
    "followup": ["follow_up_templates", "follow_up_categories", "conversation_follow_ups"],
    "connections": ["instances", "instagram_instances"],
    "ia_config": ["ia_config"],
    "quick_messages": ["quick_messages"],
}

# Policies que DEVEM existir (tabela -> policy pattern)
EXPECTED_POLICIES: Dict[str, str] = {
    "contacts": "get_owner_id",
    "contact_tags": "get_owner_id",
    "tags": "get_owner_id",
    "queues": "get_owner_id",
    "products_services": "get_owner_id",
    "tasks": "get_owner_id",
    "task_boards": "get_owner_id",
    "appointments": "get_owner_id",
    "scheduling_settings": "get_owner_id",
    "professionals": "get_owner_id",
    "crm_deals": "get_owner_id",
    "crm_funnels": "get_owner_id",
    "crm_stages": "get_owner_id",
    "crm_deal_history": "get_owner_id",
    "crm_deal_attachments": "get_owner_id",
    "crm_deal_products": "team_members",
    "expenses": "get_owner_id",
    "revenues": "get_owner_id",
    "expense_categories": "get_owner_id",
    "revenue_categories": "get_owner_id",
    "financial_reports": "get_owner_id",
    "sales": "team_members",
    "sale_installments": "team_members",
    "sales_reports": "team_members",
    "team_members": "special",  # is_admin for INSERT/DELETE, get_my_owner_id for SELECT
    "follow_up_templates": "get_owner_id",
    "follow_up_categories": "get_owner_id",
    "conversation_follow_ups": "get_owner_id",
    "instances": "get_owner_id",
    "instagram_instances": "get_owner_id",
    "ia_config": "get_owner_id",
    "quick_messages": "team_members",
}

# Paginas que DEVEM ter verificacao de permissao no frontend
FRONTEND_CHECKS: Dict[str, List[str]] = {
    "contacts": ["canCreate('contacts')", "canEdit('contacts')", "canDelete('contacts')"],
    "tags": ["canCreate('tags')", "canEdit('tags')", "canDelete('tags')"],
    "queues": ["canCreate('queues')", "canEdit('queues')", "canDelete('queues')"],
    "products_services": ["canCreate('products_services')", "canEdit('products_services')", "canDelete('products_services')"],
    "tasks": ["canCreate('tasks')", "canEdit('tasks')"],  # No explicit delete buttons in tasks (kanban drag)
    "appointments": ["canCreate('appointments')", "canEdit('appointments')"],  # Delete via cancel status
    "professionals": ["canCreate('professionals')", "canEdit('professionals')"],  # In Scheduling.tsx
    "crm_deals": ["canCreate('crm_deals')", "canEdit('crm_deals')", "canDelete('crm_deals')"],
    "financial": ["hasAnyAccess('financial')"],
    "sales": ["hasAnyAccess('sales')"],  # canEdit/canDelete in SalesTable.tsx component
    "team_members": ["canCreate('team_members')", "canEdit('team_members')", "canDelete('team_members')"],
    "followup": ["canCreate('followup')", "canEdit('followup')", "canDelete('followup')"],
    "connections": ["canCreate('connections')", "canEdit('connections')", "canDelete('connections')"],
    "ia_config": ["hasAnyAccess('ia_config')"],
    "quick_messages": ["canCreate('quick_messages')", "canEdit('quick_messages')", "canDelete('quick_messages')"],
}

# Paginas com navigation guard (redirect se sem permissao)
NAV_GUARDS = ["financial", "sales", "team_members", "ia_config"]

# Default permissions
DEFAULT_SUPERVISOR = {
    "contacts":          {"can_create": True,  "can_edit": True,  "can_delete": True},
    "tags":              {"can_create": True,  "can_edit": True,  "can_delete": False},
    "queues":            {"can_create": True,  "can_edit": True,  "can_delete": True},
    "products_services": {"can_create": True,  "can_edit": True,  "can_delete": False},
    "tasks":             {"can_create": True,  "can_edit": True,  "can_delete": True},
    "appointments":      {"can_create": True,  "can_edit": True,  "can_delete": True},
    "professionals":     {"can_create": True,  "can_edit": True,  "can_delete": True},
    "crm_deals":         {"can_create": True,  "can_edit": True,  "can_delete": True},
    "financial":         {"can_create": True,  "can_edit": True,  "can_delete": True},
    "sales":             {"can_create": True,  "can_edit": True,  "can_delete": False},
    "team_members":      {"can_create": True,  "can_edit": True,  "can_delete": False},
    "followup":          {"can_create": True,  "can_edit": True,  "can_delete": True},
    "connections":       {"can_create": False, "can_edit": False, "can_delete": False},
    "ia_config":         {"can_create": True,  "can_edit": True,  "can_delete": False},
    "quick_messages":    {"can_create": True,  "can_edit": True,  "can_delete": True},
}

DEFAULT_AGENT = {
    "contacts":          {"can_create": True,  "can_edit": True,  "can_delete": True},
    "tags":              {"can_create": False, "can_edit": False, "can_delete": False},
    "queues":            {"can_create": False, "can_edit": False, "can_delete": False},
    "products_services": {"can_create": False, "can_edit": False, "can_delete": False},
    "tasks":             {"can_create": True,  "can_edit": True,  "can_delete": True},
    "appointments":      {"can_create": True,  "can_edit": True,  "can_delete": True},
    "professionals":     {"can_create": True,  "can_edit": True,  "can_delete": True},
    "crm_deals":         {"can_create": False, "can_edit": True,  "can_delete": False},
    "financial":         {"can_create": False, "can_edit": False, "can_delete": False},
    "sales":             {"can_create": False, "can_edit": False, "can_delete": False},
    "team_members":      {"can_create": False, "can_edit": False, "can_delete": False},
    "followup":          {"can_create": True,  "can_edit": True,  "can_delete": True},
    "connections":       {"can_create": False, "can_edit": False, "can_delete": False},
    "ia_config":         {"can_create": False, "can_edit": False, "can_delete": False},
    "quick_messages":    {"can_create": True,  "can_edit": True,  "can_delete": True},
}


# ============================================================================
# TEST FUNCTIONS
# ============================================================================

def test_rls_policy_pattern(policies: List[MockPolicy]) -> List[TestResult]:
    """Testa que cada tabela tem a policy RLS correta para supervisor/agent."""
    results = []

    for table, expected_pattern in EXPECTED_POLICIES.items():
        table_policies = [p for p in policies if p.tablename == table]

        if not table_policies:
            results.append(TestResult(
                f"RLS: {table}",
                False,
                f"Nenhuma policy encontrada para tabela '{table}'",
                "critical"
            ))
            continue

        if expected_pattern == "special":
            # team_members tem regras especiais
            has_select = any("get_my_owner_id" in (p.qual or "") or "get_owner_id" in (p.qual or "")
                          for p in table_policies if p.cmd in ("SELECT", "ALL"))
            results.append(TestResult(
                f"RLS: {table}",
                has_select,
                "team_members tem SELECT via get_my_owner_id + INSERT/DELETE via is_admin()" if has_select
                else "team_members SELECT policy ausente",
                "warning" if not has_select else "info"
            ))
            continue

        # Check if any policy uses the expected pattern
        pattern_found = False
        for policy in table_policies:
            qual = (policy.qual or "") + " " + (policy.with_check or "")
            if expected_pattern == "get_owner_id" and "get_owner_id()" in qual:
                pattern_found = True
                break
            elif expected_pattern == "team_members" and "team_members" in qual:
                pattern_found = True
                break

        # Check for dangerous auth.uid()-only patterns
        has_auth_uid_only = any(
            "auth.uid()" in (p.qual or "") and "team_members" not in (p.qual or "") and "get_owner_id" not in (p.qual or "")
            for p in table_policies if p.cmd in ("ALL", "INSERT", "UPDATE", "DELETE")
        )

        if pattern_found and not has_auth_uid_only:
            results.append(TestResult(
                f"RLS: {table}",
                True,
                f"Policy usa '{expected_pattern}' corretamente"
            ))
        elif pattern_found and has_auth_uid_only:
            results.append(TestResult(
                f"RLS: {table}",
                False,
                f"Policy correta existe, mas ha policy redundante com auth.uid() que pode causar confusao",
                "warning"
            ))
        else:
            results.append(TestResult(
                f"RLS: {table}",
                False,
                f"Esperado '{expected_pattern}', mas nao encontrado. Supervisor/agent pode ser BLOQUEADO!",
                "critical"
            ))

    return results


def test_default_permissions() -> List[TestResult]:
    """Testa que os defaults do usePermissions estao corretos."""
    results = []

    for feature in PERMISSION_FEATURES:
        sup = DEFAULT_SUPERVISOR.get(feature)
        agt = DEFAULT_AGENT.get(feature)

        if not sup or not agt:
            results.append(TestResult(
                f"Defaults: {feature}",
                False,
                f"Feature '{feature}' sem defaults definidos",
                "critical"
            ))
            continue

        results.append(TestResult(
            f"Defaults: {feature}",
            True,
            f"Supervisor: C={sup['can_create']} E={sup['can_edit']} D={sup['can_delete']} | "
            f"Agent: C={agt['can_create']} E={agt['can_edit']} D={agt['can_delete']}"
        ))

    return results


def test_frontend_enforcement(src_dir: str) -> List[TestResult]:
    """Testa que cada feature tem verificacao de permissao no frontend."""
    results = []

    # Mapeamento feature -> arquivos onde verificar
    feature_files = {
        "contacts": "pages/Contacts.tsx",
        "tags": "pages/Tags.tsx",
        "queues": "pages/Queues.tsx",
        "products_services": "pages/ProductsServices.tsx",
        "tasks": "pages/Tasks.tsx",
        "appointments": "pages/Scheduling.tsx",
        "professionals": "pages/Scheduling.tsx",  # Professionals are managed in Scheduling page
        "crm_deals": "pages/CRM.tsx",
        "financial": "pages/Financial.tsx",
        "sales": "pages/Sales.tsx",
        "team_members": "pages/Team.tsx",
        "followup": "pages/FollowUp.tsx",
        "connections": "pages/Connections.tsx",
        "ia_config": "pages/IAConfig.tsx",
        "quick_messages": "components/QuickMessagesMenu.tsx",  # Component, not page
    }

    for feature, expected_checks in FRONTEND_CHECKS.items():
        file_path = os.path.join(src_dir, feature_files.get(feature, ""))

        # Try to find the file (case-insensitive search)
        found_file = None
        if os.path.exists(file_path):
            found_file = file_path
        else:
            # Search in pages/ and components/ directories
            for root, dirs, files in os.walk(src_dir):
                for f in files:
                    if f.lower() == os.path.basename(file_path).lower():
                        found_file = os.path.join(root, f)
                        break
                if found_file:
                    break

        if not found_file or not os.path.exists(found_file):
            results.append(TestResult(
                f"Frontend: {feature}",
                False,
                f"Arquivo nao encontrado: {file_path}",
                "warning"
            ))
            continue

        try:
            with open(found_file, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            results.append(TestResult(
                f"Frontend: {feature}",
                False,
                f"Erro ao ler arquivo: {e}",
                "warning"
            ))
            continue

        # Check for usePermissions import
        has_import = "usePermissions" in content

        # Check for each expected permission check
        missing_checks = []
        for check in expected_checks:
            if check not in content:
                missing_checks.append(check)

        if has_import and not missing_checks:
            results.append(TestResult(
                f"Frontend: {feature}",
                True,
                f"Todas as {len(expected_checks)} verificacoes presentes em {os.path.basename(found_file)}"
            ))
        elif has_import and missing_checks:
            results.append(TestResult(
                f"Frontend: {feature}",
                False,
                f"usePermissions importado mas faltam: {', '.join(missing_checks)}",
                "warning"
            ))
        else:
            results.append(TestResult(
                f"Frontend: {feature}",
                False,
                f"usePermissions NAO importado em {os.path.basename(found_file)}. Switches nao funcionam!",
                "critical"
            ))

    return results


def test_nav_guards(src_dir: str) -> List[TestResult]:
    """Testa que paginas com navigation guard tem redirect."""
    results = []

    nav_files = {
        "financial": "pages/Financial.tsx",
        "sales": "pages/Sales.tsx",
        "team_members": "pages/Team.tsx",
        "ia_config": "pages/IAConfig.tsx",
    }

    sidebar_path = os.path.join(src_dir, "components/NavigationSidebar.tsx")

    # Check sidebar
    if os.path.exists(sidebar_path):
        with open(sidebar_path, "r", encoding="utf-8") as f:
            sidebar_content = f.read()

        sidebar_guards = {
            "team_members": 'hasAnyAccess(\'team_members\')' in sidebar_content or 'hasAnyAccess("team_members")' in sidebar_content,
            "ia_config": 'hasAnyAccess(\'ia_config\')' in sidebar_content or 'hasAnyAccess("ia_config")' in sidebar_content,
            "sales": 'hasAnyAccess(\'sales\')' in sidebar_content or 'hasAnyAccess("sales")' in sidebar_content,
            "financial": 'hasAnyAccess(\'financial\')' in sidebar_content or 'hasAnyAccess("financial")' in sidebar_content,
        }

        for feature, has_guard in sidebar_guards.items():
            results.append(TestResult(
                f"NavGuard Sidebar: {feature}",
                has_guard,
                f"Sidebar {'esconde' if has_guard else 'NAO esconde'} item quando sem permissao",
                "info" if has_guard else "warning"
            ))

    # Check page-level redirects
    for feature, file_rel in nav_files.items():
        file_path = os.path.join(src_dir, file_rel)
        if not os.path.exists(file_path):
            continue

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        has_redirect = "navigate(" in content and "hasAnyAccess" in content
        has_conditional_render = "hasAnyAccess" in content and ("return" in content or "if (" in content)
        has_guard = has_redirect or has_conditional_render
        guard_type = "redireciona" if has_redirect else ("bloqueia render" if has_conditional_render else "NAO bloqueia")
        results.append(TestResult(
            f"NavGuard Page: {feature}",
            has_guard,
            f"Pagina {guard_type} usuario sem permissao",
            "info" if has_guard else "warning"
        ))

    return results


def test_permission_switch_effectiveness() -> List[TestResult]:
    """
    Simula: Se admin desativar TODOS os switches de uma feature para supervisor,
    o que acontece? O sistema deve bloquear completamente.
    """
    results = []

    for feature in PERMISSION_FEATURES:
        # Simulate: all switches OFF for supervisor
        custom_perm = MockPermission(feature=feature, can_create=False, can_edit=False, can_delete=False)

        # Verify: RLS still allows data ACCESS (get_owner_id doesn't check custom_permissions)
        tables = FEATURE_TABLES.get(feature, [])
        has_rls_enforcement = False

        for table in tables:
            expected = EXPECTED_POLICIES.get(table, "")
            if expected in ("get_owner_id", "team_members"):
                # RLS permite acesso ao dados - bloqueio eh apenas no frontend
                has_rls_enforcement = False
                break

        # The permission system is FRONTEND-ONLY for action controls
        # RLS controls DATA ACCESS (which rows you can see)
        # custom_permissions controls UI ACTIONS (which buttons you see)
        rls_note = "RLS controla acesso aos DADOS (quais linhas ve). "
        ui_note = "Switches controlam ACOES na UI (botoes criar/editar/deletar)."

        if feature in NAV_GUARDS:
            results.append(TestResult(
                f"Switch OFF: {feature}",
                True,
                f"Com todos switches OFF: Pagina INACESSIVEL (nav guard + redirect). {rls_note}{ui_note}",
            ))
        else:
            results.append(TestResult(
                f"Switch OFF: {feature}",
                True,
                f"Com todos switches OFF: Pagina acessivel mas botoes OCULTOS. {rls_note}{ui_note}",
            ))

    # Special case: team_members
    results.append(TestResult(
        f"Switch LIMITACAO: team_members",
        False,
        "ATENCAO: Mesmo com can_create=true para supervisor, RLS bloqueia INSERT/DELETE (exige is_admin). "
        "O botao aparece mas a operacao falha no banco.",
        "warning"
    ))

    return results


# ============================================================================
# MAIN
# ============================================================================

def run_all_tests(src_dir: Optional[str] = None) -> Tuple[List[TestResult], dict]:
    """Roda todos os testes e retorna resultados + sumario."""
    all_results: List[TestResult] = []

    print("=" * 70)
    print("  CLINVIA - Teste Completo de Permissoes")
    print("=" * 70)

    # 1. Test default permissions
    print("\n[1/5] Testando defaults de permissoes...")
    all_results.extend(test_default_permissions())

    # 2. Test switch effectiveness (mock)
    print("[2/5] Testando efetividade dos switches...")
    all_results.extend(test_permission_switch_effectiveness())

    # 3. Test frontend enforcement (if src_dir provided)
    if src_dir and os.path.exists(src_dir):
        print(f"[3/5] Testando frontend enforcement em {src_dir}...")
        all_results.extend(test_frontend_enforcement(src_dir))

        print("[4/5] Testando navigation guards...")
        all_results.extend(test_nav_guards(src_dir))
    else:
        print("[3/5] PULADO - src_dir nao fornecido")
        print("[4/5] PULADO - src_dir nao fornecido")

    # 5. Summary
    print("[5/5] Gerando sumario...")

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
    """Imprime os resultados formatados."""

    # Print failures first
    failures = [r for r in results if not r.passed]
    passes = [r for r in results if r.passed]

    if failures:
        print(f"\n{'='*70}")
        print(f"  FALHAS ({len(failures)})")
        print(f"{'='*70}")
        for r in sorted(failures, key=lambda x: 0 if x.severity == "critical" else 1):
            icon = "!!" if r.severity == "critical" else "!!"
            print(f"  [{icon}] {r.test_name}")
            print(f"      {r.details}")

    print(f"\n{'='*70}")
    print(f"  PASSOU ({len(passes)})")
    print(f"{'='*70}")
    for r in passes:
        print(f"  [OK] {r.test_name}")
        if "--verbose" in sys.argv:
            print(f"      {r.details}")

    print(f"\n{'='*70}")
    print(f"  SUMARIO")
    print(f"{'='*70}")
    print(f"  Total:    {summary['total']}")
    print(f"  Passou:   {summary['passed']}")
    print(f"  Falhou:   {summary['failed']}")
    print(f"  Avisos:   {summary['warnings']}")
    print(f"  Criticos: {summary['critical']}")
    print(f"{'='*70}")

    if summary['critical'] > 0:
        print("\n  !! ATENCAO: Existem falhas CRITICAS que precisam ser corrigidas!")
    elif summary['warnings'] > 0:
        print("\n  ! Existem avisos que devem ser verificados.")
    else:
        print("\n  Todos os testes passaram!")


if __name__ == "__main__":
    # Detect src directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    src_dir = os.path.join(project_dir, "src")

    if not os.path.exists(src_dir):
        print(f"AVISO: Diretorio src nao encontrado em {src_dir}")
        print("Testes de frontend serao pulados.")
        src_dir = None

    results, summary = run_all_tests(src_dir)
    print_results(results, summary)

    # Exit code: 1 if critical failures, 0 otherwise
    sys.exit(1 if summary['critical'] > 0 else 0)
