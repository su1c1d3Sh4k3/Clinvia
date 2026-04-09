#!/usr/bin/env python3
"""
Testes automatizados para edição rápida de duração de agendamentos.
Análise estática de código — verifica estrutura, imports, lógica de validação,
integração com Google Calendar e overlap check.

Execução: python tests/test_scheduling_duration.py
"""

import os
import re
import sys
from dataclasses import dataclass, field
from typing import List

# =============================================
# TEST INFRASTRUCTURE
# =============================================

@dataclass
class TestResult:
    name: str
    passed: bool
    message: str
    severity: str = "error"

@dataclass
class TestCategory:
    name: str
    results: List[TestResult] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if not r.passed)


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

def read_file(relative_path: str) -> str:
    full_path = os.path.join(PROJECT_ROOT, relative_path.replace("/", os.sep))
    if not os.path.exists(full_path):
        return ""
    with open(full_path, "r", encoding="utf-8") as f:
        return f.read()

def file_exists(relative_path: str) -> bool:
    full_path = os.path.join(PROJECT_ROOT, relative_path.replace("/", os.sep))
    return os.path.exists(full_path)


# =============================================
# 1. FILE STRUCTURE TESTS
# =============================================

def test_file_structure() -> TestCategory:
    cat = TestCategory("Estrutura de Arquivos")

    required_files = [
        ("src/components/scheduling/ViewAppointmentModal.tsx", "Modal de visualização com edição rápida"),
        ("src/components/scheduling/AppointmentModal.tsx", "Modal completo de agendamento"),
        ("src/components/scheduling/SchedulingCalendar.tsx", "Calendário visual"),
        ("src/components/scheduling/NotifyAppointmentModal.tsx", "Modal de notificação"),
    ]

    for path, desc in required_files:
        exists = file_exists(path)
        cat.results.append(TestResult(
            name=f"Arquivo existe: {path}",
            passed=exists,
            message=f"{'OK' if exists else f'FALTANDO: {desc}'}",
        ))

    return cat


# =============================================
# 2. VIEWAPPOINTMENTMODAL IMPORTS
# =============================================

def test_view_modal_imports() -> TestCategory:
    cat = TestCategory("ViewAppointmentModal - Imports")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler ViewAppointmentModal.tsx"))
        return cat

    required_imports = [
        ("useState", r"import\s*\{[^}]*useState[^}]*\}\s*from\s*['\"]react['\"]"),
        ("supabase client", r"import\s*\{[^}]*supabase[^}]*\}\s*from\s*['\"]@/integrations/supabase/client['\"]"),
        ("useOwnerId", r"import\s*\{[^}]*useOwnerId[^}]*\}\s*from\s*['\"]@/hooks/useOwnerId['\"]"),
        ("useQueryClient", r"import\s*\{[^}]*useQueryClient[^}]*\}\s*from\s*['\"]@tanstack/react-query['\"]"),
        ("useToast", r"import\s*\{[^}]*useToast[^}]*\}\s*from\s*['\"]@/hooks/use-toast['\"]"),
        ("Input component", r"import\s*\{[^}]*Input[^}]*\}\s*from\s*['\"]@/components/ui/input['\"]"),
        ("Check icon", r"import\s*\{[^}]*Check[^}]*\}\s*from\s*['\"]lucide-react['\"]"),
        ("X icon", r"import\s*\{[^}]*\bX\b[^}]*\}\s*from\s*['\"]lucide-react['\"]"),
        ("Loader2 icon", r"import\s*\{[^}]*Loader2[^}]*\}\s*from\s*['\"]lucide-react['\"]"),
        ("toZonedTime", r"import\s*\{[^}]*toZonedTime[^}]*\}\s*from\s*['\"]date-fns-tz['\"]"),
    ]

    for name, pattern in required_imports:
        found = bool(re.search(pattern, code))
        cat.results.append(TestResult(
            name=f"Import: {name}",
            passed=found,
            message=f"{'OK' if found else f'Import de {name} não encontrado'}",
        ))

    return cat


