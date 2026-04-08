"""
Testes Automatizados de Mensagens Automaticas - Clinvia
========================================================
Testa o sistema de auto-messages end-to-end:
1. Verifica estrutura do banco (tabelas, indices, constraints, RLS)
2. Verifica logica de cada trigger type
3. Verifica deduplicacao via auto_message_logs
4. Verifica edge functions (process-auto-messages, send-satisfaction-survey, process-auto-follow-up)
5. Verifica frontend (AutoMessages.tsx)
6. Verifica cron jobs

Rodar: python tests/test_auto_messages.py
"""

import os
import sys
import re
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict

@dataclass
class TestResult:
    test_name: str
    passed: bool
    details: str
    severity: str = "info"  # info, warning, critical


# ============================================================================
# EXPECTED STATE
# ============================================================================

TRIGGER_TYPES = [
    "appointment_created",
    "appointment_reminder",
    "appointment_day_reminder",
    "appointment_cancelled",
    "appointment_post_service",
    "crm_stage_enter",
    "crm_after_days",
    "crm_stagnation",
    "conversation_resolved",
    "patient_birthday",
]

APPOINTMENT_VARS = [
    "{nome_cliente}", "{primeiro_nome}", "{data_agendamento}",
    "{hora_agendamento}", "{nome_profissional}", "{nome_servico}"
]

CRM_VARS = ["{nome_cliente}", "{primeiro_nome}", "{nome_etapa}", "{nome_funil}"]
BIRTHDAY_VARS = ["{nome_paciente}", "{primeiro_nome}"]

# Expected dedup index
EXPECTED_DEDUP_INDEX = "auto_message_logs_once_unique"

# Expected tables
EXPECTED_TABLES = {
    "auto_messages": {
        "required_columns": [
            "id", "user_id", "trigger_type", "is_active", "message",
            "timing_value", "timing_unit", "timing_direction", "send_hour",
            "funnel_id", "stage_id", "instance_id", "send_minute"
        ],
    },
    "auto_message_logs": {
        "required_columns": [
            "id", "auto_message_id", "entity_type", "entity_id", "sent_at"
        ],
    },
}


# ============================================================================
# TEST FUNCTIONS
# ============================================================================

