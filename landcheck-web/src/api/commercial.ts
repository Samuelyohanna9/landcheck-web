import { api, extractApiErrorMessage } from "./client";

export type EstateDemoRequestPayload = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  message?: string;
  source_path?: string;
  website?: string;
};

export type EstateDemoRequestResult = {
  status: "received";
  request_id: string | null;
  already_processed: boolean;
  notification_sent?: boolean;
};

export async function submitEstateDemoRequest(
  payload: EstateDemoRequestPayload,
  idempotencyKey: string,
): Promise<EstateDemoRequestResult> {
  try {
    const response = await api.post<EstateDemoRequestResult>("/commercial/estate-demo", payload, {
      headers: { "X-Idempotency-Key": idempotencyKey },
    });
    return response.data;
  } catch (error) {
    throw new Error(await extractApiErrorMessage(error, "We couldn't send your request. Please try again."));
  }
}
