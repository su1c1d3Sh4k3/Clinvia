// Fonte unica das chamadas a Admin API da organizacao na OpenAI.
//
// Usada por provision-openai-project, sync-openai-usage e admin-openai-account.
// O bundler do Deno inlina este arquivo: mexer aqui obriga redeploy das TRES.
//
// Regra da chave de admin (decisao do user em 22/09/2026): usa
// `OPENAI_ADMIN_KEY_WRITE` quando o secret existir; se nao existir, cai em
// `OPENAI_ADMIN_KEY` — que hoje e uma admin key de acesso total — e loga aviso.
// A origem volta em `source` para aparecer no relatorio de provisionamento.

const ADMIN_BASE = 'https://api.openai.com/v1/organization';

export type AdminKeySource = 'write' | 'fallback_shared';

export interface AdminKey {
    key: string;
    source: AdminKeySource;
}

export class OpenAIAdminError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 0) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

/** Nao lanca: devolve null quando nenhum dos dois secrets existe. */
export function resolveAdminKey(): AdminKey | null {
    const write = Deno.env.get('OPENAI_ADMIN_KEY_WRITE')?.trim();
    if (write) return { key: write, source: 'write' };

    const shared = Deno.env.get('OPENAI_ADMIN_KEY')?.trim();
    if (shared) {
        console.warn(
            '[openai-admin] OPENAI_ADMIN_KEY_WRITE nao existe: usando OPENAI_ADMIN_KEY, ' +
            'a admin key unica de leitura/escrita da organizacao. Separar as duas quando possivel.',
        );
        return { key: shared, source: 'fallback_shared' };
    }

    return null;
}

async function adminFetch(
    admin: AdminKey,
    path: string,
    init: RequestInit = {},
): Promise<any> {
    const url = path.startsWith('http') ? path : `${ADMIN_BASE}${path}`;
    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            headers: {
                'Authorization': `Bearer ${admin.key}`,
                'Content-Type': 'application/json',
                ...(init.headers || {}),
            },
        });
    } catch (err: any) {
        throw new OpenAIAdminError('openai_unreachable', `Falha de rede ao chamar a OpenAI: ${err?.message || err}`);
    }

    const text = await res.text();
    let parsed: any = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }

    if (!res.ok) {
        const detail = parsed?.error?.message || text?.slice(0, 400) || `HTTP ${res.status}`;
        const code = res.status === 401 || res.status === 403
            ? 'openai_admin_key_rejected'
            : res.status === 404
                ? 'openai_endpoint_not_found'
                : res.status === 429
                    ? 'openai_rate_limited'
                    : 'openai_error';
        throw new OpenAIAdminError(code, detail, res.status);
    }

    return parsed;
}

/** Nome do projeto/chave: `Clinbia - <empresa> - <8 primeiros do id>`. */
export function buildProjectName(
    profile: { id: string; company_name?: string | null; full_name?: string | null; email?: string | null },
): string {
    const fromEmail = typeof profile.email === 'string' && profile.email.includes('@')
        ? profile.email.split('@')[0]
        : '';
    const label = (profile.company_name?.trim() || profile.full_name?.trim() || fromEmail.trim() || 'conta')
        .replace(/\s+/g, ' ')
        .slice(0, 60);
    return `Clinbia - ${label} - ${profile.id.slice(0, 8)}`;
}

export async function createProject(admin: AdminKey, name: string): Promise<{ id: string; name: string }> {
    const data = await adminFetch(admin, '/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
    if (!data?.id) throw new OpenAIAdminError('openai_project_without_id', 'A OpenAI criou o projeto mas nao devolveu o id');
    return { id: data.id, name: data.name ?? name };
}

export async function findProjectByName(admin: AdminKey, name: string): Promise<{ id: string; name: string } | null> {
    // Usado so na recuperacao de falha parcial: o projeto foi criado, a gravacao no
    // banco nao. Sem isto, uma nova tentativa criaria projeto duplicado na OpenAI.
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
        const qs = new URLSearchParams({ limit: '100', include_archived: 'false' });
        if (after) qs.set('after', after);
        const data = await adminFetch(admin, `/projects?${qs.toString()}`);
        const list: any[] = Array.isArray(data?.data) ? data.data : [];
        const hit = list.find((p) => p?.name === name && p?.status !== 'archived');
        if (hit?.id) return { id: hit.id, name: hit.name };
        if (!data?.has_more || !list.length) return null;
        after = list[list.length - 1]?.id;
        if (!after) return null;
    }
    return null;
}

export interface ServiceAccount {
    id: string;
    name: string;
    apiKey: string;
    apiKeyId: string | null;
}