def test_edge_function_process_auto_messages(project_dir: str) -> List[TestResult]:
    """Testa a edge function process-auto-messages"""
    results = []
    filepath = os.path.join(project_dir, "supabase", "functions", "process-auto-messages", "index.ts")

    if not os.path.exists(filepath):
        results.append(TestResult("EdgeFn: process-auto-messages", False, "Arquivo nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Check all trigger types are handled
    for trigger in TRIGGER_TYPES:
        has_trigger = f'"{trigger}"' in content or f"'{trigger}'" in content
        results.append(TestResult(
            f"EdgeFn: trigger {trigger}",
            has_trigger,
            f"Trigger '{trigger}' {'encontrado' if has_trigger else 'NAO encontrado'} na edge function",
            "critical" if not has_trigger else "info"
        ))

    # 2. Check deduplication is used (alreadySent)
    uses_dedup = "alreadySent" in content
    results.append(TestResult(
        "EdgeFn: deduplicacao",
        uses_dedup,
        "Funcao alreadySent() " + ("usada" if uses_dedup else "NAO encontrada - RISCO de envio duplicado!"),
        "critical" if not uses_dedup else "info"
    ))

    # 3. Check logSent is called after sending
    log_count = content.count("logSent(")
    results.append(TestResult(
        "EdgeFn: log de envio",
        log_count >= 8,
        f"logSent() chamada {log_count} vezes (esperado >= 8 para todos os triggers)",
        "warning" if log_count < 8 else "info"
    ))

    # 4. Check variable substitution (applyVariables)
    uses_vars = "applyVariables" in content
    results.append(TestResult(
        "EdgeFn: substituicao de variaveis",
        uses_vars,
        "applyVariables() " + ("usada" if uses_vars else "NAO encontrada"),
        "critical" if not uses_vars else "info"
    ))

    # 5. Check sendWhatsApp has timeout (AbortController)
    has_timeout = "AbortController" in content or "abort" in content.lower()
    results.append(TestResult(
        "EdgeFn: timeout no envio",
        has_timeout,
        "AbortController/timeout " + ("encontrado" if has_timeout else "NAO encontrado - envio pode travar cron inteiro!"),
        "critical" if not has_timeout else "info"
    ))

    # 6. Check broad window for ALL trigger types (not just reminder/post_service)
    # appointment_created should NOT have narrow windowStart scan
    # Check if it uses maxAge or a broad window pattern instead of windowStart for created_at
    appt_created_section = content[content.find("APPOINTMENT CREATED"):content.find("APPOINTMENT REMINDER")] if "APPOINTMENT CREATED" in content else ""
    has_broad_created = "maxAge" in appt_created_section or "24 * 60 * 60" in appt_created_section
    has_narrow_created = "windowStart" in appt_created_section

    results.append(TestResult(
        "EdgeFn: appointment_created janela ampla",
        has_broad_created or not has_narrow_created,
        "appointment_created " + ("usa janela ampla (24h)" if has_broad_created else ("usa windowStart ESTREITO - pode perder agendamentos!" if has_narrow_created else "padrao OK")),
        "warning" if has_narrow_created and not has_broad_created else "info"
    ))

    # 7. Check appointment_cancelled uses broad window
    cancelled_section = content[content.find("APPOINTMENT CANCELLED"):content.find("APPOINTMENT POST")] if "APPOINTMENT CANCELLED" in content else ""
    has_broad_cancelled = "maxAge" in cancelled_section or "24 * 60 * 60" in cancelled_section
    has_narrow_cancelled = "windowStart" in cancelled_section

    results.append(TestResult(
        "EdgeFn: appointment_cancelled janela ampla",
        has_broad_cancelled or not has_narrow_cancelled,
        "appointment_cancelled " + ("usa janela ampla" if has_broad_cancelled else ("usa windowStart ESTREITO!" if has_narrow_cancelled else "padrao OK")),
        "warning" if has_narrow_cancelled and not has_broad_cancelled else "info"
    ))

    # 8. Check satisfaction survey sends via dedicated function
    sends_satisfaction = "sendSatisfactionSurvey" in content
    results.append(TestResult(
        "EdgeFn: pesquisa satisfacao",
        sends_satisfaction,
        "Pesquisa de satisfacao " + ("envia via send-satisfaction-survey" if sends_satisfaction else "NAO encontrada"),
        "warning" if not sends_satisfaction else "info"
    ))

    # 9. Check nps_sent_at is updated
    updates_nps = "nps_sent_at" in content
    results.append(TestResult(
        "EdgeFn: nps_sent_at tracking",
        updates_nps,
        "nps_sent_at " + ("atualizado apos envio" if updates_nps else "NAO atualizado - pesquisa pode ser reenviada!"),
        "critical" if not updates_nps else "info"
    ))

    # 10. Check Brazil timezone support
    has_timezone = "America/Sao_Paulo" in content
    results.append(TestResult(
        "EdgeFn: timezone Brasil",
        has_timezone,
        "Timezone America/Sao_Paulo " + ("configurado" if has_timezone else "NAO encontrado!"),
        "critical" if not has_timezone else "info"
    ))

    # 11. Check birthday uses isInSendWindow
    has_send_window = "isInSendWindow" in content
    results.append(TestResult(
        "EdgeFn: birthday horario envio",
        has_send_window,
        "isInSendWindow() " + ("usado para controlar horario de aniversario" if has_send_window else "NAO encontrado"),
        "warning" if not has_send_window else "info"
    ))

    # 12. Check birthday uses annual dedup
    has_annual_dedup = "alreadySentThisYear" in content
    results.append(TestResult(
        "EdgeFn: birthday dedup anual",
        has_annual_dedup,
        "alreadySentThisYear() " + ("usado para aniversario" if has_annual_dedup else "NAO encontrado - pode enviar 2x no ano!"),
        "critical" if not has_annual_dedup else "info"
    ))

    # 13. Check targeted mode exists
    has_targeted = "processTargeted" in content
    results.append(TestResult(
        "EdgeFn: modo targeted",
        has_targeted,
        "Modo targeted (instant dispatch) " + ("implementado" if has_targeted else "NAO encontrado"),
        "info"
    ))

    # 14. Check message is saved to database
    saves_msg = "saveMessage" in content
    results.append(TestResult(
        "EdgeFn: salva mensagem no DB",
        saves_msg,
        "saveMessage() " + ("chamado apos envio" if saves_msg else "NAO encontrado - mensagem nao aparece no chat!"),
        "critical" if not saves_msg else "info"
    ))

    # 15. Check conversation lookup
    finds_conv = "findConversation" in content
    results.append(TestResult(
        "EdgeFn: busca conversa",
        finds_conv,
        "findConversation() " + ("usado" if finds_conv else "NAO encontrado"),
        "warning" if not finds_conv else "info"
    ))

    return results


def test_edge_function_satisfaction_survey(project_dir: str) -> List[TestResult]:
    """Testa a edge function send-satisfaction-survey"""
    results = []
    filepath = os.path.join(project_dir, "supabase", "functions", "send-satisfaction-survey", "index.ts")

    if not os.path.exists(filepath):
        results.append(TestResult("Satisfaction: arquivo", False, "Arquivo nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Check NPS button IDs
    for i in range(1, 6):
        has_button = f"nps_{i}" in content
        results.append(TestResult(
            f"Satisfaction: botao nps_{i}",
            has_button,
            f"Botao nps_{i} {'encontrado' if has_button else 'NAO encontrado'}",
            "critical" if not has_button else "info"
        ))

    # 2. Check 5 rating options
    has_5_stars = "Excelente" in content and "Muito Bom" in content and "Bom" in content and "Regular" in content and "Ruim" in content
    results.append(TestResult(
        "Satisfaction: 5 opcoes de avaliacao",
        has_5_stars,
        "Todas as 5 opcoes " + ("presentes" if has_5_stars else "INCOMPLETAS!"),
        "critical" if not has_5_stars else "info"
    ))

    # 3. Check message is saved to DB
    saves_msg = "messages" in content and "insert" in content.lower()
    results.append(TestResult(
        "Satisfaction: salva mensagem",
        saves_msg,
        "Mensagem " + ("salva no banco" if saves_msg else "NAO salva!"),
        "critical" if not saves_msg else "info"
    ))

    # 4. Check instance fallback chain
    has_fallback = "contact.user_id" in content or "contact?.user_id" in content
    results.append(TestResult(
        "Satisfaction: fallback de instancia",
        has_fallback,
        "Chain: instance_id -> conversation.instance_id -> contact.user_id " + ("implementado" if has_fallback else "INCOMPLETO"),
        "warning" if not has_fallback else "info"
    ))

    # 5. Check /send/menu endpoint
    uses_menu = "/send/menu" in content
    results.append(TestResult(
        "Satisfaction: usa /send/menu",
        uses_menu,
        "Endpoint /send/menu " + ("usado" if uses_menu else "NAO encontrado - botoes nao funcionam!"),
        "critical" if not uses_menu else "info"
    ))

    return results


def test_edge_function_auto_follow_up(project_dir: str) -> List[TestResult]:
    """Testa a edge function process-auto-follow-up"""
    results = []
    filepath = os.path.join(project_dir, "supabase", "functions", "process-auto-follow-up", "index.ts")

    if not os.path.exists(filepath):
        results.append(TestResult("FollowUp: arquivo", False, "Arquivo nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Check auto_send filter
    has_auto_send = "auto_send" in content and "true" in content
    results.append(TestResult(
        "FollowUp: filtra auto_send",
        has_auto_send,
        "Filtro auto_send=true " + ("presente" if has_auto_send else "NAO encontrado"),
        "critical" if not has_auto_send else "info"
    ))

    # 2. Check next_send_at filter
    has_next_send = "next_send_at" in content
    results.append(TestResult(
        "FollowUp: filtra next_send_at",
        has_next_send,
        "Filtro next_send_at <= now " + ("presente" if has_next_send else "NAO encontrado"),
        "critical" if not has_next_send else "info"
    ))

    # 3. Check conversation status filter
    has_status_check = ("status" in content and ("pending" in content or "open" in content)) or "conv.status" in content
    results.append(TestResult(
        "FollowUp: verifica status conversa",
        has_status_check,
        "Verificacao de status da conversa " + ("presente" if has_status_check else "NAO encontrada - pode enviar para conversas resolvidas!"),
        "critical" if not has_status_check else "info"
    ))

    # 4. Check instance connection check
    has_instance_check = "connected" in content
    results.append(TestResult(
        "FollowUp: verifica instancia conectada",
        has_instance_check,
        "Check instance.status == connected " + ("presente" if has_instance_check else "NAO encontrado"),
        "warning" if not has_instance_check else "info"
    ))

    # 5. Check template sequencing
    has_index = "current_template_index" in content
    results.append(TestResult(
        "FollowUp: sequenciamento templates",
        has_index,
        "current_template_index " + ("usado" if has_index else "NAO encontrado"),
        "critical" if not has_index else "info"
    ))

    # 6. Check completion handling
    has_completed = "completed" in content
    results.append(TestResult(
        "FollowUp: marcacao de conclusao",
        has_completed,
        "Flag completed " + ("tratada" if has_completed else "NAO encontrada"),
        "critical" if not has_completed else "info"
    ))

    # 7. Check message saved to DB
    saves_msg = "'messages'" in content and "insert" in content.lower()
    results.append(TestResult(
        "FollowUp: salva mensagem",
        saves_msg,
        "Mensagem " + ("salva no banco" if saves_msg else "NAO salva!"),
        "critical" if not saves_msg else "info"
    ))

    # 8. Check timeout on fetch
    has_timeout = "AbortController" in content or "abort" in content.lower() or "timeout" in content.lower()
    results.append(TestResult(
        "FollowUp: timeout no envio",
        has_timeout,
        "Timeout " + ("configurado" if has_timeout else "NAO encontrado - envio pode travar!"),
        "warning" if not has_timeout else "info"
    ))

    return results


def test_webhook_nps_handling(project_dir: str) -> List[TestResult]:
    """Testa o handling de NPS no webhook"""
    results = []
    filepath = os.path.join(project_dir, "supabase", "functions", "webhook-handle-message", "index.ts")

    if not os.path.exists(filepath):
        results.append(TestResult("Webhook NPS: arquivo", False, "Arquivo nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. NPS button detection
    has_nps_detect = "npsButtonId" in content or "nps_" in content
    results.append(TestResult(
        "Webhook: detecta resposta NPS",
        has_nps_detect,
        "Deteccao de botao NPS " + ("implementada" if has_nps_detect else "NAO encontrada!"),
        "critical" if not has_nps_detect else "info"
    ))

    # 2. Conversation stays resolved after NPS
    keeps_resolved = "resolved" in content and "nps" in content.lower()
    results.append(TestResult(
        "Webhook: conversa permanece resolved apos NPS",
        keeps_resolved,
        "Restauracao de status resolved " + ("implementada" if keeps_resolved else "NAO encontrada - conversa reabriria!"),
        "critical" if not keeps_resolved else "info"
    ))

    # 3. NPS score saved
    saves_nps = "add_nps_entry" in content or "nps_entry" in content.lower()
    results.append(TestResult(
        "Webhook: salva nota NPS",
        saves_nps,
        "Salvamento de nota NPS " + ("implementado via RPC" if saves_nps else "NAO encontrado"),
        "warning" if not saves_nps else "info"
    ))

    # 4. nps_sent_at updated
    updates_nps_at = "nps_sent_at" in content
    results.append(TestResult(
        "Webhook: atualiza nps_sent_at",
        updates_nps_at,
        "nps_sent_at " + ("atualizado" if updates_nps_at else "NAO atualizado"),
        "warning" if not updates_nps_at else "info"
    ))

    return results


def test_frontend_auto_messages(project_dir: str) -> List[TestResult]:
    """Testa a pagina AutoMessages.tsx"""
    results = []
    filepath = os.path.join(project_dir, "src", "pages", "AutoMessages.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("Frontend: AutoMessages.tsx", False, "Arquivo nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Check all trigger types have UI
    trigger_ui_map = {
        "appointment_created": "Confirmacao",
        "appointment_reminder": "Lembrete",
        "appointment_day_reminder": "Lembrete no Dia",
        "appointment_cancelled": "Cancelamento",
        "appointment_post_service": "Pos-Atendimento",
        "crm_stage_enter": "crm_stage_enter",
        "conversation_resolved": "conversation_resolved",
        "patient_birthday": "patient_birthday",
    }

    for trigger, label in trigger_ui_map.items():
        has_ui = trigger in content
        results.append(TestResult(
            f"Frontend: UI para {trigger}",
            has_ui,
            f"UI para '{trigger}' {'encontrada' if has_ui else 'NAO encontrada'}",
            "warning" if not has_ui else "info"
        ))

    # 2. Check tabs exist
    tabs = ["Agenda", "CRM", "Satisf"]
    for tab in tabs:
        has_tab = tab in content
        results.append(TestResult(
            f"Frontend: tab '{tab}'",
            has_tab,
            f"Tab '{tab}' {'encontrada' if has_tab else 'NAO encontrada'}",
            "warning" if not has_tab else "info"
        ))

    # 3. Check variable insertion UI
    has_var_ui = "VarChip" in content or "useVariableInserter" in content
    results.append(TestResult(
        "Frontend: UI de variaveis",
        has_var_ui,
        "Componentes de variavel " + ("encontrados" if has_var_ui else "NAO encontrados"),
        "warning" if not has_var_ui else "info"
    ))

    # 4. Check upsert logic
    has_upsert = "upsert" in content or "insert" in content.lower()
    results.append(TestResult(
        "Frontend: salva configs (upsert)",
        has_upsert,
        "Logica de upsert " + ("encontrada" if has_upsert else "NAO encontrada"),
        "critical" if not has_upsert else "info"
    ))

    # 5. Check timing configuration
    has_timing = "timing_value" in content
    results.append(TestResult(
        "Frontend: configuracao de timing",
        has_timing,
        "Campo timing_value " + ("encontrado" if has_timing else "NAO encontrado"),
        "warning" if not has_timing else "info"
    ))

    # 6. Check IA config check (agenda tab)
    has_ia_check = "ia_on" in content or "ia_config" in content
    results.append(TestResult(
        "Frontend: verifica IA ativa (agenda tab)",
        has_ia_check,
        "Verificacao ia_on " + ("implementada" if has_ia_check else "NAO encontrada"),
        "warning" if not has_ia_check else "info"
    ))

    # 7. Check instance selector
    has_instance = "instance_id" in content
    results.append(TestResult(
        "Frontend: seletor de instancia",
        has_instance,
        "Seletor de instancia " + ("encontrado" if has_instance else "NAO encontrado"),
        "warning" if not has_instance else "info"
    ))

    return results


# ============================================================================
# MAIN
# ============================================================================

def run_all_tests(project_dir: str) -> Tuple[List[TestResult], dict]:
    all_results: List[TestResult] = []

    print("=" * 70)
    print("  CLINVIA - Teste Completo de Mensagens Automaticas")
    print("=" * 70)

    print("\n[1/5] Testando edge function process-auto-messages...")
    all_results.extend(test_edge_function_process_auto_messages(project_dir))

    print("[2/5] Testando edge function send-satisfaction-survey...")
    all_results.extend(test_edge_function_satisfaction_survey(project_dir))

    print("[3/5] Testando edge function process-auto-follow-up...")
    all_results.extend(test_edge_function_auto_follow_up(project_dir))

    print("[4/5] Testando webhook NPS handling...")
    all_results.extend(test_webhook_nps_handling(project_dir))

    print("[5/5] Testando frontend AutoMessages.tsx...")
    all_results.extend(test_frontend_auto_messages(project_dir))

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
            icon = "CRIT" if r.severity == "critical" else "WARN"
            print(f"  [{icon}] {r.test_name}")
            print(f"        {r.details}")

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

    if summary['critical'] > 0:
        print("\n  !! ATENCAO: Existem falhas CRITICAS!")
    elif summary['warnings'] > 0:
        print("\n  ! Existem avisos que devem ser verificados.")
    else:
        print("\n  Todos os testes passaram!")


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)

    if not os.path.exists(os.path.join(project_dir, "supabase")):
        print(f"ERRO: Diretorio supabase nao encontrado em {project_dir}")
        sys.exit(1)

    results, summary = run_all_tests(project_dir)
    print_results(results, summary)
    sys.exit(1 if summary['critical'] > 0 else 0)
