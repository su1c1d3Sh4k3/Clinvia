# Manual - Produtos e Serviços

Página para gerenciar seu catálogo de produtos e serviços que podem ser vendidos ou usados em negociações do CRM.

> **Acesso**: Agentes só visualizam. Supervisores podem editar mas não excluir. Admins têm acesso total.

---

## Conceitos

### Produto
Item físico vendável, como:
- Cosméticos
- Equipamentos
- Kits

### Serviço
Prestação de serviço, como:
- Consultas
- Procedimentos
- Manutenções

---

## Interface da Página

### Cabeçalho

| Elemento | Função | Acesso |
|----------|--------|--------|
| **Baixar Modelo** | Baixa planilha CSV modelo para importação | Admin/Supervisor |
| **Importar** | Importa dados de arquivo CSV | Admin/Supervisor |
| **Novo Item** | Abre modal para criar produto/serviço | Admin/Supervisor |

### Busca
Campo para filtrar por nome.

### Abas
- **Produtos**: Lista todos os produtos
- **Serviços**: Lista todos os serviços

---

## Tabela de Produtos

| Coluna | Descrição |
|--------|-----------|
| **☐** | Checkbox para seleção múltipla |
| **Nome** | Nome do produto |
| **Valor** | Preço em R$ ou "Sob Consulta" |
| **Descrição** | Texto descritivo |
| **Alerta** | Dias para oportunidade (ex: "30d") |
| **Estoque** | Quantidade em estoque |
| **Ações** | Editar ✏️ e Excluir 🗑️ |

---

## Tabela de Serviços

| Coluna | Descrição |
|--------|-----------|
| **☐** | Checkbox para seleção múltipla |
| **Nome** | Nome do serviço |
| **Valor** | Preço em R$ ou "Sob Consulta" |
| **Descrição** | Texto descritivo |
| **Alerta** | Dias para oportunidade |
| **Duração** | Tempo em minutos (ex: "60min") |
| **Ações** | Editar ✏️ e Excluir 🗑️ |

---

## Modal: Criar/Editar Item

### Campos Comuns

| Campo | Descrição | Obrigatório |
|-------|-----------|-------------|
| **Nome** | Nome do produto/serviço | ✅ |
| **Descrição** | Detalhes do item | ❌ |
| **Valor (R$)** | Preço. Use 0 para "Sob Consulta" | ❌ |
| **Alerta de Oportunidade** | Dias após venda para gerar nova oportunidade | ❌ |
| **Imagens** | Fotos do produto/serviço | ❌ |

### Campos Específicos

| Tipo | Campo Extra | Descrição |
|------|-------------|-----------|
| **Produto** | Estoque | Quantidade disponível |
| **Serviço** | Duração | Tempo em minutos |

---

## Como Criar um Novo Item

1. Clique em **"Novo Item"**
2. Escolha a aba: **Produto** ou **Serviço**
3. Preencha os campos:
   - Nome (obrigatório)
   - Descrição
   - Valor
   - Estoque (produto) ou Duração (serviço)
   - Alerta de oportunidade
4. Adicione imagens (opcional)
5. Clique em **"Salvar"**

---

## Como Editar um Item

1. Localize o item na lista
2. Clique no ícone ✏️ (lápis)
3. Modifique os campos desejados
4. Clique em **"Salvar"**

> **Nota**: Não é possível mudar o tipo (produto ↔ serviço) ao editar.

---

## Como Excluir Itens

### Excluir um item:
1. Clique no ícone 🗑️ na linha do item
2. Confirme a exclusão

### Excluir vários itens:
1. Marque os checkboxes dos itens desejados
2. Clique no botão **"Excluir (X)"** que aparece
3. Confirme a exclusão

---

## Importar via CSV

### Passo 1: Baixar o Modelo
1. Clique em **"Baixar Modelo"**
2. Abra o arquivo `modelo_produtos_servicos.csv` no Excel

### Passo 2: Preencher a Planilha
Use o separador **ponto e vírgula (;)**

| Coluna | Valores | Obrigatório |
|--------|---------|-------------|
| `type` | `product` ou `service` | ✅ |
| `name` | Nome do item | ✅ |
| `description` | Descrição | ❌ |
| `price` | Valor (ex: 99.90 ou 99,90) | ❌ |
| `stock_quantity` | Estoque (só produtos) | ❌ |
| `duration_minutes` | Duração (só serviços) | ❌ |
| `opportunity_alert_days` | Dias para alerta | ❌ |

### Exemplo:
```
type;name;description;price;stock_quantity;duration_minutes;opportunity_alert_days
product;Creme Facial;Creme hidratante;89.90;50;;30
service;Limpeza de Pele;Procedimento completo;150.00;;60;7
```

### Passo 3: Importar
1. Salve a planilha como **CSV**
2. Clique em **"Importar"**
3. Leia o aviso e clique em **"Continuar"**
4. Selecione o arquivo CSV
5. Aguarde a importação

---

## Alerta de Oportunidade

Funcionalidade que gera oportunidades de venda automáticas.

**Exemplo**: Serviço de limpeza de pele com alerta de 7 dias.
- Cliente faz o serviço em 01/01
- Em 08/01, o sistema gera uma oportunidade para recontato

O alerta aparece no **Dashboard** na lista de oportunidades.

---

## Permissões por Cargo

| Ação | Admin | Supervisor | Agente |
|------|-------|------------|--------|
| Visualizar | ✅ | ✅ | ✅ |
| Criar | ✅ | ✅ | ❌ |
| Editar | ✅ | ✅ | ❌ |
| Excluir | ✅ | ❌ | ❌ |
| Excluir em massa | ✅ | ❌ | ❌ |
| Importar | ✅ | ✅ | ❌ |

---

## Problemas Comuns

### "Valor aparece como Sob Consulta"
- Isso ocorre quando o valor é R$ 0,00
- Para definir preço, edite o item

### "Erro na importação"
- Verifique se usou **ponto e vírgula (;)** como separador
- Verifique as colunas obrigatórias: `type` e `name`
- `type` deve ser exatamente `product` ou `service`

### "Não consigo excluir"
- Supervisores não têm permissão para excluir
- Apenas Admins podem excluir itens

### "Estoque não aparece"
- A coluna Estoque só aparece para **Produtos**
- Serviços mostram **Duração** no lugar

---

## Onde são Utilizados

Produtos e serviços aparecem em:
- **CRM**: Vincular a negociações (deals)
- **Vendas**: Registrar vendas realizadas
- **Oportunidades**: Recontatos automáticos
- **Agendamentos**: Vincular serviços a horários
- **IA**: Perguntas de qualificação e FAQ

---

## Dicas de Uso

1. **Seja descritivo**: Nomes claros ajudam nas buscas
2. **Configure alertas**: Para produtos/serviços recorrentes
3. **Use imagens**: Clientes visualizam melhor
4. **Importe em massa**: Para grandes catálogos
5. **Mantenha estoque atualizado**: Evita vender sem ter