# =============================================
# 3. STATE MANAGEMENT
# =============================================

def test_state_management() -> TestCategory:
    cat = TestCategory("Gerenciamento de Estado")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # Required state variables
    states = [
        ("isEditingEnd", r"useState.*false.*\).*isEditingEnd|isEditingEnd.*useState"),
        ("newEndTime", r"useState.*\"\"|newEndTime.*useState"),
        ("isSaving", r"useState.*false.*\).*isSaving|isSaving.*useState"),
    ]

    for name, pattern in states:
        found = bool(re.search(pattern, code))
        cat.results.append(TestResult(
            name=f"State: {name}",
            passed=found,
            message=f"{'OK' if found else f'Estado {name} não encontrado'}",
        ))

    # Hooks
    hooks = [
        ("useOwnerId", r"useOwnerId\(\)"),
        ("useQueryClient", r"useQueryClient\(\)"),
        ("useToast", r"useToast\(\)"),
    ]

    for name, pattern in hooks:
        found = bool(re.search(pattern, code))
        cat.results.append(TestResult(
            name=f"Hook: {name}",
            passed=found,
            message=f"{'OK' if found else f'Hook {name} não chamado'}",
        ))

    return cat


# =============================================
# 4. EDIT END TIME HANDLERS
# =============================================

def test_edit_handlers() -> TestCategory:
    cat = TestCategory("Handlers de Edição")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # handleStartEditEnd
    found = bool(re.search(r"const\s+handleStartEditEnd\s*=", code))
    cat.results.append(TestResult(
        name="handleStartEditEnd definido",
        passed=found,
        message="OK" if found else "Função handleStartEditEnd não encontrada",
    ))

    # Sets editing state
    found = bool(re.search(r"setIsEditingEnd\(true\)", code))
    cat.results.append(TestResult(
        name="handleStartEditEnd ativa edição",
        passed=found,
        message="OK" if found else "setIsEditingEnd(true) não encontrado",
    ))

    # Populates newEndTime from appointment
    found = bool(re.search(r"setNewEndTime.*format.*toZoned.*end_time", code))
    cat.results.append(TestResult(
        name="handleStartEditEnd popula horário atual",
        passed=found,
        message="OK" if found else "Não popula newEndTime com horário atual do appointment",
    ))

    # handleCancelEditEnd
    found = bool(re.search(r"const\s+handleCancelEditEnd\s*=", code))
    cat.results.append(TestResult(
        name="handleCancelEditEnd definido",
        passed=found,
        message="OK" if found else "Função handleCancelEditEnd não encontrada",
    ))

    found = bool(re.search(r"setIsEditingEnd\(false\)", code))
    cat.results.append(TestResult(
        name="handleCancelEditEnd desativa edição",
        passed=found,
        message="OK" if found else "setIsEditingEnd(false) não encontrado",
    ))

    # handleSaveEndTime
    found = bool(re.search(r"const\s+handleSaveEndTime\s*=\s*async", code))
    cat.results.append(TestResult(
        name="handleSaveEndTime é async",
        passed=found,
        message="OK" if found else "handleSaveEndTime deve ser async",
    ))

    return cat


# =============================================
# 5. VALIDATION LOGIC
# =============================================

