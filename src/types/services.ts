export interface ServiceCategory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ServiceName {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ServiceApplication {
  id: string;
  service_name_id: string;
  name: string;
  description: string | null;
  default_price: number;
  default_min_price: number;
  default_expiry_months: number;
  default_recurrence: boolean;
  default_session_interval: number | null;
  created_at: string;
}

export interface ServiceClient {
  id: string;
  user_id: string;
  category_id: string;
  service_name_id: string;
  template_app_id: string | null;
  name: string;
  description: string | null;
  price: number;
  min_price: number;
  status: boolean;
  expiry_months: number;
  recurrence: boolean;
  session_interval: number | null;
  professionals: string[];
  commission_pct: number;
  msg_recurrence_1: string | null;
  msg_recurrence_2: string | null;
  msg_recurrence_3: string | null;
  time_recurrence_1: number | null;
  time_recurrence_2: number | null;
  time_recurrence_3: number | null;
  recurrence_stage: 'stg_1' | 'stg_2' | 'stg_3' | 'recuperado' | 'perdido' | null;
  created_at: string;
  updated_at: string;
}
