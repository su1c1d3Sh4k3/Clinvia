#!/usr/bin/env python3
"""
Testes automatizados para o sistema de vendas.
Análise estática de código — verifica estrutura, tipos, hooks, componentes e migrações.

Execução: python tests/test_sales.py
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
    severity: str = "error"  # error, warning, info

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


# Resolve project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

def read_file(relative_path: str) -> str:
    """Read file content relative to project root."""
    full_path = os.path.join(PROJECT_ROOT, relative_path.replace("/", os.sep))
    if not os.path.exists(full_path):
        return ""
    with open(full_path, "r", encoding="utf-8") as f:
        return f.read()

def file_exists(relative_path: str) -> bool:
    """Check if file exists relative to project root."""
    full_path = os.path.join(PROJECT_ROOT, relative_path.replace("/", os.sep))
    return os.path.exists(full_path)


# =============================================
# 1. FILE STRUCTURE TESTS
# =============================================

def test_file_structure() -> TestCategory:
    cat = TestCategory("Estrutura de Arquivos")

    required_files = [
        ("src/components/sales/SaleModal.tsx", "Modal de criação/edição de vendas"),
        ("src/components/sales/SalesTable.tsx", "Tabela de vendas"),
        ("src/components/sales/SalesCards.tsx", "Cards de métricas de vendas"),
        ("src/components/sales/SalesCharts.tsx", "Gráficos de vendas"),
        ("src/hooks/useSales.ts", "Hooks de vendas"),
        ("src/types/sales.ts", "Tipos do módulo de vendas"),
        ("src/components/ui/currency-input.tsx", "Componente CurrencyInput"),
    ]

    for path, desc in required_files:
        exists = file_exists(path)
        cat.results.append(TestResult(
            name=f"Arquivo existe: {path}",
            passed=exists,
            message=f"{desc} encontrado" if exists else f"{desc} NÃO encontrado em {path}"
        ))

    # Migration file for trigger fix
    migration_exists = file_exists("supabase/migrations/20260409120000_fix_installment_trigger_on_update.sql")
    cat.results.append(TestResult(
        name="Migration de fix do trigger existe",
        passed=migration_exists,
        message="Migration encontrada" if migration_exists else "Migration de fix do trigger não encontrada"
    ))

    return cat


# =============================================
# 2. SALE MODAL TESTS
# =============================================

def test_sale_modal() -> TestCategory:
    cat = TestCategory("SaleModal")
    content = read_file("src/components/sales/SaleModal.tsx")

    if not content:
        cat.results.append(TestResult("Arquivo lido", False, "SaleModal.tsx não encontrado"))
        return cat

    # Test: accepts sale prop for edit mode
    cat.results.append(TestResult(
        name="Aceita prop 'sale' para edição",
        passed="sale?: Sale" in content or "sale?: Sale | null" in content,
        message="Prop sale encontrada" if "sale?" in content else "SaleModal não aceita prop 'sale' para modo de edição"
    ))

    # Test: imports useUpdateSale
    cat.results.append(TestResult(
        name="Importa useUpdateSale",
        passed="useUpdateSale" in content,
        message="useUpdateSale importado" if "useUpdateSale" in content else "useUpdateSale NÃO importado no SaleModal"
    ))

    # Test: imports CurrencyInput
    cat.results.append(TestResult(
        name="Importa CurrencyInput",
        passed="CurrencyInput" in content,
        message="CurrencyInput importado" if "CurrencyInput" in content else "CurrencyInput NÃO importado no SaleModal"
    ))

    # Test: uses CurrencyInput component (not Input type=number for money)
    has_currency_input = "<CurrencyInput" in content
    cat.results.append(TestResult(
        name="Usa componente CurrencyInput para valores",
        passed=has_currency_input,
        message="CurrencyInput utilizado" if has_currency_input else "CurrencyInput NÃO utilizado para campos de valor"
    ))

    # Test: unit price uses CurrencyInput (check that CurrencyInput follows the Unit Price comment)
    unit_price_uses_currency = re.search(r'Unit Price.*?<CurrencyInput', content, re.DOTALL)
    cat.results.append(TestResult(
        name="Preço unitário usa CurrencyInput",
        passed=unit_price_uses_currency is not None,
        message="Preço unitário usa CurrencyInput" if unit_price_uses_currency else "Preço unitário NÃO usa CurrencyInput"
    ))

    # Test: cash amount uses CurrencyInput (check that CurrencyInput follows the Valor à Vista label)
    cash_uses_currency = re.search(r'Valor à Vista.*?<CurrencyInput', content, re.DOTALL)
    cat.results.append(TestResult(
        name="Valor à vista usa CurrencyInput",
        passed=cash_uses_currency is not None,
        message="Valor à vista usa CurrencyInput" if cash_uses_currency else "Valor à vista NÃO usa CurrencyInput"
    ))

    # Test: has isEditing flag
    cat.results.append(TestResult(
        name="Tem flag isEditing",
        passed="isEditing" in content,
        message="Flag isEditing encontrada" if "isEditing" in content else "Flag isEditing NÃO encontrada"
    ))

    # Test: edit mode populates form from sale data
    cat.results.append(TestResult(
        name="Modo edição popula formulário com dados da venda",
        passed="sale.payment_type" in content or "sale?.payment_type" in content,
        message="Formulário populado a partir de sale" if "sale.payment_type" in content or "sale?.payment_type" in content else "Formulário NÃO é populado com dados da venda"
    ))

    # Test: title changes between create and edit
    cat.results.append(TestResult(
        name="Título muda entre 'Nova Venda' e 'Editar Venda'",
        passed="Editar Venda" in content and "Nova Venda" in content,
        message="Títulos encontrados" if "Editar Venda" in content else "Título 'Editar Venda' não encontrado"
    ))

    # Test: submit button text changes
    cat.results.append(TestResult(
        name="Botão submit muda entre criar e editar",
        passed="Salvar Alterações" in content,
        message="Texto 'Salvar Alterações' encontrado" if "Salvar Alterações" in content else "Texto do botão de edição não encontrado"
    ))

    # Test: mixed payment validation
    has_cash_validation = "cashAmount <= 0" in content
    has_max_validation = "cashAmount >= totalAmount" in content
    cat.results.append(TestResult(
        name="Validação de pagamento misto (cashAmount > 0)",
        passed=has_cash_validation,
        message="Validação de cashAmount > 0 encontrada" if has_cash_validation else "Validação de cashAmount mínimo NÃO encontrada"
    ))
    cat.results.append(TestResult(
        name="Validação de pagamento misto (cashAmount < totalAmount)",
        passed=has_max_validation,
        message="Validação cashAmount < totalAmount encontrada" if has_max_validation else "Validação de cashAmount máximo NÃO encontrada"
    ))

    # Test: proportional cash distribution for multi-product
    has_proportional = "cashDistributed" in content
    cat.results.append(TestResult(
        name="Distribuição proporcional do cash em multi-produto",
        passed=has_proportional,
        message="Distribuição proporcional encontrada" if has_proportional else "Distribuição proporcional do cash NÃO implementada"
    ))

    # Test: hides add product button in edit mode
    has_edit_hide = "isEditing" in content and "!isEditing" in content
    cat.results.append(TestResult(
        name="Esconde botão 'Adicionar Produto' em modo edição",
        passed=has_edit_hide,
        message="Botão escondido em edição" if has_edit_hide else "Botão 'Adicionar Produto' não é escondido em edição"
    ))

    # Test: uses updateSale.mutateAsync in edit mode
    cat.results.append(TestResult(
        name="Usa updateSale.mutateAsync em modo edição",
        passed="updateSale.mutateAsync" in content,
        message="updateSale.mutateAsync encontrado" if "updateSale.mutateAsync" in content else "updateSale.mutateAsync NÃO encontrado"
    ))

    # Test: Sale type imported
    cat.results.append(TestResult(
        name="Tipo Sale importado",
        passed="Sale," in content or "Sale }" in content,
        message="Tipo Sale importado" if "Sale" in content else "Tipo Sale NÃO importado"
    ))

    return cat


# =============================================
# 3. SALES TABLE TESTS
# =============================================

def test_sales_table() -> TestCategory:
    cat = TestCategory("SalesTable")
    content = read_file("src/components/sales/SalesTable.tsx")

    if not content:
        cat.results.append(TestResult("Arquivo lido", False, "SalesTable.tsx não encontrado"))
        return cat

    # Test: passes sale/editingSale to SaleModal
    passes_sale = "sale={editingSale}" in content
    cat.results.append(TestResult(
        name="Passa editingSale ao SaleModal",
        passed=passes_sale,
        message="editingSale passado ao SaleModal" if passes_sale else "editingSale NÃO passado ao SaleModal"
    ))

    # Test: clears editingSale on modal close
    clears_on_close = "setEditingSale(null)" in content
    cat.results.append(TestResult(
        name="Limpa editingSale ao fechar modal",
        passed=clears_on_close,
        message="setEditingSale(null) encontrado no onOpenChange" if clears_on_close else "editingSale NÃO é limpo ao fechar modal"
    ))

    # Test: imports Popover
    has_popover = "Popover" in content
    cat.results.append(TestResult(
        name="Importa Popover para display de pagamento misto",
        passed=has_popover,
        message="Popover importado" if has_popover else "Popover NÃO importado"
    ))

    # Test: has PopoverContent with mixed payment breakdown
    has_breakdown = "cash_amount" in content and "PopoverContent" in content
    cat.results.append(TestResult(
        name="Mostra breakdown de pagamento misto no Popover",
        passed=has_breakdown,
        message="Breakdown de pagamento misto encontrado" if has_breakdown else "Breakdown de pagamento misto NÃO encontrado"
    ))

    # Test: shows installment details in popover
    has_installment_detail = "installments_data" in content
    cat.results.append(TestResult(
        name="Exibe detalhes de parcelas no popover",
        passed=has_installment_detail,
        message="installments_data utilizado" if has_installment_detail else "installments_data NÃO utilizado no popover"
    ))

    # Test: shows status icons (paid/pending/overdue)
    has_status_icons = "status === 'paid'" in content and "status === 'overdue'" in content
    cat.results.append(TestResult(
        name="Exibe ícones de status das parcelas",
        passed=has_status_icons,
        message="Ícones de status encontrados" if has_status_icons else "Ícones de status NÃO encontrados"
    ))

    # Test: no old disabled comment
    old_comment = "Edição desativada temporariamente" in content
    cat.results.append(TestResult(
        name="Comentário de edição desativada removido",
        passed=not old_comment,
        message="Comentário antigo removido" if not old_comment else "Comentário 'Edição desativada' ainda presente"
    ))

    # Test: edit button exists and calls handleEditClick
    has_edit_btn = "handleEditClick" in content and "Pencil" in content
    cat.results.append(TestResult(
        name="Botão de edição funcional",
        passed=has_edit_btn,
        message="Botão de edição com handleEditClick encontrado" if has_edit_btn else "Botão de edição não está funcional"
    ))

    return cat


# =============================================
# 4. useSales HOOK TESTS
# =============================================

def test_use_sales_hook() -> TestCategory:
    cat = TestCategory("useSales Hook")
    content = read_file("src/hooks/useSales.ts")

    if not content:
        cat.results.append(TestResult("Arquivo lido", False, "useSales.ts não encontrado"))
        return cat

    # Test: useUpdateSale does NOT manually delete installments
    update_section = ""
    match = re.search(r'export function useUpdateSale\(\).*?^}', content, re.MULTILINE | re.DOTALL)
    if match:
        update_section = match.group(0)

    has_manual_delete = "from('sale_installments'" in update_section and ".delete()" in update_section
    cat.results.append(TestResult(
        name="useUpdateSale NÃO deleta parcelas manualmente",
        passed=not has_manual_delete,
        message="Trigger cuida da regeneração" if not has_manual_delete else "useUpdateSale ainda deleta parcelas manualmente — trigger deveria cuidar disso"
    ))

    # Test: useSales joins installments_data
    has_installments_join = "installments_data:sale_installments" in content
    cat.results.append(TestResult(
        name="useSales faz join com sale_installments",
        passed=has_installments_join,
        message="Join com installments_data encontrado" if has_installments_join else "useSales NÃO faz join com sale_installments"
    ))

    # Test: useUpdateSale updates all editable fields
    required_fields = ["category", "product_service_id", "product_name", "quantity",
                       "unit_price", "total_amount", "payment_type", "installments",
                       "interest_rate", "cash_amount", "sale_date",
                       "team_member_id", "professional_id", "notes", "contact_id"]
    missing = [f for f in required_fields if f not in update_section]
    cat.results.append(TestResult(
        name="useUpdateSale atualiza todos os campos editáveis",
        passed=len(missing) == 0,
        message="Todos os campos incluídos" if not missing else f"Campos faltando no update: {', '.join(missing)}"
    ))

    # Test: useCreateSale exists
    cat.results.append(TestResult(
        name="useCreateSale exportado",
        passed="export function useCreateSale" in content,
        message="useCreateSale encontrado" if "export function useCreateSale" in content else "useCreateSale NÃO encontrado"
    ))

    # Test: useDeleteSale exists
    cat.results.append(TestResult(
        name="useDeleteSale exportado",
        passed="export function useDeleteSale" in content,
        message="useDeleteSale encontrado" if "export function useDeleteSale" in content else "useDeleteSale NÃO encontrado"
    ))

    # Test: usePayInstallment exists
    cat.results.append(TestResult(
        name="usePayInstallment exportado",
        passed="export function usePayInstallment" in content,
        message="usePayInstallment encontrado" if "export function usePayInstallment" in content else "usePayInstallment NÃO encontrado"
    ))

    # Test: useUpdateSale invalidates sale-installments cache
    cat.results.append(TestResult(
        name="useUpdateSale invalida cache de parcelas",
        passed="sale-installments" in update_section,
        message="Cache de parcelas invalidado" if "sale-installments" in update_section else "Cache de parcelas NÃO invalidado após update"
    ))

    # Test: cash_amount handling in create
    create_section = ""
    match = re.search(r'export function useCreateSale\(\).*?^}', content, re.MULTILINE | re.DOTALL)
    if match:
        create_section = match.group(0)
    cat.results.append(TestResult(
        name="useCreateSale calcula cash_amount corretamente",
        passed="cash_amount" in create_section and "mixed" in create_section,
        message="cash_amount tratado para mixed" if "cash_amount" in create_section else "cash_amount NÃO tratado em useCreateSale"
    ))

    # Test: getOwnerId helper exists
    cat.results.append(TestResult(
        name="Helper getOwnerId existe",
        passed="async function getOwnerId" in content,
        message="getOwnerId encontrado" if "async function getOwnerId" in content else "getOwnerId NÃO encontrado"
    ))

    # Test: useSales accepts date range
    cat.results.append(TestResult(
        name="useSales aceita range de datas",
        passed="startDate" in content and "endDate" in content and "gte" in content and "lte" in content,
        message="Filtro por range de datas implementado" if "gte" in content else "Filtro por range de datas NÃO encontrado"
    ))

    return cat


# =============================================
# 5. TYPES TESTS
# =============================================

def test_types() -> TestCategory:
    cat = TestCategory("Types (sales.ts)")
    content = read_file("src/types/sales.ts")

    if not content:
        cat.results.append(TestResult("Arquivo lido", False, "sales.ts não encontrado"))
        return cat

    # Test: Sale interface has installments_data
    cat.results.append(TestResult(
        name="Sale.installments_data existe",
        passed="installments_data" in content,
        message="Campo installments_data encontrado" if "installments_data" in content else "Campo installments_data NÃO encontrado na interface Sale"
    ))

    # Test: Sale interface has cash_amount
    cat.results.append(TestResult(
        name="Sale.cash_amount existe",
        passed="cash_amount" in content,
        message="Campo cash_amount encontrado" if "cash_amount" in content else "Campo cash_amount NÃO encontrado"
    ))

    # Test: PaymentType includes 'mixed'
    cat.results.append(TestResult(
        name="PaymentType inclui 'mixed'",
        passed="'mixed'" in content,
        message="Tipo mixed encontrado" if "'mixed'" in content else "Tipo mixed NÃO encontrado em PaymentType"
    ))

    # Test: SaleFormData exists with required fields
    form_fields = ["category", "product_service_id", "product_name", "quantity",
                   "unit_price", "total_amount", "payment_type", "installments",
                   "interest_rate", "cash_amount", "sale_date"]
    missing = [f for f in form_fields if f not in content]
    cat.results.append(TestResult(
        name="SaleFormData tem todos os campos necessários",
        passed=len(missing) == 0,
        message="Todos os campos presentes" if not missing else f"Campos faltando: {', '.join(missing)}"
    ))

    # Test: SaleInstallment interface exists
    cat.results.append(TestResult(
        name="Interface SaleInstallment existe",
        passed="interface SaleInstallment" in content,
        message="SaleInstallment encontrada" if "interface SaleInstallment" in content else "Interface SaleInstallment NÃO encontrada"
    ))

    return cat


# =============================================
# 6. MIGRATION / TRIGGER TESTS
# =============================================

def test_migration() -> TestCategory:
    cat = TestCategory("Migration / Trigger")
    content = read_file("supabase/migrations/20260409120000_fix_installment_trigger_on_update.sql")

    if not content:
        cat.results.append(TestResult("Arquivo lido", False, "Migration de fix do trigger não encontrada"))
        return cat

    # Test: trigger fires on INSERT OR UPDATE
    has_insert_or_update = "AFTER INSERT OR UPDATE ON sales" in content
    cat.results.append(TestResult(
        name="Trigger é AFTER INSERT OR UPDATE",
        passed=has_insert_or_update,
        message="Trigger atualizado" if has_insert_or_update else "Trigger NÃO inclui OR UPDATE"
    ))

    # Test: function checks TG_OP
    has_tg_op = "TG_OP" in content
    cat.results.append(TestResult(
        name="Função verifica TG_OP",
        passed=has_tg_op,
        message="TG_OP verificado" if has_tg_op else "TG_OP NÃO verificado na função"
    ))

    # Test: skip condition for unchanged payment fields
    has_skip = "RETURN NEW" in content and "OLD.payment_type = NEW.payment_type" in content
    cat.results.append(TestResult(
        name="Skip condition para campos não alterados",
        passed=has_skip,
        message="Skip condition encontrada" if has_skip else "Skip condition NÃO encontrada"
    ))

    # Test: checks if installments exist before skipping
    has_exists_check = "EXISTS (SELECT 1 FROM sale_installments" in content
    cat.results.append(TestResult(
        name="Verifica se parcelas existem antes de skip",
        passed=has_exists_check,
        message="EXISTS check encontrado" if has_exists_check else "EXISTS check NÃO encontrado — pode pular vendas sem parcelas"
    ))

    # Test: deletes old installments on UPDATE
    has_delete = "DELETE FROM sale_installments WHERE sale_id = NEW.id" in content
    cat.results.append(TestResult(
        name="Deleta parcelas antigas no UPDATE",
        passed=has_delete,
        message="DELETE encontrado" if has_delete else "DELETE de parcelas NÃO encontrado"
    ))

    # Test: handles mixed payment type
    has_mixed = "mixed" in content and "cash_amount" in content
    cat.results.append(TestResult(
        name="Lida com payment_type mixed",
        passed=has_mixed,
        message="Tratamento de mixed encontrado" if has_mixed else "Tratamento de mixed NÃO encontrado"
    ))

    # Test: has repair step for orphaned sales
    has_repair = "LEFT JOIN sale_installments" in content or "WHERE si.id IS NULL" in content
    cat.results.append(TestResult(
        name="Repair step para vendas sem parcelas",
        passed=has_repair,
        message="Repair step encontrado" if has_repair else "Repair step NÃO encontrado"
    ))

    # Test: SECURITY DEFINER
    has_security = "SECURITY DEFINER" in content
    cat.results.append(TestResult(
        name="Função usa SECURITY DEFINER",
        passed=has_security,
        message="SECURITY DEFINER encontrado" if has_security else "SECURITY DEFINER NÃO encontrado"
    ))

    return cat


# =============================================
# 7. CURRENCY INPUT TESTS
# =============================================

def test_currency_input() -> TestCategory:
    cat = TestCategory("CurrencyInput")
    content = read_file("src/components/ui/currency-input.tsx")

    if not content:
        cat.results.append(TestResult("Arquivo lido", False, "currency-input.tsx não encontrado"))
        return cat

    # Test: component exported
    cat.results.append(TestResult(
        name="Componente exportado",
        passed="export { CurrencyInput" in content or "export default" in content,
        message="CurrencyInput exportado" if "export" in content else "CurrencyInput NÃO exportado"
    ))

    # Test: uses inputMode="numeric"
    cat.results.append(TestResult(
        name="Usa inputMode='numeric'",
        passed='inputMode="numeric"' in content,
        message="inputMode numeric encontrado" if 'inputMode="numeric"' in content else "inputMode numeric NÃO encontrado"
    ))

    # Test: formats as centavos (divides by 100)
    has_centavos = "/ 100" in content or "centavos" in content
    cat.results.append(TestResult(
        name="Formata como centavos (divide por 100)",
        passed=has_centavos,
        message="Conversão de centavos encontrada" if has_centavos else "Conversão de centavos NÃO encontrada"
    ))

    # Test: has R$ prefix
    has_prefix = "R$" in content
    cat.results.append(TestResult(
        name="Tem prefixo R$",
        passed=has_prefix,
        message="Prefixo R$ encontrado" if has_prefix else "Prefixo R$ NÃO encontrado"
    ))

    # Test: strips non-numeric characters
    has_strip = r"replace(/\D/g" in content or "replace(/[^0-9]/g" in content
    cat.results.append(TestResult(
        name="Remove caracteres não numéricos",
        passed=has_strip,
        message="Strip de caracteres encontrado" if has_strip else "Strip NÃO encontrado"
    ))

    return cat


# =============================================
# 8. SECURITY TESTS
# =============================================

def test_security() -> TestCategory:
    cat = TestCategory("Segurança")

    # Test: RLS on sales table
    migration_content = read_file("supabase/migrations/20260113150000_create_sales_module.sql")
    has_rls = "ENABLE ROW LEVEL SECURITY" in migration_content and "sales" in migration_content
    cat.results.append(TestResult(
        name="RLS habilitado na tabela sales",
        passed=has_rls,
        message="RLS encontrado" if has_rls else "RLS NÃO encontrado para sales"
    ))

    # Test: CASCADE delete on installments
    has_cascade = "ON DELETE CASCADE" in migration_content
    cat.results.append(TestResult(
        name="CASCADE delete nas parcelas",
        passed=has_cascade,
        message="ON DELETE CASCADE encontrado" if has_cascade else "ON DELETE CASCADE NÃO encontrado em sale_installments"
    ))

    # Test: trigger uses SECURITY DEFINER
    trigger_content = read_file("supabase/migrations/20260409120000_fix_installment_trigger_on_update.sql")
    has_sec_def = "SECURITY DEFINER" in trigger_content
    cat.results.append(TestResult(
        name="Trigger function usa SECURITY DEFINER",
        passed=has_sec_def,
        message="SECURITY DEFINER encontrado" if has_sec_def else "Trigger function sem SECURITY DEFINER"
    ))

    # Test: no raw SQL in frontend hooks
    hooks_content = read_file("src/hooks/useSales.ts")
    has_direct_sql = "sql`" in hooks_content or ".query(" in hooks_content
    cat.results.append(TestResult(
        name="Sem SQL direto nos hooks (usa supabase client)",
        passed=not has_direct_sql,
        message="Nenhum SQL direto encontrado" if not has_direct_sql else "SQL direto encontrado nos hooks — risco de injeção"
    ))

    return cat


# =============================================
# 9. INTEGRATION / CONSISTENCY TESTS
# =============================================

def test_integration() -> TestCategory:
    cat = TestCategory("Integração e Consistência")

    modal_content = read_file("src/components/sales/SaleModal.tsx")
    table_content = read_file("src/components/sales/SalesTable.tsx")

    # Test: SaleModal and SalesTable use same PaymentTypeLabels
    modal_uses = "PaymentTypeLabels" in modal_content
    table_uses = "PaymentTypeLabels" in table_content
    cat.results.append(TestResult(
        name="Modal e Tabela usam PaymentTypeLabels consistente",
        passed=modal_uses and table_uses,
        message="Ambos usam PaymentTypeLabels" if modal_uses and table_uses else "Inconsistência no uso de PaymentTypeLabels"
    ))

    # Test: SaleModal imports from useSales (not inline queries)
    cat.results.append(TestResult(
        name="SaleModal usa hooks de useSales (não queries inline)",
        passed='from "@/hooks/useSales"' in modal_content or "from '@/hooks/useSales'" in modal_content,
        message="Hooks importados corretamente" if "useSales" in modal_content else "SaleModal não importa de useSales"
    ))

    # Test: formatCurrency used consistently
    modal_format = "formatCurrency" in modal_content
    table_format = "formatCurrency" in table_content
    cat.results.append(TestResult(
        name="formatCurrency usado em ambos modal e tabela",
        passed=modal_format and table_format,
        message="Formatação consistente" if modal_format and table_format else "Inconsistência em formatCurrency"
    ))

    # Test: mixed payment creates proportional cash for multi-product
    cat.results.append(TestResult(
        name="Multi-produto misto distribui cash proporcionalmente",
        passed="cashDistributed" in modal_content,
        message="Distribuição proporcional implementada" if "cashDistributed" in modal_content else "Distribuição proporcional NÃO implementada"
    ))

    # Test: all payment types handled in table display
    for ptype in ["pending", "mixed", "cash", "installment"]:
        cat.results.append(TestResult(
            name=f"Tabela exibe payment_type '{ptype}'",
            passed=ptype in table_content,
            message=f"Tipo {ptype} tratado na tabela" if ptype in table_content else f"Tipo {ptype} NÃO tratado na tabela"
        ))

    # Test: SalesTable passes proper props to SaleModal
    has_proper_props = "sale={editingSale}" in table_content
    cat.results.append(TestResult(
        name="SalesTable passa props corretas ao SaleModal",
        passed=has_proper_props,
        message="Props corretas passadas" if has_proper_props else "Props incorretas ou incompletas para SaleModal"
    ))

    return cat


# =============================================
# RUNNER
# =============================================

def run_all_tests():
    categories = [
        test_file_structure(),
        test_sale_modal(),
        test_sales_table(),
        test_use_sales_hook(),
        test_types(),
        test_migration(),
        test_currency_input(),
        test_security(),
        test_integration(),
    ]

    total_passed = 0
    total_failed = 0

    print("=" * 70)
    print("  TESTES DO SISTEMA DE VENDAS")
    print("=" * 70)

    for cat in categories:
        total_passed += cat.passed
        total_failed += cat.failed

        status = "PASS" if cat.failed == 0 else "FAIL"
        icon = "+" if cat.failed == 0 else "x"
        print(f"\n{icon} {cat.name} [{cat.passed}/{cat.passed + cat.failed}] -- {status}")

        for result in cat.results:
            icon = "  +" if result.passed else "  x"
            print(f"  {icon} {result.name}")
            if not result.passed:
                print(f"      -> {result.message}")

    print("\n" + "=" * 70)
    total = total_passed + total_failed
    pct = (total_passed / total * 100) if total > 0 else 0
    status = "ALL PASSED" if total_failed == 0 else f"{total_failed} FAILED"
    print(f"  RESULTADO: {total_passed}/{total} testes passaram ({pct:.0f}%) -- {status}")
    print("=" * 70)

    return total_failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