def test_validation() -> TestCategory:
    cat = TestCategory("Validações")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # End > Start validation
    found = bool(re.search(r"newEndZoned\s*<=\s*startZoned", code))
    cat.results.append(TestResult(
        name="Validação: end > start",
        passed=found,
        message="OK" if found else "Falta validação de que end_time > start_time",
    ))

    # Minimum 10 minutes
    found = bool(re.search(r"diffMin\s*<\s*10", code))
    cat.results.append(TestResult(
        name="Validação: mínimo 10 minutos",
        passed=found,
        message="OK" if found else "Falta validação de duração mínima de 10 min",
    ))

    # Toast for invalid end time
    found = bool(re.search(r"Horário inválido", code))
    cat.results.append(TestResult(
        name="Toast: horário inválido",
        passed=found,
        message="OK" if found else "Falta mensagem de erro para horário inválido",
    ))

    # Toast for minimum duration
    found = bool(re.search(r"Duração mínima", code))
    cat.results.append(TestResult(
        name="Toast: duração mínima",
        passed=found,
        message="OK" if found else "Falta mensagem de erro para duração mínima",
    ))

    # isSaving guard
    found = bool(re.search(r"setIsSaving\(true\)", code))
    cat.results.append(TestResult(
        name="Guard: setIsSaving(true) no início",
        passed=found,
        message="OK" if found else "Falta setIsSaving(true) no início do save",
    ))

    found = bool(re.search(r"setIsSaving\(false\)", code))
    cat.results.append(TestResult(
        name="Guard: setIsSaving(false) no finally",
        passed=found,
        message="OK" if found else "Falta setIsSaving(false) no finally",
    ))

    return cat


# =============================================
# 6. OVERLAP CHECK (RPC)
# =============================================

def test_overlap_check() -> TestCategory:
    cat = TestCategory("Verificação de Overlap")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # Calls check_appointment_overlap RPC
    found = bool(re.search(r'supabase\.rpc\(\s*["\']check_appointment_overlap["\']', code))
    cat.results.append(TestResult(
        name="Chama RPC check_appointment_overlap",
        passed=found,
        message="OK" if found else "Não chama check_appointment_overlap RPC",
    ))

    # Passes p_professional_id
    found = bool(re.search(r"p_professional_id:\s*appointment\.professional_id", code))
    cat.results.append(TestResult(
        name="Parâmetro: p_professional_id",
        passed=found,
        message="OK" if found else "Não passa p_professional_id",
    ))

    # Passes p_start_time
    found = bool(re.search(r"p_start_time:\s*appointment\.start_time", code))
    cat.results.append(TestResult(
        name="Parâmetro: p_start_time (original)",
        passed=found,
        message="OK" if found else "Não passa p_start_time",
    ))

    # Passes p_end_time with new value
    found = bool(re.search(r"p_end_time:\s*newEndISO", code))
    cat.results.append(TestResult(
        name="Parâmetro: p_end_time (novo)",
        passed=found,
        message="OK" if found else "Não passa p_end_time com novo horário",
    ))

    # Passes p_exclude_id
    found = bool(re.search(r"p_exclude_id:\s*appointment\.id", code))
    cat.results.append(TestResult(
        name="Parâmetro: p_exclude_id (self-exclusion)",
        passed=found,
        message="OK" if found else "Não exclui o próprio agendamento do overlap check",
    ))

    # Handles overlap result
    found = bool(re.search(r"if\s*\(isOverlap\)", code))
    cat.results.append(TestResult(
        name="Trata resultado de overlap",
        passed=found,
        message="OK" if found else "Não verifica resultado de isOverlap",
    ))

    # Toast for overlap
    found = bool(re.search(r"Horário indisponível", code))
    cat.results.append(TestResult(
        name="Toast: conflito de horário",
        passed=found,
        message="OK" if found else "Falta mensagem de conflito de horário",
    ))

    return cat


# =============================================
# 7. DATABASE UPDATE
# =============================================

def test_db_update() -> TestCategory:
    cat = TestCategory("Atualização no Banco de Dados")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # Updates appointments table
    found = bool(re.search(r'supabase\s*\.\s*from\(\s*["\']appointments["\']\s*\)\s*\.\s*update', code))
    cat.results.append(TestResult(
        name="UPDATE na tabela appointments",
        passed=found,
        message="OK" if found else "Não faz update na tabela appointments",
    ))

    # Updates end_time field
    found = bool(re.search(r'\.update\(\s*\{\s*end_time:\s*newEndISO\s*\}', code))
    cat.results.append(TestResult(
        name="Atualiza campo end_time",
        passed=found,
        message="OK" if found else "Não atualiza end_time com novo valor",
    ))

    # Filters by appointment ID
    found = bool(re.search(r'\.eq\(\s*["\']id["\']\s*,\s*appointment\.id\s*\)', code))
    cat.results.append(TestResult(
        name="Filtra por appointment.id",
        passed=found,
        message="OK" if found else "Não filtra update por ID do agendamento",
    ))

    # Error handling
    found = bool(re.search(r"if\s*\(error\)\s*throw\s*error", code))
    cat.results.append(TestResult(
        name="Tratamento de erro do update",
        passed=found,
        message="OK" if found else "Não trata erro do update",
    ))

    return cat


