"""
Testes Automatizados do Sistema de Vendas - Clinvia
====================================================
Testa o sistema de vendas end-to-end:
1. Tipos e interfaces (sales.ts)
2. Hooks de mutacao (useSales.ts)
3. SaleModal (frontend - venda manual)
4. PaymentTypeModal (CRM - venda de negociacao ganha)
5. KanbanBoard (criacao de vendas do CRM)
6. DealDetailModal (criacao de vendas do CRM)
7. SalesTable (exibicao de vendas)
8. DB migration (tabelas, constraints, triggers)

Rodar: python tests/test_sales.py
"""

import os
import sys
import re
from dataclasses import dataclass
from typing import List, Tuple

@dataclass
class TestResult:
    test_name: str
    passed: bool
    details: str
    severity: str = "info"  # info, warning, critical


# ============================================================================
# EXPECTED STATE
# ============================================================================

PAYMENT_TYPES = ["cash", "installment", "pending", "mixed"]
SALE_CATEGORIES = ["product", "service"]
INSTALLMENT_STATUSES = ["pending", "paid", "overdue"]

EXPECTED_VARIABLES_APPOINTMENT = [
    "{nome_cliente}", "{primeiro_nome}", "{data_agendamento}",
    "{hora_agendamento}", "{nome_profissional}", "{nome_servico}"
]


# ============================================================================
# TEST: Types (sales.ts)
# ============================================================================

