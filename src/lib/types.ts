export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price_fcfa: number;
  image_url: string | null;
  stock_disponible: number;
}

export interface OrderSuccessPayload {
  order_id: string;
  status: "en_attente" | "paye" | "echoue";
  client_name: string;
  client_whatsapp: string;
  application_name: string;
  amount_paid: number;
  subscription_start_at: string | null;
  subscription_end_at: string | null;
  access: null | {
    email: string;
    password: string;
    slot_number: number;
    profile_name: string | null;
  };
}