# =============================================
# 8. GOOGLE CALENDAR SYNC
# =============================================

def test_google_calendar_sync() -> TestCategory:
    cat = TestCategory("Sincronização Google Calendar")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # Calls google-calendar-sync edge function
    found = bool(re.search(r'supabase\.functions\.invoke\(\s*["\']google-calendar-sync["\']', code))
    cat.results.append(TestResult(
        name="Invoca edge function google-calendar-sync",
        passed=found,
        message="OK" if found else "Não invoca google-calendar-sync",
    ))

    # action: sync_appointment
    found = bool(re.search(r'action:\s*["\']sync_appointment["\']', code))
    cat.results.append(TestResult(
        name="Action: sync_appointment",
        passed=found,
        message="OK" if found else "Não usa action sync_appointment",
    ))

    # Passes appointment_id
    found = bool(re.search(r"appointment_id:\s*appointment\.id", code))
    cat.results.append(TestResult(
        name="Passa appointment_id",
        passed=found,
        message="OK" if found else "Não passa appointment_id para sync",
    ))

    # Passes user_id (ownerId)
    found = bool(re.search(r"user_id:\s*ownerId", code))
    cat.results.append(TestResult(
        name="Passa user_id (ownerId)",
        passed=found,
        message="OK" if found else "Não passa user_id para sync",
    ))

    # Fire-and-forget (.catch)
    found = bool(re.search(r'\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)', code))
    cat.results.append(TestResult(
        name="Fire-and-forget (.catch vazio)",
        passed=found,
        message="OK" if found else "Sync não é fire-and-forget (falta .catch)",
    ))

    # Guarded by ownerId
    found = bool(re.search(r"if\s*\(ownerId\)\s*\{?\s*\n?\s*supabase\.functions\.invoke", code))
    cat.results.append(TestResult(
        name="Sync protegido por if(ownerId)",
        passed=found,
        message="OK" if found else "Sync não é protegido por verificação de ownerId",
    ))

    return cat


# =============================================
# 9. QUERY INVALIDATION
# =============================================

def test_query_invalidation() -> TestCategory:
    cat = TestCategory("Invalidação de Cache (React Query)")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # Invalidates appointments query
    found = bool(re.search(r'invalidateQueries.*queryKey.*\[.*["\']appointments["\']', code))
    cat.results.append(TestResult(
        name="Invalida cache: appointments",
        passed=found,
        message="OK" if found else "Não invalida query 'appointments'",
    ))

    # Invalidates contact-appointments query
    found = bool(re.search(r'invalidateQueries.*queryKey.*\[.*["\']contact-appointments["\']', code))
    cat.results.append(TestResult(
        name="Invalida cache: contact-appointments",
        passed=found,
        message="OK" if found else "Não invalida query 'contact-appointments'",
    ))

    return cat


# =============================================
# 10. UI ELEMENTS
# =============================================

