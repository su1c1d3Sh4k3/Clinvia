/**
 * api-availability-sanbox  (sim, "sanbox", sem o 'd')
 *
 * REDE DE SEGURANÇA, não é uma API nova. Só carrega a gêmea correta
 * `api-availability-sandbox`, que se registra sozinha ao ser importada.
 *
 * Por que existe: o nó `get_next_dates` do FLUXO SANDBOX no n8n nasceu com
 * este slug errado. Corrigir o nó resolve — até alguém salvar o workflow por
 * cima com uma aba antiga do editor aberta, que foi exatamente o que
 * aconteceu em 25/09/2026 às 12:05 e devolveu o "not found" para o cliente
 * pela terceira vez. O nó voltar atrás não pode mais quebrar o ambiente de
 * teste: um slug que não existe vira 404 no gateway, ANTES de qualquer código
 * nosso, e os nós de tool do n8n carregam `neverError: true` — o 404 chega ao
 * modelo como se fosse resposta boa, sem execução vermelha e sem incidente.
 *
 * Não apagar sem antes conferir, no n8n, que nenhum nó aponta para cá.
 */
import "../api-availability-sandbox/index.ts";
