#!/usr/bin/env python3
"""
Testes automatizados para edicao de duracao de agendamentos.
Analise estatica de codigo -- verifica que a duracao eh editavel no modal
de edicao (AppointmentModal) e que o card de visualizacao (ViewAppointmentModal)
permanece limpo sem logica de edicao inline.

Execucao: python tests/test_scheduling_duration.py
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
# 1. FILE STRUCTURE
# =============================================

def test_file_structure() -> TestCategory:
    cat = TestCategory("Estrutura de Arquivos")

    required_files = [
        ("src/components/scheduling/ViewAppointmentModal.tsx", "Card de visualizacao do agendamento"),
        ("src/components/scheduling/AppointmentModal.tsx", "Modal completo de criacao/edicao"),
        ("src/components/scheduling/SchedulingCalendar.tsx", "Calendario visual"),
        ("src/components/scheduling/NotifyAppointmentModal.tsx", "Modal de notificacao"),
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
# 2. VIEW MODAL - SEM EDICAO INLINE
# =============================================

def test_view_modal_clean() -> TestCategory:
    cat = TestCategory("ViewAppointmentModal - Sem Edicao Inline")
    code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legivel", False, "Nao foi possivel ler ViewAppointmentModal.tsx"))
        return cat

    # Nao deve ter imports de edicao
    no_supabase = "import { supabase }" not in code and "from \"@/integrations/supabase/client\"" not in code
    cat.results.append(TestResult(
        name="Sem import de supabase client",
        passed=no_supabase,
        message="OK" if no_supabase else "ViewModal nao deve importar supabase diretamente",
    ))

    no_query_client = "useQueryClient" not in code
    cat.results.append(TestResult(
        name="Sem import de useQueryClient",
        passed=no_query_client,
        message="OK" if no_query_client else "ViewModal nao deve usar useQueryClient",
    ))

    no_owner_id = "useOwnerId" not in code
    cat.results.append(TestResult(
        name="Sem import de useOwnerId",
        passed=no_owner_id,
        message="OK" if no_owner_id else "ViewModal nao deve usar useOwnerId",
    ))

    no_use_toast = "useToast" not in code
    cat.results.append(TestResult(
        name="Sem import de useToast",
        passed=no_use_toast,
        message="OK" if no_use_toast else "ViewModal nao deve usar useToast",
    ))

    # Nao deve ter estados de edicao
    no_editing_state = "isEditingEnd" not in code
    cat.results.append(TestResult(
        name="Sem estado isEditingEnd",
        passed=no_editing_state,
        message="OK" if no_editing_state else "ViewModal nao deve ter estado de edicao",
    ))

    no_saving_state = "isSaving" not in code
    cat.results.append(TestResult(
        name="Sem estado isSaving",
        passed=no_saving_state,
        message="OK" if no_saving_state else "ViewModal nao deve ter estado de saving",
    ))

    # Nao deve ter handlers de save
    no_save_handler = "handleSaveEndTime" not in code
    cat.results.append(TestResult(
        name="Sem handleSaveEndTime",
        passed=no_save_handler,
        message="OK" if no_save_handler else "ViewModal nao deve ter handler de save",
    ))

    # Nao deve ter chamada RPC
    no_rpc = "supabase.rpc" not in code
    cat.results.append(TestResult(
        name="Sem chamada RPC",
        passed=no_rpc,
        message="OK" if no_rpc else "ViewModal nao deve chamar RPCs",
    ))

    # Nao deve ter chamada de edge function
    no_edge = "google-calendar-sync" not in code
    cat.results.append(TestResult(
        name="Sem chamada google-calendar-sync",
        passed=no_edge,
        message="OK" if no_edge else "ViewModal nao deve chamar edge functions",
    ))

    # Deve manter exibicao simples do horario
    simple_time = bool(re.search(r'format\(toZoned\(appointment\.start_time\),\s*"HH:mm"\)', code))
    cat.results.append(TestResult(
        name="Exibe horario de inicio formatado",
        passed=simple_time,
        message="OK" if simple_time else "Falta exibicao do start_time",
    ))

    simple_end = bool(re.search(r'format\(toZoned\(appointment\.end_time\),\s*"HH:mm"\)', code))
    cat.results.append(TestResult(
        name="Exibe horario de termino formatado",
        passed=simple_end,
        message="OK" if simple_end else "Falta exibicao do end_time",
    ))

    # Deve manter o botao de editar (pencil) que abre o AppointmentModal
    has_edit_button = bool(re.search(r"onEdit\(appointment\)", code))
    cat.results.append(TestResult(
        name="Mantem botao de editar (abre AppointmentModal)",
        passed=has_edit_button,
        message="OK" if has_edit_button else "Falta botao que abre modal de edicao",
    ))

    return cat


# =============================================
# 3. APPOINTMENT MODAL - DURACAO EDITAVEL
# =============================================

def test_duration_field() -> TestCategory:
    cat = TestCategory("AppointmentModal - Campo Duracao")
    code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legivel", False, "Nao foi possivel ler AppointmentModal.tsx"))
        return cat

    # Campo de duracao existe
    has_duration = bool(re.search(r'name="duration"', code))
    cat.results.append(TestResult(
        name="Campo duration existe no form",
        passed=has_duration,
        message="OK" if has_duration else "Campo duration nao encontrado",
    ))

    # Input type=number para duracao
    has_input = bool(re.search(r'type="number"\s+min=\{10\}', code))
    cat.results.append(TestResult(
        name="Input type=number com min=10",
        passed=has_input,
        message="OK" if has_input else "Input de duracao deve ser number com min 10",
    ))

    # CRITICO: Duracao EDITAVEL em modo edicao (appointmentToEdit condiciona o disabled)
    # O disabled deve conter !appointmentToEdit para que no modo edicao fique habilitado
    edit_enabled = bool(re.search(r'disabled=\{.*!appointmentToEdit.*&&.*service_id.*\|\|\s*isPast', code))
    cat.results.append(TestResult(
        name="Duracao editavel quando appointmentToEdit existe",
        passed=edit_enabled,
        message="OK" if edit_enabled else "Duracao deve estar liberada no modo edicao (!appointmentToEdit && service_id)",
    ))

    # CRITICO: Duracao BLOQUEADA na criacao quando servico selecionado
    # Mesma regex - se !appointmentToEdit esta na condicao, criacao com service bloqueia
    create_locked = edit_enabled  # mesma logica, se o padrao correto existe
    cat.results.append(TestResult(
        name="Duracao bloqueada na criacao com servico selecionado",
        passed=create_locked,
        message="OK" if create_locked else "Na criacao, duracao deve ser bloqueada quando servico selecionado",
    ))

    return cat


# =============================================
# 4. DURACAO CALCULA END_TIME NO SUBMIT
# =============================================

def test_duration_calculates_end() -> TestCategory:
    cat = TestCategory("Duracao -> End Time no Submit")
    code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legivel", False, "Nao foi possivel ler"))
        return cat

    # addMinutes(startDateTime, values.duration)
    found = bool(re.search(r"addMinutes\(startDateTime,\s*values\.duration\s*\|\|\s*\d+\)", code))
    cat.results.append(TestResult(
        name="end_time calculado via addMinutes(start, duration)",
        passed=found,
        message="OK" if found else "Falta calculo de end_time a partir de duration",
    ))

    # duration no schema zod
    found = bool(re.search(r"duration:\s*z\.coerce\.number", code))
    cat.results.append(TestResult(
        name="Schema Zod: duration eh number",
        passed=found,
        message="OK" if found else "duration deve ser z.coerce.number no schema",
    ))

    # Validacao minima de 10 min no schema
    found = bool(re.search(r"duration\s*<\s*10", code))
    cat.results.append(TestResult(
        name="Validacao: duracao minima 10 min",
        passed=found,
        message="OK" if found else "Falta validacao de duracao minima no schema",
    ))

    return cat


# =============================================
# 5. OVERLAP CHECK NO SUBMIT
# =============================================

def test_overlap_on_submit() -> TestCategory:
    cat = TestCategory("Overlap Check no Submit")
    code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legivel", False, "Nao foi possivel ler"))
        return cat

    found = bool(re.search(r'supabase\.rpc\(\s*["\']check_appointment_overlap["\']', code))
    cat.results.append(TestResult(
        name="Chama RPC check_appointment_overlap",
        passed=found,
        message="OK" if found else "Nao chama check_appointment_overlap",
    ))

    found = bool(re.search(r"p_exclude_id:\s*appointmentToEdit\?\.id", code))
    cat.results.append(TestResult(
        name="Exclui proprio agendamento no overlap check",
        passed=found,
        message="OK" if found else "Falta p_exclude_id para auto-exclusao",
    ))

    found = bool(re.search(r"p_end_time:\s*endDateTime\.toISOString", code))
    cat.results.append(TestResult(
        name="end_time enviado ao overlap (calculado pela duracao)",
        passed=found,
        message="OK" if found else "Falta p_end_time no overlap check",
    ))

    return cat


# =============================================
# 6. GOOGLE CALENDAR SYNC
# =============================================

def test_google_calendar_sync() -> TestCategory:
    cat = TestCategory("Sincronizacao Google Calendar")
    code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legivel", False, "Nao foi possivel ler"))
        return cat

    found = bool(re.search(r'supabase\.functions\.invoke\(\s*["\']google-calendar-sync["\']', code))
    cat.results.append(TestResult(
        name="Invoca edge function google-calendar-sync",
        passed=found,
        message="OK" if found else "Nao invoca google-calendar-sync",
    ))

    found = bool(re.search(r'action:\s*["\']sync_appointment["\']', code))
    cat.results.append(TestResult(
        name="Action: sync_appointment",
        passed=found,
        message="OK" if found else "Falta action sync_appointment",
    ))

    found = bool(re.search(r'\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)', code))
    cat.results.append(TestResult(
        name="Fire-and-forget (.catch vazio)",
        passed=found,
        message="OK" if found else "Sync nao eh fire-and-forget",
    ))

    return cat


# =============================================
# 7. EDIT MODE POPULATES DURATION
# =============================================

def test_edit_mode_populates() -> TestCategory:
    cat = TestCategory("Modo Edicao Popula Duracao")
    code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legivel", False, "Nao foi possivel ler"))
        return cat

    # Duration calculated from end_time - start_time on edit
    found = bool(re.search(r"duration:.*end_time.*getTime.*start_time.*getTime.*60000", code))
    cat.results.append(TestResult(
        name="Duration calculada de (end - start) / 60000 no edit",
        passed=found,
        message="OK" if found else "Falta calculo de duracao a partir do agendamento existente",
    ))

    # appointmentToEdit populates form
    found = bool(re.search(r"if\s*\(appointmentToEdit\)\s*\{", code))
    cat.results.append(TestResult(
        name="Modo edicao popula formulario",
        passed=found,
        message="OK" if found else "Falta branch de edicao no useEffect",
    ))

    # isPast disables everything
    found = bool(re.search(r"isPast.*appointmentToEdit.*end_time.*new Date", code))
    cat.results.append(TestResult(
        name="isPast detecta agendamento passado",
        passed=found,
        message="OK" if found else "Falta deteccao de agendamento passado",
    ))

    return cat


# =============================================
# 8. QUERY INVALIDATION
# =============================================

def test_query_invalidation() -> TestCategory:
    cat = TestCategory("Invalidacao de Cache")
    code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not code:
        cat.results.append(TestResult("Arquivo legivel", False, "Nao foi possivel ler"))
        return cat

    found = bool(re.search(r'invalidateQueries.*queryKey.*\[.*["\']appointments["\']', code))
    cat.results.append(TestResult(
        name="Invalida cache: appointments",
        passed=found,
        message="OK" if found else "Nao invalida query 'appointments'",
    ))

    found = bool(re.search(r'invalidateQueries.*queryKey.*\[.*["\']contact-appointments["\']', code))
    cat.results.append(TestResult(
        name="Invalida cache: contact-appointments",
        passed=found,
        message="OK" if found else "Nao invalida query 'contact-appointments'",
    ))

    return cat


# =============================================
# 9. SECURITY
# =============================================

def test_security() -> TestCategory:
    cat = TestCategory("Seguranca")

    # ViewAppointmentModal - sem logica perigosa
    view_code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")
    if view_code:
        no_dangerous = "dangerouslySetInnerHTML" not in view_code
        cat.results.append(TestResult(
            name="ViewModal: sem dangerouslySetInnerHTML",
            passed=no_dangerous,
            message="OK" if no_dangerous else "dangerouslySetInnerHTML detectado",
        ))

        has_can_edit = "canEdit" in view_code
        cat.results.append(TestResult(
            name="ViewModal: protegido por canEdit",
            passed=has_can_edit,
            message="OK" if has_can_edit else "Falta verificacao canEdit",
        ))

    # AppointmentModal - validacoes server-side
    modal_code = read_file("src/components/scheduling/AppointmentModal.tsx")
    if modal_code:
        has_rpc = "supabase.rpc" in modal_code
        cat.results.append(TestResult(
            name="AppointmentModal: validacao server-side via RPC",
            passed=has_rpc,
            message="OK" if has_rpc else "Falta validacao server-side",
        ))

        has_catch = bool(re.search(r"catch\s*\(error", modal_code))
        cat.results.append(TestResult(
            name="AppointmentModal: error handling com try-catch",
            passed=has_catch,
            message="OK" if has_catch else "Falta tratamento de erro",
        ))

        has_auth = "supabase.auth.getUser" in modal_code
        cat.results.append(TestResult(
            name="AppointmentModal: verifica autenticacao",
            passed=has_auth,
            message="OK" if has_auth else "Falta verificacao de autenticacao",
        ))

    return cat


# =============================================
# 10. CONSISTENCY
# =============================================

def test_consistency() -> TestCategory:
    cat = TestCategory("Consistencia entre Modais")
    view_code = read_file("src/components/scheduling/ViewAppointmentModal.tsx")
    modal_code = read_file("src/components/scheduling/AppointmentModal.tsx")

    if not view_code or not modal_code:
        cat.results.append(TestResult("Arquivos legiveis", False, "Nao foi possivel ler os arquivos"))
        return cat

    # ViewModal redireciona para AppointmentModal via onEdit
    view_has_on_edit = "onEdit" in view_code
    cat.results.append(TestResult(
        name="ViewModal usa onEdit para abrir AppointmentModal",
        passed=view_has_on_edit,
        message="OK" if view_has_on_edit else "Falta callback onEdit no ViewModal",
    ))

    # AppointmentModal aceita appointmentToEdit
    modal_has_edit_prop = "appointmentToEdit" in modal_code
    cat.results.append(TestResult(
        name="AppointmentModal aceita appointmentToEdit prop",
        passed=modal_has_edit_prop,
        message="OK" if modal_has_edit_prop else "Falta prop appointmentToEdit",
    ))

    # Toda logica de edicao esta centralizada no AppointmentModal
    modal_has_update = bool(re.search(r'\.update\(payload\)', modal_code))
    view_no_update = ".update(" not in view_code
    cat.results.append(TestResult(
        name="Logica de update centralizada no AppointmentModal",
        passed=modal_has_update and view_no_update,
        message="OK" if modal_has_update and view_no_update else "Update deve estar apenas no AppointmentModal",
    ))

    # Google Calendar sync apenas no AppointmentModal
    modal_has_sync = "google-calendar-sync" in modal_code
    view_no_sync = "google-calendar-sync" not in view_code
    cat.results.append(TestResult(
        name="Google Calendar sync apenas no AppointmentModal",
        passed=modal_has_sync and view_no_sync,
        message="OK" if modal_has_sync and view_no_sync else "Sync deve estar apenas no AppointmentModal",
    ))

    return cat


# =============================================
# RUNNER
# =============================================

def main():
    categories = [
        test_file_structure(),
        test_view_modal_clean(),
        test_duration_field(),
        test_duration_calculates_end(),
        test_overlap_on_submit(),
        test_google_calendar_sync(),
        test_edit_mode_populates(),
        test_query_invalidation(),
        test_security(),
        test_consistency(),
    ]

    total_passed = 0
    total_failed = 0

    print("=" * 60)
    print("  TESTES: Edicao de Duracao de Agendamentos")
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
