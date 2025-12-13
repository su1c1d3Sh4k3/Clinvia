# Gerador de Funções Webhook para Instâncias Uzapi

Este script gera automaticamente uma Edge Function dedicada para cada instância Uzapi criada.

## Como Usar

### 1. Após criar uma instância via interface:

```bash
node scripts/generate-webhook-function.js <nome-da-instancia>
```

**Exemplo:**
```bash
node scripts/generate-webhook-function.js minha-instancia
```

### 2. O script irá:
1. ✅ Criar diretório `supabase/functions/uzapi-webhook-minha-instancia/`
2. ✅ Gerar `index.ts` a partir do template com instanceName hardcoded
3. ✅ Fazer deploy automático da função
4. ✅ Exibir a URL do webhook

### 3. Configurar o webhook no Uzapi:

Após o deploy, configure o webhook da instância para apontar para:
```
https://swfshqvvbohnahdyndch.supabase.co/functions/v1/uzapi-webhook-<nome-da-instancia>
```

## Estrutura

```
supabase/functions/
├── _webhook-template/     # Template base (NÃO MODIFICAR)
│   └── index.ts
├── uzapi-webhook-inst1/   # Função gerada para inst1
│   └── index.ts
└── uzapi-webhook-inst2/   # Função gerada para inst2
    └── index.ts
```

## Notas Importantes

- ⚠️ O nome da instância será sanitizado (apenas letras, números e hífens)
- ⚠️ Cada função é independente e processa apenas mensagens da sua instância
- ⚠️ Logs incluem prefixo `[nome-instancia]` para facilitar debugging
- ⚠️ Não modifique o template `_webhook-template/index.ts` diretamente

## Deletar Função

Para remover uma função webhook:

```bash
npx supabase functions delete uzapi-webhook-<nome-da-instancia>
```

E delete o diretório manualmente:
```bash
rm -rf supabase/functions/uzapi-webhook-<nome-da-instancia>
```