def test_ui_elements() -> TestCategory:
    cat = TestCategory("Elementos de UI")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # Time input
    found = bool(re.search(r'type="time"', code))
    cat.results.append(TestResult(
        name="Input type=time para edição",
        passed=found,
        message="OK" if found else "Falta input type=time",
    ))

    # Conditional rendering (isEditingEnd)
    found = bool(re.search(r"isEditingEnd\s*\?", code))
    cat.results.append(TestResult(
        name="Renderização condicional (isEditingEnd)",
        passed=found,
        message="OK" if found else "Falta ternário isEditingEnd",
    ))

    # Save button (Check icon)
    found = bool(re.search(r"onClick=\{handleSaveEndTime\}", code))
    cat.results.append(TestResult(
        name="Botão salvar com handleSaveEndTime",
        passed=found,
        message="OK" if found else "Falta botão de salvar",
    ))

    # Cancel button
    found = bool(re.search(r"onClick=\{handleCancelEditEnd\}", code))
    cat.results.append(TestResult(
        name="Botão cancelar com handleCancelEditEnd",
        passed=found,
        message="OK" if found else "Falta botão de cancelar",
    ))

    # Edit pencil button on hover
    found = bool(re.search(r"onClick=\{handleStartEditEnd\}", code))
    cat.results.append(TestResult(
        name="Botão de edição (pencil) no horário",
        passed=found,
        message="OK" if found else "Falta botão de editar no horário",
    ))

    # Hover opacity transition
    found = bool(re.search(r"opacity-0\s+group-hover:opacity-100", code))
    cat.results.append(TestResult(
        name="Pencil com hover transition",
        passed=found,
        message="OK" if found else "Falta transição de opacidade no hover",
    ))

    # Loading state (Loader2 spinner)
    found = bool(re.search(r"isSaving.*Loader2|Loader2.*animate-spin", code))
    cat.results.append(TestResult(
        name="Loading spinner durante save",
        passed=found,
        message="OK" if found else "Falta indicador de loading",
    ))

    # Only for appointments (not absences)
    found = bool(re.search(r"canEdit\s*&&\s*isAppointment", code))
    cat.results.append(TestResult(
        name="Edição apenas para agendamentos (não ausências)",
        passed=found,
        message="OK" if found else "Botão de edição deve aparecer só para agendamentos",
    ))

    # Disabled during save
    found = bool(re.search(r"disabled=\{isSaving\}", code))
    cat.results.append(TestResult(
        name="Inputs desabilitados durante save",
        passed=found,
        message="OK" if found else "Inputs não são desabilitados durante save",
    ))

    return cat


# =============================================
# 11. TIMEZONE HANDLING
# =============================================

def test_timezone_handling() -> TestCategory:
    cat = TestCategory("Tratamento de Timezone")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # Uses TIMEZONE constant
    found = bool(re.search(r'TIMEZONE\s*=\s*["\']America/Sao_Paulo["\']', code))
    cat.results.append(TestResult(
        name="Constante TIMEZONE = America/Sao_Paulo",
        passed=found,
        message="OK" if found else "Falta constante TIMEZONE",
    ))

    # Uses toZonedTime for display
    found = bool(re.search(r"toZonedTime\(", code))
    cat.results.append(TestResult(
        name="Usa toZonedTime para conversão",
        passed=found,
        message="OK" if found else "Não usa toZonedTime",
    ))

    # Converts back to UTC for DB
    found = bool(re.search(r"offsetMs.*getTime.*toZoned|toISOString", code))
    cat.results.append(TestResult(
        name="Converte de volta para UTC/ISO para DB",
        passed=found,
        message="OK" if found else "Não converte de volta para UTC",
    ))

    # Generates ISO string for update
    found = bool(re.search(r"newEndISO.*toISOString\(\)|toISOString\(\).*newEndISO", code))
    cat.results.append(TestResult(
        name="Gera ISO string (newEndISO)",
        passed=found,
        message="OK" if found else "Não gera ISO string para o novo end_time",
    ))

    return cat


# =============================================
# 12. OVERLAP RPC CONSISTENCY
# =============================================

