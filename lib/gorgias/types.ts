/** Subset of the Gorgias REST API shapes we use. Fields are optional where Gorgias may omit them. */

export interface GorgiasRef {
  id: number;
  email?: string | null;
  name?: string | null;
}

export interface GorgiasTag {
  id?: number;
  name: string;
}

export interface GorgiasTicket {
  id: number;
  status: "open" | "closed" | string;
  priority?: string | null;
  channel?: string | null;
  via?: string | null;
  subject?: string | null;
  spam?: boolean;
  customer?: GorgiasRef | null;
  assignee_user?: GorgiasRef | null;
  assignee_team?: { id: number; name?: string | null } | null;
  tags?: GorgiasTag[];
  messages_count?: number;
  created_datetime: string;
  updated_datetime?: string | null;
  last_message_datetime?: string | null;
  last_received_message_datetime?: string | null;
  snooze_datetime?: string | null;
}

export interface GorgiasMessage {
  id: number;
  ticket_id: number;
  from_agent: boolean;
  public?: boolean;
  channel?: string | null;
  via?: string | null;
  sender?: GorgiasRef | null;
  body_text?: string | null;
  stripped_text?: string | null;
  created_datetime: string;
  sent_datetime?: string | null;
}

export interface GorgiasUser {
  id: number;
  email: string;
  name?: string | null;
  role?: { name?: string } | string | null;
  active?: boolean;
}

export interface GorgiasList<T> {
  data: T[];
  meta?: { next_cursor?: string | null; prev_cursor?: string | null };
}