/** A chave em claro vem SO nesta resposta. Nunca logar `apiKey`. */
export async function createServiceAccount(
    admin: AdminKey,
    projectId: string,
    name: string,
): Promise<ServiceAccount> {
    const data = await adminFetch(admin, `/projects/${projectId}/service_accounts`, {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
    const apiKey = data?.api_key?.value;
    if (typeof apiKey !== 'string' || !apiKey.startsWith('sk-')) {
        throw new OpenAIAdminError(
            'openai_service_account_without_key',
            'A OpenAI criou a service account mas nao devolveu a chave em api_key.value',
        );
    }
    return {
        id: data?.id ?? '',
        name: data?.name ?? name,
        apiKey,
        apiKeyId: data?.api_key?.id ?? null,
    };
}

/**
 * Limite de gasto do projeto. NAO e fatal: o endpoint nao e documentado
 * publicamente e pode responder 404 conforme a organizacao. Devolve o motivo
 * para virar aviso no relatorio em vez de derrubar o provisionamento.
 */
export async function setProjectSpendLimit(
    admin: AdminKey,
    projectId: string,
    limitUsd: number,
): Promise<{ applied: boolean; warning?: string }> {
    try {
        await adminFetch(admin, `/projects/${projectId}/spend_limit`, {
            method: 'POST',
            body: JSON.stringify({
                threshold_amount: Math.round(limitUsd * 100),
                currency: 'USD',
                interval: 'month',
            }),
        });
        return { applied: true };
    } catch (err: any) {
        const warning = `Limite de US$ ${limitUsd} nao aplicado pela API (${err?.code || 'erro'}: ${err?.message || err}). ` +
            'Ajustar no painel da OpenAI, no projeto do cliente.';
        console.warn('[openai-admin] spend limit:', warning);
        return { applied: false, warning };
    }
}

export async function archiveProject(admin: AdminKey, projectId: string): Promise<void> {
    await adminFetch(admin, `/projects/${projectId}/archive`, { method: 'POST' });
}

export interface UsageBucketRow {
    day: string;            // YYYY-MM-DD
    projectId: string;
    model: string;
    inputTokens: number;
    inputCachedTokens: number;
    outputTokens: number;
    numModelRequests: number;
}

export interface CostBucketRow {
    day: string;
    projectId: string;
    lineItem: string;
    costUsd: number;
    currency: string;
}

const dayOf = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

async function paginate(admin: AdminKey, path: string, qs: URLSearchParams): Promise<any[]> {
    const buckets: any[] = [];
    let page: string | undefined;
    for (let i = 0; i < 50; i++) {
        const q = new URLSearchParams(qs);
        if (page) q.set('page', page);
        const data = await adminFetch(admin, `${path}?${q.toString()}`);
        for (const b of (Array.isArray(data?.data) ? data.data : [])) buckets.push(b);
        if (!data?.has_more || !data?.next_page) break;
        page = data.next_page;
    }
    return buckets;
}

/** Tokens por dia/projeto/modelo desde `startTime` (unix seconds). */
export async function fetchUsage(
    admin: AdminKey,
    startTime: number,
    projectIds?: string[],
): Promise<UsageBucketRow[]> {
    const qs = new URLSearchParams({ start_time: String(startTime), bucket_width: '1d', limit: '31' });
    qs.append('group_by', 'project_id');
    qs.append('group_by', 'model');
    for (const id of projectIds ?? []) qs.append('project_ids', id);

    const out: UsageBucketRow[] = [];
    for (const bucket of await paginate(admin, '/usage/completions', qs)) {
        const day = dayOf(bucket?.start_time ?? startTime);
        for (const r of (Array.isArray(bucket?.results) ? bucket.results : [])) {
            if (!r?.project_id) continue;
            out.push({
                day,
                projectId: r.project_id,
                model: r.model ?? '(sem modelo)',
                inputTokens: Number(r.input_tokens ?? 0),
                inputCachedTokens: Number(r.input_cached_tokens ?? 0),
                outputTokens: Number(r.output_tokens ?? 0),
                numModelRequests: Number(r.num_model_requests ?? 0),
            });
        }
    }
    return out;
}

/** Custo em dolar por dia/projeto/line item desde `startTime` (unix seconds). */
export async function fetchCosts(
    admin: AdminKey,
    startTime: number,
    projectIds?: string[],
): Promise<CostBucketRow[]> {
    const qs = new URLSearchParams({ start_time: String(startTime), bucket_width: '1d', limit: '31' });
    qs.append('group_by', 'project_id');
    qs.append('group_by', 'line_item');
    for (const id of projectIds ?? []) qs.append('project_ids', id);

    const out: CostBucketRow[] = [];
    for (const bucket of await paginate(admin, '/costs', qs)) {
        const day = dayOf(bucket?.start_time ?? startTime);
        for (const r of (Array.isArray(bucket?.results) ? bucket.results : [])) {
            if (!r?.project_id) continue;
            out.push({
                day,
                projectId: r.project_id,
                lineItem: r.line_item ?? '(total)',
                costUsd: Number(r?.amount?.value ?? 0),
                currency: (r?.amount?.currency ?? 'usd').toLowerCase(),
            });
        }
    }
    return out;
}
