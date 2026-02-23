export interface GoogleCalendarConnection {
  id: string;
  user_id: string;
  professional_id: string | null; // null = agenda da clínica
  google_account_email: string;
  calendar_id: string;
  sync_mode: 'one_way' | 'two_way';
  is_active: boolean;
  webhook_channel_id?: string | null;
  webhook_resource_id?: string | null;
  webhook_expiry?: string | null;
  created_at: string;
  updated_at: string;
}

export type GoogleSyncMode = 'one_way' | 'two_way';