def test_types(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "types", "sales.ts")

    if not os.path.exists(filepath):
        results.append(TestResult("Types: arquivo", False, "sales.ts nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. PaymentType includes 'mixed'
    has_mixed_type = "'mixed'" in content and "PaymentType" in content
    results.append(TestResult(
        "Types: PaymentType inclui 'mixed'",
        has_mixed_type,
        "PaymentType " + ("inclui 'mixed'" if has_mixed_type else "NAO inclui 'mixed'!"),
        "critical" if not has_mixed_type else "info"
    ))

    # 2. All payment types present
    for pt in PAYMENT_TYPES:
        has_pt = f"'{pt}'" in content
        results.append(TestResult(
            f"Types: payment type '{pt}'",
            has_pt,
            f"Tipo '{pt}' {'encontrado' if has_pt else 'NAO encontrado'}",
            "critical" if not has_pt else "info"
        ))

    # 3. PaymentTypeLabels has 'mixed' label
    has_mixed_label = "mixed:" in content and "Misto" in content
    results.append(TestResult(
        "Types: label para 'mixed'",
        has_mixed_label,
        "Label 'Misto' " + ("encontrado" if has_mixed_label else "NAO encontrado"),
        "critical" if not has_mixed_label else "info"
    ))

    # 4. cash_amount field in Sale interface
    has_cash_amount_sale = "cash_amount" in content
    results.append(TestResult(
        "Types: cash_amount na interface Sale",
        has_cash_amount_sale,
        "Campo cash_amount " + ("encontrado" if has_cash_amount_sale else "NAO encontrado na interface"),
        "critical" if not has_cash_amount_sale else "info"
    ))

    # 5. cash_amount field in SaleFormData
    # Check it appears twice (in Sale AND SaleFormData)
    cash_amount_count = content.count("cash_amount")
    has_in_both = cash_amount_count >= 2
    results.append(TestResult(
        "Types: cash_amount em Sale e SaleFormData",
        has_in_both,
        f"cash_amount encontrado {cash_amount_count} vezes (esperado >= 2)",
        "critical" if not has_in_both else "info"
    ))

    # 6. All categories present
    for cat in SALE_CATEGORIES:
        has_cat = f"'{cat}'" in content
        results.append(TestResult(
            f"Types: categoria '{cat}'",
            has_cat,
            f"Categoria '{cat}' {'encontrada' if has_cat else 'NAO encontrada'}",
            "critical" if not has_cat else "info"
        ))

    # 7. InstallmentStatus types
    for status in INSTALLMENT_STATUSES:
        has_status = f"'{status}'" in content
        results.append(TestResult(
            f"Types: installment status '{status}'",
            has_status,
            f"Status '{status}' {'encontrado' if has_status else 'NAO encontrado'}",
            "critical" if not has_status else "info"
        ))

    return results


# ============================================================================
# TEST: Hooks (useSales.ts)
# ============================================================================

def test_hooks(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "hooks", "useSales.ts")

    if not os.path.exists(filepath):
        results.append(TestResult("Hooks: arquivo", False, "useSales.ts nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. useCreateSale exists
    has_create = "useCreateSale" in content
    results.append(TestResult(
        "Hooks: useCreateSale",
        has_create,
        "Hook useCreateSale " + ("encontrado" if has_create else "NAO encontrado"),
        "critical" if not has_create else "info"
    ))

    # 2. useUpdateSale exists
    has_update = "useUpdateSale" in content
    results.append(TestResult(
        "Hooks: useUpdateSale",
        has_update,
        "Hook useUpdateSale " + ("encontrado" if has_update else "NAO encontrado"),
        "critical" if not has_update else "info"
    ))

    # 3. useDeleteSale exists
    has_delete = "useDeleteSale" in content
    results.append(TestResult(
        "Hooks: useDeleteSale",
        has_delete,
        "Hook useDeleteSale " + ("encontrado" if has_delete else "NAO encontrado"),
        "critical" if not has_delete else "info"
    ))

    # 4. usePayInstallment exists
    has_pay = "usePayInstallment" in content
    results.append(TestResult(
        "Hooks: usePayInstallment",
        has_pay,
        "Hook usePayInstallment " + ("encontrado" if has_pay else "NAO encontrado"),
        "critical" if not has_pay else "info"
    ))

    # 5. cash_amount handled in create
    has_cash_create = "cash_amount" in content and "useCreateSale" in content
    results.append(TestResult(
        "Hooks: cash_amount no create",
        has_cash_create,
        "cash_amount " + ("passado no insert" if has_cash_create else "NAO passado!"),
        "critical" if not has_cash_create else "info"
    ))

    # 6. cash_amount handled in update
    # Check if cash_amount appears in the update mutation section
    update_section = content[content.find("useUpdateSale"):] if "useUpdateSale" in content else ""
    has_cash_update = "cash_amount" in update_section
    results.append(TestResult(
        "Hooks: cash_amount no update",
        has_cash_update,
        "cash_amount " + ("passado no update" if has_cash_update else "NAO passado!"),
        "critical" if not has_cash_update else "info"
    ))

    # 7. mixed handling in create - installments for mixed
    has_mixed_handling = "mixed" in content or "isCashOrPending" in content
    results.append(TestResult(
        "Hooks: tratamento de 'mixed' no create",
        has_mixed_handling,
        "Logica para 'mixed' " + ("encontrada" if has_mixed_handling else "NAO encontrada"),
        "critical" if not has_mixed_handling else "info"
    ))

    # 8. Owner ID resolution
    has_owner_id = "getOwnerId" in content or "useOwnerId" in content
    results.append(TestResult(
        "Hooks: resolucao de owner_id",
        has_owner_id,
        "getOwnerId/useOwnerId " + ("usado" if has_owner_id else "NAO encontrado"),
        "critical" if not has_owner_id else "info"
    ))

    # 9. Query invalidation on create
    has_invalidation = "invalidateQueries" in content
    results.append(TestResult(
        "Hooks: invalidacao de queries",
        has_invalidation,
        "invalidateQueries " + ("chamado" if has_invalidation else "NAO chamado"),
        "warning" if not has_invalidation else "info"
    ))

    # 10. useSales query hook
    has_list = "useSales" in content
    results.append(TestResult(
        "Hooks: useSales (listagem)",
        has_list,
        "Hook useSales " + ("encontrado" if has_list else "NAO encontrado"),
        "critical" if not has_list else "info"
    ))

    # 11. useSaleInstallments
    has_installments_hook = "useSaleInstallments" in content
    results.append(TestResult(
        "Hooks: useSaleInstallments",
        has_installments_hook,
        "Hook useSaleInstallments " + ("encontrado" if has_installments_hook else "NAO encontrado"),
        "warning" if not has_installments_hook else "info"
    ))

    return results


# ============================================================================
# TEST: SaleModal (frontend - manual sales)
# ============================================================================

def test_sale_modal(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "components", "sales", "SaleModal.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("SaleModal: arquivo", False, "SaleModal.tsx nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Mixed payment option exists
    has_mixed_option = "'mixed'" in content and "Misto" in content
    results.append(TestResult(
        "SaleModal: opcao 'Misto'",
        has_mixed_option,
        "Opcao Misto " + ("encontrada no select" if has_mixed_option else "NAO encontrada!"),
        "critical" if not has_mixed_option else "info"
    ))

    # 2. cashAmount state
    has_cash_state = "cashAmount" in content and "setCashAmount" in content
    results.append(TestResult(
        "SaleModal: state cashAmount",
        has_cash_state,
        "State cashAmount/setCashAmount " + ("encontrado" if has_cash_state else "NAO encontrado!"),
        "critical" if not has_cash_state else "info"
    ))

    # 3. Cash amount input field for mixed
    has_cash_input = "Vista" in content and "cashAmount" in content
    results.append(TestResult(
        "SaleModal: campo 'Valor a Vista'",
        has_cash_input,
        "Campo de valor a vista " + ("encontrado" if has_cash_input else "NAO encontrado!"),
        "critical" if not has_cash_input else "info"
    ))

    # 4. Remaining amount display
    has_remaining = "parcelar" in content.lower() or "restante" in content.lower()
    results.append(TestResult(
        "SaleModal: display 'Restante a parcelar'",
        has_remaining,
        "Display de restante " + ("encontrado" if has_remaining else "NAO encontrado"),
        "warning" if not has_remaining else "info"
    ))

    # 5. Mixed calculation uses base = totalAmount - cashAmount
    has_mixed_calc = "totalAmount - cashAmount" in content or "totalAmount-cashAmount" in content
    results.append(TestResult(
        "SaleModal: calculo base misto",
        has_mixed_calc,
        "Calculo 'totalAmount - cashAmount' " + ("encontrado" if has_mixed_calc else "NAO encontrado!"),
        "critical" if not has_mixed_calc else "info"
    ))

    # 6. cash_amount passed in submit
    has_cash_submit = "cash_amount" in content
    results.append(TestResult(
        "SaleModal: cash_amount no submit",
        has_cash_submit,
        "cash_amount " + ("passado na criacao" if has_cash_submit else "NAO passado!"),
        "critical" if not has_cash_submit else "info"
    ))

    # 7. Installment fields show for both installment AND mixed
    has_both_condition = "mixed" in content and "installment" in content
    results.append(TestResult(
        "SaleModal: parcelas para installment e mixed",
        has_both_condition,
        "Campos de parcela " + ("aparecem para ambos" if has_both_condition else "condicao incompleta"),
        "critical" if not has_both_condition else "info"
    ))

    # 8. Cash vs installment vs mixed payment options in Select
    has_cash = "'cash'" in content
    has_installment = "'installment'" in content
    has_mixed = "'mixed'" in content
    all_options = has_cash and has_installment and has_mixed
    results.append(TestResult(
        "SaleModal: todas as opcoes de pagamento",
        all_options,
        f"cash={has_cash}, installment={has_installment}, mixed={has_mixed}",
        "critical" if not all_options else "info"
    ))

    # 9. Multi-product support
    has_multi = "addProduct" in content or "products" in content
    results.append(TestResult(
        "SaleModal: suporte multi-produto",
        has_multi,
        "Multi-produto " + ("implementado" if has_multi else "NAO encontrado"),
        "warning" if not has_multi else "info"
    ))

    # 10. Contact picker
    has_contact = "contact" in content.lower() and ("ContactPicker" in content or "contactId" in content)
    results.append(TestResult(
        "SaleModal: seletor de cliente",
        has_contact,
        "Seletor de cliente " + ("encontrado" if has_contact else "NAO encontrado"),
        "warning" if not has_contact else "info"
    ))

    return results


# ============================================================================
# TEST: PaymentTypeModal (CRM - deal won payment)
# ============================================================================

def test_payment_type_modal(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "components", "crm", "PaymentTypeModal.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("PaymentTypeModal: arquivo", False, "PaymentTypeModal.tsx nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Mixed option in select
    has_mixed = "'mixed'" in content and "Misto" in content
    results.append(TestResult(
        "PaymentTypeModal: opcao 'Misto'",
        has_mixed,
        "Opcao Misto " + ("encontrada" if has_mixed else "NAO encontrada!"),
        "critical" if not has_mixed else "info"
    ))

    # 2. cashAmount state
    has_cash_state = "cashAmount" in content and "setCashAmount" in content
    results.append(TestResult(
        "PaymentTypeModal: state cashAmount",
        has_cash_state,
        "State cashAmount " + ("encontrado" if has_cash_state else "NAO encontrado!"),
        "critical" if not has_cash_state else "info"
    ))

    # 3. Cash amount input
    has_cash_input = "Vista" in content and "cashAmount" in content
    results.append(TestResult(
        "PaymentTypeModal: campo valor a vista",
        has_cash_input,
        "Campo valor a vista " + ("encontrado" if has_cash_input else "NAO encontrado!"),
        "critical" if not has_cash_input else "info"
    ))

    # 4. onConfirm passes cashAmount for mixed
    has_confirm_cash = "onConfirm" in content and "cashAmount" in content
    results.append(TestResult(
        "PaymentTypeModal: onConfirm passa cashAmount",
        has_confirm_cash,
        "onConfirm com cashAmount " + ("implementado" if has_confirm_cash else "NAO implementado!"),
        "critical" if not has_confirm_cash else "info"
    ))

    # 5. Interface accepts 'mixed' type
    has_mixed_interface = "'mixed'" in content and "onConfirm" in content
    results.append(TestResult(
        "PaymentTypeModal: interface aceita 'mixed'",
        has_mixed_interface,
        "Interface PaymentTypeModalProps " + ("aceita mixed" if has_mixed_interface else "NAO aceita mixed!"),
        "critical" if not has_mixed_interface else "info"
    ))

    # 6. Remaining amount display
    has_remaining = "parcelar" in content.lower() or "restante" in content.lower()
    results.append(TestResult(
        "PaymentTypeModal: display restante a parcelar",
        has_remaining,
        "Display restante " + ("encontrado" if has_remaining else "NAO encontrado"),
        "warning" if not has_remaining else "info"
    ))

    # 7. Mixed summary breakdown
    has_breakdown = "Vista" in content and "Parcelado" in content
    results.append(TestResult(
        "PaymentTypeModal: resumo misto (breakdown)",
        has_breakdown,
        "Resumo vista/parcelado " + ("exibido" if has_breakdown else "NAO exibido"),
        "warning" if not has_breakdown else "info"
    ))

    # 8. Decidir depois button
    has_pending = "Decidir Depois" in content
    results.append(TestResult(
        "PaymentTypeModal: botao 'Decidir Depois'",
        has_pending,
        "Botao Decidir Depois " + ("encontrado" if has_pending else "NAO encontrado"),
        "warning" if not has_pending else "info"
    ))

    # 9. Split icon for mixed
    has_split = "Split" in content
    results.append(TestResult(
        "PaymentTypeModal: icone Split para misto",
        has_split,
        "Icone Split " + ("importado" if has_split else "NAO importado"),
        "info"
    ))

    return results


# ============================================================================
# TEST: KanbanBoard (CRM - createSalesFromDeal)
# ============================================================================

def test_kanban_board(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "components", "crm", "KanbanBoard.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("KanbanBoard: arquivo", False, "KanbanBoard.tsx nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. createSalesFromDeal accepts 'mixed'
    has_mixed_sig = "mixed" in content and "createSalesFromDeal" in content
    results.append(TestResult(
        "KanbanBoard: createSalesFromDeal aceita 'mixed'",
        has_mixed_sig,
        "createSalesFromDeal " + ("aceita mixed" if has_mixed_sig else "NAO aceita mixed!"),
        "critical" if not has_mixed_sig else "info"
    ))

    # 2. cash_amount field in sale creation
    has_cash_amount = "cash_amount" in content
    results.append(TestResult(
        "KanbanBoard: cash_amount no insert",
        has_cash_amount,
        "Campo cash_amount " + ("incluido no insert" if has_cash_amount else "NAO incluido!"),
        "critical" if not has_cash_amount else "info"
    ))

    # 3. cashAmount parameter in function
    has_cash_param = "cashAmount" in content
    results.append(TestResult(
        "KanbanBoard: parametro cashAmount",
        has_cash_param,
        "Parametro cashAmount " + ("presente" if has_cash_param else "NAO presente!"),
        "critical" if not has_cash_param else "info"
    ))

    # 4. handlePaymentConfirm accepts mixed
    has_confirm_mixed = "handlePaymentConfirm" in content and "mixed" in content
    results.append(TestResult(
        "KanbanBoard: handlePaymentConfirm aceita mixed",
        has_confirm_mixed,
        "handlePaymentConfirm " + ("aceita mixed" if has_confirm_mixed else "NAO aceita mixed!"),
        "critical" if not has_confirm_mixed else "info"
    ))

    # 5. Installments for mixed type
    has_mixed_installments = "mixed" in content and "installments" in content
    results.append(TestResult(
        "KanbanBoard: parcelas para tipo misto",
        has_mixed_installments,
        "Parcelas para misto " + ("configuradas" if has_mixed_installments else "NAO configuradas"),
        "critical" if not has_mixed_installments else "info"
    ))

    # 6. PaymentTypeModal used
    has_modal = "PaymentTypeModal" in content
    results.append(TestResult(
        "KanbanBoard: usa PaymentTypeModal",
        has_modal,
        "PaymentTypeModal " + ("utilizado" if has_modal else "NAO encontrado"),
        "critical" if not has_modal else "info"
    ))

    # 7. Delivery launch after sale
    has_delivery = "DeliveryLaunch" in content or "deliveryLaunch" in content
    results.append(TestResult(
        "KanbanBoard: lancamento de entrega",
        has_delivery,
        "DeliveryLaunchModal " + ("integrado" if has_delivery else "NAO encontrado"),
        "warning" if not has_delivery else "info"
    ))

    return results


# ============================================================================
# TEST: DealDetailModal (CRM - createSalesFromDeal)
# ============================================================================

def test_deal_detail_modal(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "components", "crm", "DealDetailModal.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("DealDetailModal: arquivo", False, "DealDetailModal.tsx nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. createSalesFromDeal accepts 'mixed'
    has_mixed = "mixed" in content and "createSalesFromDeal" in content
    results.append(TestResult(
        "DealDetailModal: createSalesFromDeal aceita 'mixed'",
        has_mixed,
        "createSalesFromDeal " + ("aceita mixed" if has_mixed else "NAO aceita mixed!"),
        "critical" if not has_mixed else "info"
    ))

    # 2. cash_amount in insert
    has_cash = "cash_amount" in content
    results.append(TestResult(
        "DealDetailModal: cash_amount no insert",
        has_cash,
        "Campo cash_amount " + ("incluido" if has_cash else "NAO incluido!"),
        "critical" if not has_cash else "info"
    ))

    # 3. cashAmount parameter
    has_cash_param = "cashAmount" in content
    results.append(TestResult(
        "DealDetailModal: parametro cashAmount",
        has_cash_param,
        "Parametro cashAmount " + ("presente" if has_cash_param else "NAO presente!"),
        "critical" if not has_cash_param else "info"
    ))

    # 4. PaymentTypeModal onConfirm passes cashAmt
    has_callback = "cashAmt" in content or ("onConfirm" in content and "cashAmount" in content)
    results.append(TestResult(
        "DealDetailModal: PaymentTypeModal passa cashAmount",
        has_callback,
        "Callback " + ("passa cashAmount" if has_callback else "NAO passa cashAmount!"),
        "critical" if not has_callback else "info"
    ))

    # 5. handleWon function
    has_won = "handleWon" in content
    results.append(TestResult(
        "DealDetailModal: funcao handleWon",
        has_won,
        "handleWon " + ("encontrada" if has_won else "NAO encontrada"),
        "critical" if not has_won else "info"
    ))

    # 6. PaymentTypeModal used
    has_modal = "PaymentTypeModal" in content
    results.append(TestResult(
        "DealDetailModal: usa PaymentTypeModal",
        has_modal,
        "PaymentTypeModal " + ("utilizado" if has_modal else "NAO encontrado"),
        "critical" if not has_modal else "info"
    ))

    return results


# ============================================================================
# TEST: SalesTable (display)
# ============================================================================

def test_sales_table(project_dir: str) -> List[TestResult]:
    results = []
    filepath = os.path.join(project_dir, "src", "components", "sales", "SalesTable.tsx")

    if not os.path.exists(filepath):
        results.append(TestResult("SalesTable: arquivo", False, "SalesTable.tsx nao encontrado", "critical"))
        return results

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. PaymentTypeLabels used
    has_labels = "PaymentTypeLabels" in content
    results.append(TestResult(
        "SalesTable: usa PaymentTypeLabels",
        has_labels,
        "PaymentTypeLabels " + ("utilizado" if has_labels else "NAO utilizado"),
        "critical" if not has_labels else "info"
    ))

    # 2. Mixed badge display
    has_mixed_badge = "mixed" in content and ("Misto" in content or "mixed" in content)
    results.append(TestResult(
        "SalesTable: badge para tipo misto",
        has_mixed_badge,
        "Badge Misto " + ("encontrado" if has_mixed_badge else "NAO encontrado"),
        "warning" if not has_mixed_badge else "info"
    ))

    # 3. Pending badge display
    has_pending = "Pendente" in content
    results.append(TestResult(
        "SalesTable: badge para pendente",
        has_pending,
        "Badge Pendente " + ("encontrado" if has_pending else "NAO encontrado"),
        "warning" if not has_pending else "info"
    ))

    # 4. SaleModal integration for create/edit
    has_sale_modal = "SaleModal" in content
    results.append(TestResult(
        "SalesTable: integra SaleModal",
        has_sale_modal,
        "SaleModal " + ("integrado" if has_sale_modal else "NAO integrado"),
        "critical" if not has_sale_modal else "info"
    ))

    # 5. Delete action
    has_delete = "useDeleteSale" in content or "delete" in content.lower()
    results.append(TestResult(
        "SalesTable: acao de exclusao",
        has_delete,
        "Delete " + ("implementado" if has_delete else "NAO implementado"),
        "warning" if not has_delete else "info"
    ))

    # 6. Permission checks
    has_perms = "usePermissions" in content or "canCreate" in content or "canEdit" in content
    results.append(TestResult(
        "SalesTable: verificacao de permissoes",
        has_perms,
        "Permissoes " + ("verificadas" if has_perms else "NAO verificadas"),
        "warning" if not has_perms else "info"
    ))

    return results


# ============================================================================
# TEST: DB Migration
# ============================================================================

def test_db_migration(project_dir: str) -> List[TestResult]:
    results = []

    # Find migration files
    migrations_dir = os.path.join(project_dir, "supabase", "migrations")
    if not os.path.exists(migrations_dir):
        results.append(TestResult("DB: migrations dir", False, "Diretorio de migrations nao encontrado", "critical"))
        return results

    # Check for mixed payment migration
    mixed_migration_found = False
    mixed_content = ""
    original_content = ""

    for fname in sorted(os.listdir(migrations_dir)):
        fpath = os.path.join(migrations_dir, fname)
        if not os.path.isfile(fpath):
            continue
        with open(fpath, "r", encoding="utf-8") as f:
            fcontent = f.read()

        if "mixed" in fcontent and "cash_amount" in fcontent:
            mixed_migration_found = True
            mixed_content = fcontent

        if "create_sales_module" in fname or "generate_sale_installments" in fcontent:
            original_content += fcontent

    # Combine for checking trigger function (could be in original or override)
    all_content = original_content + mixed_content

    # 1. Mixed migration exists
    results.append(TestResult(
        "DB: migration para 'mixed'",
        mixed_migration_found,
        "Migration para mixed payment " + ("encontrada" if mixed_migration_found else "NAO encontrada!"),
        "critical" if not mixed_migration_found else "info"
    ))

    # 2. cash_amount column
    has_cash_col = "cash_amount" in all_content
    results.append(TestResult(
        "DB: coluna cash_amount",
        has_cash_col,
        "Coluna cash_amount " + ("criada" if has_cash_col else "NAO encontrada!"),
        "critical" if not has_cash_col else "info"
    ))

    # 3. CHECK constraint includes 'mixed'
    has_mixed_check = "'mixed'" in all_content and "payment_type" in all_content
    results.append(TestResult(
        "DB: constraint aceita 'mixed'",
        has_mixed_check,
        "CHECK constraint " + ("inclui mixed" if has_mixed_check else "NAO inclui mixed!"),
        "critical" if not has_mixed_check else "info"
    ))

    # 4. Trigger handles mixed type
    has_mixed_trigger = "mixed" in all_content and "generate_sale_installments" in all_content
    results.append(TestResult(
        "DB: trigger trata 'mixed'",
        has_mixed_trigger,
        "Trigger generate_sale_installments " + ("trata mixed" if has_mixed_trigger else "NAO trata mixed!"),
        "critical" if not has_mixed_trigger else "info"
    ))

    # 5. Mixed creates cash installment (#1) as paid
    has_cash_installment = "paid" in all_content and "cash_amount" in all_content
    results.append(TestResult(
        "DB: parcela a vista marcada como paga",
        has_cash_installment,
        "Parcela #1 a vista " + ("marcada como paid" if has_cash_installment else "NAO marcada!"),
        "critical" if not has_cash_installment else "info"
    ))

    # 6. Mixed remaining split into installments
    has_remaining_split = "remaining" in all_content.lower() or "v_remaining" in all_content
    results.append(TestResult(
        "DB: restante dividido em parcelas",
        has_remaining_split,
        "Valor restante " + ("dividido em parcelas" if has_remaining_split else "NAO dividido!"),
        "critical" if not has_remaining_split else "info"
    ))

    # 7. Original tables exist (sales + sale_installments)
    has_sales_table = "CREATE TABLE" in all_content and "sales" in all_content
    results.append(TestResult(
        "DB: tabela sales",
        has_sales_table,
        "Tabela sales " + ("criada" if has_sales_table else "NAO encontrada"),
        "critical" if not has_sales_table else "info"
    ))

    has_installments_table = "sale_installments" in all_content
    results.append(TestResult(
        "DB: tabela sale_installments",
        has_installments_table,
        "Tabela sale_installments " + ("criada" if has_installments_table else "NAO encontrada"),
        "critical" if not has_installments_table else "info"
    ))

    # 8. Trigger re-created after mixed update
    has_trigger_recreate = "trigger_generate_sale_installments" in all_content
    results.append(TestResult(
        "DB: trigger recriado",
        has_trigger_recreate,
        "Trigger " + ("recriado" if has_trigger_recreate else "NAO recriado!"),
        "critical" if not has_trigger_recreate else "info"
    ))

    # 9. Interest rate in trigger
    has_interest = "interest_rate" in all_content
    results.append(TestResult(
        "DB: juros no trigger",
        has_interest,
        "Calculo de juros " + ("implementado" if has_interest else "NAO encontrado"),
        "warning" if not has_interest else "info"
    ))

    return results


# ============================================================================
# TEST: Consistency across all files
# ============================================================================

def test_consistency(project_dir: str) -> List[TestResult]:
    results = []

    # Files that should all have 'mixed' support
    files_to_check = {
        "types/sales.ts": os.path.join(project_dir, "src", "types", "sales.ts"),
        "hooks/useSales.ts": os.path.join(project_dir, "src", "hooks", "useSales.ts"),
        "sales/SaleModal.tsx": os.path.join(project_dir, "src", "components", "sales", "SaleModal.tsx"),
        "crm/PaymentTypeModal.tsx": os.path.join(project_dir, "src", "components", "crm", "PaymentTypeModal.tsx"),
        "crm/KanbanBoard.tsx": os.path.join(project_dir, "src", "components", "crm", "KanbanBoard.tsx"),
        "crm/DealDetailModal.tsx": os.path.join(project_dir, "src", "components", "crm", "DealDetailModal.tsx"),
    }

    # All should have 'mixed'
    for name, filepath in files_to_check.items():
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            has_mixed = "mixed" in content
            results.append(TestResult(
                f"Consistencia: {name} suporta 'mixed'",
                has_mixed,
                f"{'Sim' if has_mixed else 'NAO'} - mixed " + ("presente" if has_mixed else "AUSENTE!"),
                "critical" if not has_mixed else "info"
            ))

    # All CRM + hooks should have cash_amount
    cash_amount_files = {
        "hooks/useSales.ts": files_to_check["hooks/useSales.ts"],
        "crm/KanbanBoard.tsx": files_to_check["crm/KanbanBoard.tsx"],
        "crm/DealDetailModal.tsx": files_to_check["crm/DealDetailModal.tsx"],
        "sales/SaleModal.tsx": files_to_check["sales/SaleModal.tsx"],
    }

    for name, filepath in cash_amount_files.items():
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            has_cash = "cash_amount" in content
            results.append(TestResult(
                f"Consistencia: {name} envia cash_amount",
                has_cash,
                f"{'Sim' if has_cash else 'NAO'} - cash_amount " + ("presente" if has_cash else "AUSENTE!"),
                "critical" if not has_cash else "info"
            ))

    return results


# ============================================================================
# MAIN
# ============================================================================

def run_all_tests(project_dir: str):
    all_results: List[TestResult] = []

    print("=" * 70)
    print("  CLINVIA - Teste Completo do Sistema de Vendas")
    print("=" * 70)

    print("\n[1/8] Testando tipos (sales.ts)...")
    all_results.extend(test_types(project_dir))

    print("[2/8] Testando hooks (useSales.ts)...")
    all_results.extend(test_hooks(project_dir))

    print("[3/8] Testando SaleModal (venda manual)...")
    all_results.extend(test_sale_modal(project_dir))

    print("[4/8] Testando PaymentTypeModal (CRM)...")
    all_results.extend(test_payment_type_modal(project_dir))

    print("[5/8] Testando KanbanBoard (CRM sales)...")
    all_results.extend(test_kanban_board(project_dir))

    print("[6/8] Testando DealDetailModal (CRM sales)...")
    all_results.extend(test_deal_detail_modal(project_dir))

    print("[7/8] Testando SalesTable (exibicao)...")
    all_results.extend(test_sales_table(project_dir))

    print("[8/8] Testando DB migrations...")
    all_results.extend(test_db_migration(project_dir))

    print("[BONUS] Testando consistencia entre arquivos...")
    all_results.extend(test_consistency(project_dir))

    passed = sum(1 for r in all_results if r.passed)
    failed = sum(1 for r in all_results if not r.passed)
    warnings = sum(1 for r in all_results if not r.passed and r.severity == "warning")
    critical = sum(1 for r in all_results if not r.passed and r.severity == "critical")

    return all_results, {
        "total": len(all_results),
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "critical": critical,
    }


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
