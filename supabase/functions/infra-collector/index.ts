// infra-collector: Cron-triggered infrastructure metrics collector
// Collects n8n + Portainer stats and stores in infra_metrics table
// Auth: x-cron-secret header (from pg_cron) OR super-admin JWT (for "Collect Now" button)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // =============================================
    // Auth: cron secret OR super-admin JWT
    // =============================================
    const cronSecret = Deno.env.get("CRON_SECRET");
    const requestSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");

    let authorized = false;

    // Check cron secret first
    if (cronSecret && requestSecret === cronSecret) {
      authorized = true;
    }

    // Check super-admin JWT
    if (!authorized && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile?.role === "super-admin") authorized = true;
      }
    }

    // If no CRON_SECRET is configured, allow calls (function has its own jwt=false)
    if (!cronSecret && !authorized) authorized = true;

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =============================================
    // Read config from system_config
    // =============================================
    const { data: configs } = await supabase
      .from("system_config")
      .select("key, value");

    const config: Record<string, string> = {};
    for (const row of configs ?? []) config[row.key] = row.value;

    const n8nUrl = (config["n8n_url"] ?? "https://workflows.clinvia.com.br").replace(/\/$/, "");
    const portainerUrl = (config["portainer_url"] ?? "https://painel.clinvia.com.br").replace(/\/$/, "");
    const cpuThreshold = parseFloat(config["cpu_threshold"] ?? "80");
    const memThreshold = parseFloat(config["memory_threshold"] ?? "85");
    const n8nErrorThreshold = parseInt(config["n8n_error_threshold"] ?? "5");

    const N8N_API_KEY = Deno.env.get("N8N_API_KEY");
    const PORTAINER_TOKEN = Deno.env.get("PORTAINER_TOKEN");

    const alerts: Array<{
      type: string;
      severity: string;
      message: string;
      metadata: Record<string, unknown>;
    }> = [];

    // =============================================
    // Collect n8n metrics
    // =============================================
    let n8nActiveWorkflows = 0;
    let n8nFailedExecutions = 0;
    let n8nRecentErrors: unknown[] = [];
    let n8nReachable = false;

    if (N8N_API_KEY) {
      try {
        const [workflowsRes, executionsRes] = await Promise.allSettled([
          fetch(`${n8nUrl}/api/v1/workflows?active=true`, {
            headers: { "X-N8N-API-KEY": N8N_API_KEY },
            signal: AbortSignal.timeout(10000),
          }),
          fetch(`${n8nUrl}/api/v1/executions?status=error&limit=10`, {
            headers: { "X-N8N-API-KEY": N8N_API_KEY },
            signal: AbortSignal.timeout(10000),
          }),
        ]);

        if (workflowsRes.status === "fulfilled" && workflowsRes.value.ok) {
          const wData = await workflowsRes.value.json();
          n8nActiveWorkflows =
            wData?.count ?? (Array.isArray(wData?.data) ? wData.data.length : 0);
          n8nReachable = true;
        }

        if (executionsRes.status === "fulfilled" && executionsRes.value.ok) {
          const eData = await executionsRes.value.json();
          const errorList = eData?.data ?? [];
          n8nFailedExecutions = eData?.count ?? errorList.length;
          n8nRecentErrors = errorList.slice(0, 10).map((e: Record<string, unknown>) => ({
            id: e.id,
            workflowId: e.workflowId,
            workflowName: (e.workflowData as Record<string, unknown>)?.name ?? null,
            status: e.status,
            startedAt: e.startedAt,
            stoppedAt: e.stoppedAt,
          }));
          n8nReachable = true;
        }

        if (!n8nReachable) {
          alerts.push({
            type: "n8n_down",
            severity: "critical",
            message: "n8n is unreachable",
            metadata: { url: n8nUrl },
          });
        } else if (n8nFailedExecutions >= n8nErrorThreshold) {
          alerts.push({
            type: "n8n_error",
            severity: "warning",
            message: `n8n has ${n8nFailedExecutions} failed executions (threshold: ${n8nErrorThreshold})`,
            metadata: { count: n8nFailedExecutions, threshold: n8nErrorThreshold },
          });
        }
      } catch (err) {
        console.error("[infra-collector] n8n error:", err);
        alerts.push({
          type: "n8n_down",
          severity: "critical",
          message: `n8n unreachable: ${(err as Error).message}`,
          metadata: { url: n8nUrl },
        });
      }
    } else {
      console.warn("[infra-collector] N8N_API_KEY not configured");
    }

    // =============================================
    // Collect Portainer metrics
    // =============================================
    let containers: unknown[] = [];
    let totalContainers = 0;
    let runningContainers = 0;
    let stoppedContainers = 0;
    let avgCpu = 0;
    let avgMem = 0;
    let portainerReachable = false;

    if (PORTAINER_TOKEN) {
      try {
        // Step 1: Discover endpoints
        const endpointsRes = await fetch(`${portainerUrl}/api/endpoints`, {
          headers: { "X-API-Key": PORTAINER_TOKEN },
          signal: AbortSignal.timeout(10000),
        });

        if (endpointsRes.ok) {
          portainerReachable = true;
          const endpoints: Array<{ Id: number; Name: string }> =
            await endpointsRes.json();

          for (const endpoint of endpoints.slice(0, 5)) {
            // Step 2: Container list for this endpoint
            const containersRes = await fetch(
              `${portainerUrl}/api/endpoints/${endpoint.Id}/docker/containers/json?all=true`,
              {
                headers: { "X-API-Key": PORTAINER_TOKEN },
                signal: AbortSignal.timeout(15000),
              }
            );

            if (!containersRes.ok) continue;

            const containerList: Array<{
              Id: string;
              Names: string[];
              State: string;
              Status: string;
            }> = await containersRes.json();

            for (const container of containerList) {
              totalContainers++;
              const isRunning = container.State === "running";
              if (isRunning) runningContainers++;
              else stoppedContainers++;

              let cpuPercent = 0;
              let memPercent = 0;
              let memUsage = "0B";
              let memLimit = "0B";

              // Step 3: Stats for running containers
              if (isRunning) {
                try {
                  const statsRes = await fetch(
                    `${portainerUrl}/api/endpoints/${endpoint.Id}/docker/containers/${container.Id}/stats?stream=false`,
                    {
                      headers: { "X-API-Key": PORTAINER_TOKEN },
                      signal: AbortSignal.timeout(8000),
                    }
                  );

                  if (statsRes.ok) {
                    const stats = await statsRes.json();
                    const cpuDelta =
                      (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
                      (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
                    const systemDelta =
                      (stats.cpu_stats?.system_cpu_usage ?? 0) -
                      (stats.precpu_stats?.system_cpu_usage ?? 0);
                    const numCpus = stats.cpu_stats?.online_cpus ?? 1;
                    cpuPercent =
                      systemDelta > 0
                        ? parseFloat(
                            ((cpuDelta / systemDelta) * numCpus * 100).toFixed(2)
                          )
                        : 0;

                    const memUsageBytes = stats.memory_stats?.usage ?? 0;
                    const memLimitBytes = stats.memory_stats?.limit ?? 0;
                    memPercent =
                      memLimitBytes > 0
                        ? parseFloat(
                            ((memUsageBytes / memLimitBytes) * 100).toFixed(2)
                          )
                        : 0;
                    memUsage = formatBytes(memUsageBytes);
                    memLimit = formatBytes(memLimitBytes);
                  }
                } catch (_) {
                  // stats fetch failed — use zeros
                }

                if (cpuPercent > cpuThreshold) {
                  alerts.push({
                    type: "container_cpu",
                    severity: "warning",
                    message: `Container ${container.Names[0]?.replace("/", "")} CPU at ${cpuPercent}%`,
                    metadata: {
                      container: container.Names[0],
                      cpu_percent: cpuPercent,
                      threshold: cpuThreshold,
                    },
                  });
                }

                if (memPercent > memThreshold) {
                  alerts.push({
                    type: "container_memory",
                    severity: "warning",
                    message: `Container ${container.Names[0]?.replace("/", "")} memory at ${memPercent}%`,
                    metadata: {
                      container: container.Names[0],
                      mem_percent: memPercent,
                      threshold: memThreshold,
                    },
                  });
                }
              } else {
                alerts.push({
                  type: "container_down",
                  severity: "critical",
                  message: `Container ${container.Names[0]?.replace("/", "")} is ${container.State}`,
                  metadata: {
                    container: container.Names[0],
                    state: container.State,
                    endpoint: endpoint.Name,
                  },
                });
              }

              containers.push({
                id: container.Id.slice(0, 12),
                name: container.Names[0]?.replace("/", "") ?? "unknown",
                state: container.State,
                status: container.Status,
                endpoint: endpoint.Name,
                cpu_percent: cpuPercent,
                mem_percent: memPercent,
                mem_usage: memUsage,
                mem_limit: memLimit,
              });
            }
          }

          // Calculate averages from running containers only
          const runningList = (
            containers as Array<{
              state: string;
              cpu_percent: number;
              mem_percent: number;
            }>
          ).filter((c) => c.state === "running");

          if (runningList.length > 0) {
            avgCpu = parseFloat(
              (
                runningList.reduce((s, c) => s + c.cpu_percent, 0) /
                runningList.length
              ).toFixed(2)
            );
            avgMem = parseFloat(
              (
                runningList.reduce((s, c) => s + c.mem_percent, 0) /
                runningList.length
              ).toFixed(2)
            );
          }
        } else {
          alerts.push({
            type: "portainer_down",
            severity: "critical",
            message: `Portainer returned HTTP ${endpointsRes.status}`,
            metadata: { url: portainerUrl, status: endpointsRes.status },
          });
        }
      } catch (err) {
        console.error("[infra-collector] Portainer error:", err);
        alerts.push({
          type: "portainer_down",
          severity: "critical",
          message: `Portainer unreachable: ${(err as Error).message}`,
          metadata: { url: portainerUrl },
        });
      }
    } else {
      console.warn("[infra-collector] PORTAINER_TOKEN not configured");
    }

    // =============================================
    // Insert metrics snapshot
    // =============================================
    const { error: insertError } = await supabase.from("infra_metrics").insert({
      n8n_active_workflows: n8nActiveWorkflows,
      n8n_failed_executions: n8nFailedExecutions,
      n8n_recent_errors: n8nRecentErrors,
      n8n_reachable: n8nReachable,
      containers,
      total_containers: totalContainers,
      running_containers: runningContainers,
      stopped_containers: stoppedContainers,
      avg_cpu_percent: avgCpu,
      avg_memory_percent: avgMem,
      portainer_reachable: portainerReachable,
    });

    if (insertError) console.error("[infra-collector] Insert error:", insertError);

    // =============================================
    // Insert alerts (deduplicate within 10min window)
    // =============================================
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    for (const alert of alerts) {
      const { data: existing } = await supabase
        .from("alert_log")
        .select("id")
        .eq("type", alert.type)
        .eq("resolved", false)
        .gte("created_at", tenMinAgo)
        .limit(1)
        .single();

      if (!existing) {
        await supabase.from("alert_log").insert(alert);
      }
    }

    // =============================================
    // Purge old records (>30 days)
    // =============================================
    await supabase.rpc("cleanup_infra_metrics");

    console.log(
      `[infra-collector] Done. Containers: ${totalContainers}, n8n reachable: ${n8nReachable}, Alerts: ${alerts.length}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        collected_at: new Date().toISOString(),
        summary: {
          n8n_reachable: n8nReachable,
          portainer_reachable: portainerReachable,
          total_containers: totalContainers,
          running_containers: runningContainers,
          alerts_generated: alerts.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[infra-collector] Fatal error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}