def test_overlap_rpc_consistency() -> TestCategory:
    cat = TestCategory("Consistência com AppointmentModal")
    view_code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")
    modal_code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not view_code or not modal_code:
        cat.results.append(TestResult("Arquivos legíveis", False, "Não foi possível ler os arquivos"))
        return cat

    # Both use check_appointment_overlap
    view_has = bool(re.search(r"check_appointment_overlap", view_code))
    modal_has = bool(re.search(r"check_appointment_overlap", modal_code))
    cat.results.append(TestResult(
        name="Ambos modais usam check_appointment_overlap",
        passed=view_has and modal_has,
        message="OK" if view_has and modal_has else f"View: {view_has}, Modal: {modal_has}",
    ))

    # Both use google-calendar-sync
    view_has = bool(re.search(r"google-calendar-sync", view_code))
    modal_has = bool(re.search(r"google-calendar-sync", modal_code))
    cat.results.append(TestResult(
        name="Ambos modais sincronizam Google Calendar",
        passed=view_has and modal_has,
        message="OK" if view_has and modal_has else f"View: {view_has}, Modal: {modal_has}",
    ))

    # Both invalidate appointments query
    view_has = bool(re.search(r'invalidateQueries.*appointments', view_code))
    modal_has = bool(re.search(r'invalidateQueries.*appointments', modal_code))
    cat.results.append(TestResult(
        name="Ambos invalidam cache de appointments",
        passed=view_has and modal_has,
        message="OK" if view_has and modal_has else f"View: {view_has}, Modal: {modal_has}",
    ))

    # Both use fire-and-forget pattern
    view_has = bool(re.search(r'\.catch\(\s*\(\)', view_code))
    modal_has = bool(re.search(r'\.catch\(\s*\(\)', modal_code))
    cat.results.append(TestResult(
        name="Ambos usam fire-and-forget para sync",
        passed=view_has and modal_has,
        message="OK" if view_has and modal_has else f"View: {view_has}, Modal: {modal_has}",
    ))

    return cat


# =============================================
# 13. SECURITY
# =============================================

def test_security() -> TestCategory:
    cat = TestCategory("Segurança")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legível", False, "Não foi possível ler"))
        return cat

    # No dangerouslySetInnerHTML
    found = "dangerouslySetInnerHTML" not in code
    cat.results.append(TestResult(
        name="Sem dangerouslySetInnerHTML",
        passed=found,
        message="OK" if found else "Uso de dangerouslySetInnerHTML detectado",
    ))

    # canEdit guard
    found = bool(re.search(r"canEdit\s*&&", code))
    cat.results.append(TestResult(
        name="Edição protegida por canEdit",
        passed=found,
        message="OK" if found else "Falta verificação canEdit para edição",
    ))

    # Uses supabase RPC (server-side validation)
    found = bool(re.search(r"supabase\.rpc", code))
    cat.results.append(TestResult(
        name="Validação server-side via RPC",
        passed=found,
        message="OK" if found else "Falta validação server-side",
    ))

    # Error handling in try-catch
    found = bool(re.search(r"catch\s*\(error", code))
    cat.results.append(TestResult(
        name="Error handling com try-catch",
        passed=found,
        message="OK" if found else "Falta tratamento de erro",
    ))

    return cat


# =============================================
# RUNNER
# =============================================

def main():
    categories = [
        test_file_structure(),
        test_view_modal_imports(),
        test_state_management(),
        test_edit_handlers(),
        test_validation(),
        test_overlap_check(),
        test_db_update(),
        test_google_calendar_sync(),
        test_query_invalidation(),
        test_ui_elements(),
        test_timezone_handling(),
        test_overlap_rpc_consistency(),
        test_security(),
    ]

    total_passed = 0
    total_failed = 0

    print("=" * 60)
    print("  TESTES: Edição Rápida de Duração de Agendamentos")
    print("=" * 60)

    for cat in categories:
        total_passed += cat.passed
        total_failed += cat.failed
        status = "PASS" if cat.failed == 0 else "FAIL"
        print(f"\n[{status}] {cat.name} ({cat.passed}/{cat.passed + cat.failed})")
        for r in cat.results:
            icon = "  [OK]" if r.passed else "  [X]"
            print(f"  {icon} {r.name}: {r.message}")

    total = total_passed + total_failed
    print("\n" + "=" * 60)
    print(f"  RESULTADO: {total_passed}/{total} testes passaram")
    if total_failed > 0:
        print(f"  WARNING: {total_failed} testes falharam")
    else:
        print("  ALL PASSED!")
    print("=" * 60)

    sys.exit(0 if total_failed == 0 else 1)


if __name__ == "__main__":
    main()
