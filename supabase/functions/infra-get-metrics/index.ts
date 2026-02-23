// infra-get-metrics: Retorna dados unificados de saúde da infraestrutura para /dev-manager
// Auth: Bearer JWT validado server-side + verificação de role super-admin

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Header de autorização ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super-admin") {
      return new Response(JSON.stringify({ error: "Acesso negado: somente super-admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MGMT_API_TOKEN — sem prefixo SUPABASE_ (bloqueado pela plataforma)
    const managementToken = Deno.env.get("MGMT_API_TOKEN");
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const last5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const next7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // =============================================
    // Busca paralela de dados (12 queries PostgREST)
    // =============================================
    const [
      infraMetricsRes,
      waInstancesRes,
      igInstancesRes,
      ticketsRes,
      wqPendingRes,
      wqProcessingRes,
      wqFailedRes,
      wqFailuresListRes,
      tokenUsageRes,
      alertsRes,
      liveSessionsRes,
      recentMessagesRes,
    ] = await Promise.allSettled([
      supabase.from("infra_metrics").select("*").order("collected_at", { ascending: false }).limit(1).single(),
      supabase.from("instances").select("id, name, instance_name, status, user_id"),
      supabase.from("instagram_instances").select("id, account_name, instagram_account_id, status, token_expires_at, user_id"),
      supabase.from("support_tickets")
        .select("id, title, priority, status, created_at, user_id, auth_user_id, creator_name, description, client_summary, support_response")
        .in("status", ["open", "viewed", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("webhook_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("webhook_queue").select("*", { count: "exact", head: true }).eq("status", "processing"),
      supabase.from("webhook_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("webhook_queue").select("id, instance_name, event_type, error_message, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(5),
      supabase.from("token_usage_log").select("owner_id, total_tokens, cost_usd").gte("created_at", last24h),
      supabase.from("alert_log").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("conversations").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress", "aberto", "pending", "pendente"]),
      supabase.from("messages").select("*", { count: "exact", head: true }).gte("created_at", last5min),
    ]);

    // =============================================
    // Extrair dados brutos
    // =============================================
    const waInstances = waInstancesRes.status === "fulfilled" ? (waInstancesRes.value.data ?? []) : [];
    const igInstances = igInstancesRes.status === "fulfilled" ? (igInstancesRes.value.data ?? []) : [];
    const tickets = ticketsRes.status === "fulfilled" ? (ticketsRes.value.data ?? []) : [];
    const tokenRows = tokenUsageRes.status === "fulfilled" ? (tokenUsageRes.value.data ?? []) : [];

    // =============================================
    // Buscar company_name dos profiles manualmente
    // =============================================
    const allUserIds = new Set<string>();
    for (const i of waInstances as Array<{ user_id: string }>) if (i.user_id) allUserIds.add(i.user_id);
    for (const i of igInstances as Array<{ user_id: string }>) if (i.user_id) allUserIds.add(i.user_id);
    for (const t of tickets as Array<{ auth_user_id: string; user_id: string }>) {
      if (t.auth_user_id) allUserIds.add(t.auth_user_id);
      else if (t.user_id) allUserIds.add(t.user_id);
    }
    for (const r of tokenRows as Array<{ owner_id: string }>) if (r.owner_id) allUserIds.add(r.owner_id);

    const profileMap: Record<string, string> = {};
    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, company_name")
        .in("id", Array.from(allUserIds));
      for (const p of profiles ?? []) {
        if (p.id) profileMap[p.id] = p.company_name ?? "Desconhecido";
      }
    }

    // =============================================
    // Estatísticas do banco de dados
    // Ordem: 1) Management API  2) SUPABASE_DB_URL (direto)  3) RPC
    // =============================================
    let dbStats: Record<string, unknown> | null = null;

    // --- 1. Management API SQL (requer MGMT_API_TOKEN) ---
    if (managementToken && projectRef) {
      try {
        const [dbBasicRes, dbSizesRes] = await Promise.allSettled([
          fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${managementToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `SELECT
                (SELECT count(*)::int FROM pg_stat_activity WHERE state = 'active') as active_connections,
                (SELECT count(*)::int FROM pg_stat_activity) as total_connections,
                (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
                round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2)::float as db_size_mb,
                COALESCE(round(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)::float, 0) as cache_hit_ratio
              FROM pg_statio_user_tables`,
            }),
            signal: AbortSignal.timeout(8000),
          }),
          fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${managementToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `SELECT schemaname || '.' || tablename AS "table",
                round(pg_total_relation_size(schemaname || '.' || tablename) / 1024.0 / 1024.0, 2)::float AS size_mb
              FROM pg_tables WHERE schemaname = 'public'
              ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC LIMIT 10`,
            }),
            signal: AbortSignal.timeout(8000),
          }),
        ]);

        if (dbBasicRes.status === "fulfilled" && dbBasicRes.value.ok) {
          const rows = await dbBasicRes.value.json();
          if (Array.isArray(rows) && rows[0]) dbStats = { ...rows[0] };
        }
        if (dbSizesRes.status === "fulfilled" && dbSizesRes.value.ok && dbStats) {
          const sizes = await dbSizesRes.value.json();
          dbStats.table_sizes = Array.isArray(sizes) ? sizes : [];
        }
      } catch (err) {
        console.warn("[infra-get-metrics] DB stats via Management API falhou:", err);
      }
    }

    // --- 2. SUPABASE_DB_URL — conexão direta ao banco (sempre disponível) ---
    if (!dbStats) {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (dbUrl) {
        let pgClient: Client | null = null;
        try {
          pgClient = new Client(dbUrl);
          await pgClient.connect();

          const [statsResult, sizesResult] = await Promise.all([
            pgClient.queryObject<{
              active_connections: number;
              total_connections: number;
              max_connections: number;
              db_size_mb: number;
              cache_hit_ratio: number;
            }>(`SELECT
              (SELECT count(*)::int FROM pg_stat_activity WHERE state = 'active') as active_connections,
              (SELECT count(*)::int FROM pg_stat_activity) as total_connections,
              (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
              round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2)::float as db_size_mb,
              COALESCE(round(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)::float, 0) as cache_hit_ratio
            FROM pg_statio_user_tables`),
            pgClient.queryObject<{ table: string; size_mb: number }>(`
              SELECT schemaname || '.' || tablename AS "table",
                round(pg_total_relation_size(schemaname || '.' || tablename) / 1024.0 / 1024.0, 2)::float AS size_mb
              FROM pg_tables WHERE schemaname = 'public'
              ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC LIMIT 10
            `),
          ]);

          if (statsResult.rows[0]) {
            dbStats = {
              ...statsResult.rows[0],
              table_sizes: sizesResult.rows,
            };
          }
        } catch (err) {
          console.warn("[infra-get-metrics] DB stats via SUPABASE_DB_URL falhou:", err);
        } finally {
          if (pgClient) {
            try { await pgClient.end(); } catch (_) { /* ignore */ }
          }
        }
      }
    }

    // --- 3. RPC fallback ---
    if (!dbStats) {
      try {
        const { data: rpcData } = await supabase.rpc("get_database_stats");
        if (rpcData) {
          dbStats = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
        }
      } catch (err) {
        console.warn("[infra-get-metrics] RPC get_database_stats falhou:", err);
      }
    }

    // =============================================
    // Processar instâncias
    // =============================================
    const waDisconnected = (waInstances as Array<Record<string, unknown>>).filter(
      (i) => i.status === "disconnected" || i.status === "close"
    );
    const igDisconnected = (igInstances as Array<Record<string, unknown>>).filter((i) => {
      if (i.status === "disconnected" || i.status === "expired") return true;
      if (i.token_expires_at) return new Date(i.token_expires_at as string) <= new Date(next7days);
      return false;
    });

    const urgentTickets = (tickets as Array<Record<string, unknown>>).filter((t) => t.priority === "urgent");

    const wqPending = wqPendingRes.status === "fulfilled" ? (wqPendingRes.value.count ?? 0) : 0;
    const wqProcessing = wqProcessingRes.status === "fulfilled" ? (wqProcessingRes.value.count ?? 0) : 0;
    const wqFailed = wqFailedRes.status === "fulfilled" ? (wqFailedRes.value.count ?? 0) : 0;
    const wqFailuresList = wqFailuresListRes.status === "fulfilled" ? (wqFailuresListRes.value.data ?? []) : [];

    // =============================================
    // Token usage por tenant
    // =============================================
    const tokenByOwner: Record<string, { company_name: string; total_tokens: number; total_cost: number }> = {};
    let grandTotalTokens = 0;
    let grandTotalCost = 0;
    for (const row of tokenRows as Array<{ owner_id: string; total_tokens: number; cost_usd: number }>) {
      if (!tokenByOwner[row.owner_id]) {
        tokenByOwner[row.owner_id] = {
          company_name: profileMap[row.owner_id] ?? "Desconhecido",
          total_tokens: 0,
          total_cost: 0,
        };
      }
      tokenByOwner[row.owner_id].total_tokens += row.total_tokens || 0;
      tokenByOwner[row.owner_id].total_cost += parseFloat(String(row.cost_usd || 0));
      grandTotalTokens += row.total_tokens || 0;
      grandTotalCost += parseFloat(String(row.cost_usd || 0));
    }
    const topTenants = Object.entries(tokenByOwner)
      .map(([id, data]) => ({ profile_id: id, ...data }))
      .sort((a, b) => b.total_tokens - a.total_tokens)
      .slice(0, 10);

    // =============================================
    // Logs de Edge Functions via Supabase Logflare
    // Endpoint: POST /analytics/endpoints/logs.all  com SQL
    // Requer: MGMT_API_TOKEN
    // =============================================
    let edgeLogs: unknown[] = [];

    if (managementToken && projectRef) {
      try {
        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const logsUrl = new URL(
          `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all`
        );
        logsUrl.searchParams.set(
          "sql",
          "SELECT id, timestamp, event_message, metadata FROM function_edge_logs ORDER BY timestamp DESC LIMIT 20"
        );
        logsUrl.searchParams.set("iso_timestamp_start", start.toISOString());
        logsUrl.searchParams.set("iso_timestamp_end", now.toISOString());

        const logsRes = await fetch(logsUrl.toString(), {
          headers: { Authorization: `Bearer ${managementToken}` },
          signal: AbortSignal.timeout(10000),
        });

        if (logsRes.ok) {
          const logsData = await logsRes.json();
          const rawLogs = logsData?.result ?? logsData?.data ?? [];
          edgeLogs = rawLogs.slice(0, 20).map((log: Record<string, unknown>) => {
            const meta = (log.metadata as Array<Record<string, unknown>>)?.[0] ?? {};
            const resp = (meta["response"] as Array<Record<string, unknown>>)?.[0] ?? {};
            return {
              id: log.id ?? String(Math.random()),
              timestamp: log.timestamp,
              function_name: meta["function_id"] ?? meta["function_name"] ?? "",
              status: Number(resp["status_code"] ?? meta["status"] ?? 0),
              duration_ms: Math.round(Number(resp["origin_time"] ?? meta["execution_time_ms"] ?? 0)),
              event_message: log.event_message,
            };
          });
        } else {
          const errText = await logsRes.text().catch(() => "");
          console.warn(`[infra-get-metrics] Edge logs HTTP ${logsRes.status}:`, errText.slice(0, 300));
        }
      } catch (err) {
        console.warn("[infra-get-metrics] Logs de Edge Functions indisponíveis:", err);
      }
    }

    // =============================================
    // Resposta unificada
    // =============================================
    const infraMetrics = infraMetricsRes.status === "fulfilled" ? infraMetricsRes.value.data : null;
    const n8nFailed = infraMetrics?.n8n_failed_executions ?? 0;

    return new Response(
      JSON.stringify({
        refreshed_at: new Date().toISOString(),
        collected_at: infraMetrics?.collected_at ?? null,

        n8n: {
          active_workflows: infraMetrics?.n8n_active_workflows ?? 0,
          failed_executions: n8nFailed,
          recent_errors: infraMetrics?.n8n_recent_errors ?? [],
          reachable: infraMetrics?.n8n_reachable ?? false,
          status: !infraMetrics?.n8n_reachable ? "error" : n8nFailed >= 5 ? "warning" : "ok",
        },

        database: {
          active_connections: dbStats?.active_connections ?? 0,
          total_connections: dbStats?.total_connections ?? 0,
          max_connections: dbStats?.max_connections ?? 0,
          db_size_mb: dbStats?.db_size_mb ?? 0,
          cache_hit_ratio: dbStats?.cache_hit_ratio ?? 0,
          table_sizes: dbStats?.table_sizes ?? [],
          status: !dbStats ? "error" : Number(dbStats.active_connections ?? 0) > 80 ? "warning" : "ok",
        },

        containers: {
          total: infraMetrics?.total_containers ?? 0,
          running: infraMetrics?.running_containers ?? 0,
          stopped: infraMetrics?.stopped_containers ?? 0,
          avg_cpu_percent: infraMetrics?.avg_cpu_percent ?? 0,
          avg_memory_percent: infraMetrics?.avg_memory_percent ?? 0,
          list: infraMetrics?.containers ?? [],
          portainer_reachable: infraMetrics?.portainer_reachable ?? false,
          status: !infraMetrics?.portainer_reachable ? "error" : (infraMetrics?.stopped_containers ?? 0) > 0 ? "warning" : "ok",
        },

        instances: {
          wa_total: waInstances.length,
          wa_disconnected: waDisconnected.length,
          wa_disconnected_list: waDisconnected.slice(0, 20).map((i: Record<string, unknown>) => ({
            id: i.id, name: i.name, instance_name: i.instance_name, status: i.status,
            company_name: profileMap[i.user_id as string] ?? "Desconhecido",
          })),
          instagram_total: igInstances.length,
          instagram_disconnected: igDisconnected.length,
          instagram_disconnected_list: igDisconnected.slice(0, 20).map((i: Record<string, unknown>) => ({
            id: i.id, account_name: i.account_name, status: i.status,
            token_expires_at: i.token_expires_at,
            company_name: profileMap[i.user_id as string] ?? "Desconhecido",
          })),
          status: waDisconnected.length > 0 || igDisconnected.length > 0 ? "warning" : "ok",
        },

        tickets: {
          open_total: tickets.length,
          urgent_total: urgentTickets.length,
          urgent_list: urgentTickets.slice(0, 10).map((t: Record<string, unknown>) => ({
            id: t.id, title: t.title, priority: t.priority, status: t.status,
            created_at: t.created_at, creator_name: t.creator_name,
            description: t.description, client_summary: t.client_summary,
            support_response: t.support_response,
            company_name: profileMap[(t.auth_user_id as string) || (t.user_id as string)] ?? "Desconhecido",
          })),
          all_list: (tickets as Array<Record<string, unknown>>).slice(0, 20).map((t) => ({
            id: t.id, title: t.title, priority: t.priority, status: t.status,
            created_at: t.created_at, creator_name: t.creator_name,
            description: t.description, client_summary: t.client_summary,
            support_response: t.support_response,
            company_name: profileMap[(t.auth_user_id as string) || (t.user_id as string)] ?? "Desconhecido",
          })),
          status: urgentTickets.length > 0 ? "warning" : tickets.length > 0 ? "info" : "ok",
        },

        webhook_queue: {
          pending: wqPending,
          processing: wqProcessing,
          failed: wqFailed,
          recent_failures: wqFailuresList,
          status: wqFailed > 10 ? "error" : wqFailed > 0 ? "warning" : "ok",
        },

        tokens: {
          top_tenants: topTenants,
          grand_total_tokens: grandTotalTokens,
          grand_total_cost: parseFloat(grandTotalCost.toFixed(4)),
        },

        live_sessions: {
          active_conversations: liveSessionsRes.status === "fulfilled" ? (liveSessionsRes.value.count ?? 0) : 0,
          messages_last_5min: recentMessagesRes.status === "fulfilled" ? (recentMessagesRes.value.count ?? 0) : 0,
        },

        alerts: {
          recent: alertsRes.status === "fulfilled" ? (alertsRes.value.data ?? []) : [],
          unresolved_count: alertsRes.status === "fulfilled"
            ? (alertsRes.value.data ?? []).filter((a: Record<string, unknown>) => !a.resolved).length : 0,
        },

        edge_function_logs: edgeLogs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[infra-get-metrics] Erro fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
