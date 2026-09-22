// Listas explícitas de colunas para as tabelas que guardam segredo.
//
// Por que existe: `select("*")` numa tabela com coluna revogada faz o Postgres
// responder `permission denied for table` — a consulta inteira falha, não só a
// coluna. A Fase 3 do plano de segurança revoga o SELECT das colunas de token
// para o papel `authenticated`, então todo acesso do front precisa enumerar as
// colunas antes disso ir ao ar.
//
// Regra: NUNCA adicionar aqui uma coluna de token/chave. Segredo é lido apenas
// por edge function com a service key.

/** public.instances — sem `apikey` e `meta_access_token`. */
export const INSTANCE_COLUMNS = [
  "id",
  "name",
  "server_url",
  "status",
  "created_at",
  "updated_at",
  "instance_name",
  "qr_code",
  "webhook_url",
  "profile_pic_url",
  "pin_code",
  "cliente_number",
  "client_number",
  "user_name",
  "user_id",
  "ia_on_wpp",
  "workflow_id",
  "last_health_check",
  "last_disconnect_notified_at",
  "last_disconnect_reason",
  "consecutive_send_failures",
  "restriction_active",
  "restriction_until",
  "restriction_type",
  "restriction_detected_at",
  "provider",
  "meta_waba_id",
  "meta_phone_number_id",
  "is_automation_primary",
  "is_recurrence_primary",
  "automation_hold_until",
  "workflow_code",
  "disconnect_email_sent_at",
  "restriction_email_sent_at",
].join(", ");

// TODO(Fase 3): os pontos que ainda chamam a UAZAPI direto do navegador usam
// esta variante. Migrar cada um para edge function e apagar esta constante.
export const INSTANCE_COLUMNS_WITH_APIKEY = `${INSTANCE_COLUMNS}, apikey`;

/** public.instagram_instances — sem `access_token`. */
export const INSTAGRAM_INSTANCE_COLUMNS = [
  "id",
  "user_id",
  "account_name",
  "instagram_account_id",
  "token_expires_at",
  "status",
  "created_at",
  "updated_at",
  "ia_on_insta",
  "workflow_id",
  "facebook_page_id",
  "facebook_page_name",
  "contact_instance_id",
  "workflow_code",
].join(", ");

/** public.professional_google_calendars — sem `refresh_token` e `access_token`. */
export const PROFESSIONAL_GCAL_COLUMNS = [
  "id",
  "user_id",
  "professional_id",
  "google_account_email",
  "token_expiry",
  "calendar_id",
  "sync_mode",
  "webhook_channel_id",
  "webhook_resource_id",
  "webhook_expiry",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");

/** public.team_members — sem `expo_push_token` e `fcm_device_token`. */
export const TEAM_MEMBER_COLUMNS = [
  "id",
  "user_id",
  "name",
  "email",
  "phone",
  "role",
  "queue_ids",
  "created_at",
  "updated_at",
  "avatar_url",
  "auth_user_id",
  "full_name",
  "address",
  "instagram",
  "notifications_enabled",
  "group_notifications_enabled",
  "commission",
  "sign_messages",
  "push_notification_preferences",
  "instagram_notifications_enabled",
  "tokens_total",
  "approximate_cost_total",
  "audio_cost_total",
  "profile_pic_url",
  "notif_enabled",
  "notif_groups",
  "notif_instagram",
  "allowed_instance_ids",
  "assigned_queue_ids",
  "allowed_tag_ids",
  "agenda_view",
  "grouped_menu",
].join(", ");
