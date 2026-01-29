/**
 * Webhook utility for sending client signup data
 * Sends POST request to external webhook endpoint when a new client registers
 */

const WEBHOOK_URL = "https://webhooks.clinvia.com.br/webhook/cliente-cadastrado";
const WEBHOOK_TIMEOUT = 5000; // 5 seconds

interface ClientSignupData {
    id: string;
    full_name: string;
    company_name: string;
    email: string;
    phone: string;
    instagram?: string;
    address: string;
    status: string;
    created_at: string;
}

interface WebhookPayload {
    event: string;
    timestamp: string;
    data: ClientSignupData;
}

/**
 * Sends client signup data to webhook endpoint
 * @param clientData - The client data from pending_signups table
 * @returns Promise<boolean> - True if successful, false otherwise
 */
export async function sendClientSignupWebhook(
    clientData: ClientSignupData
): Promise<boolean> {
    try {
        const payload: WebhookPayload = {
            event: "cliente-cadastrado",
            timestamp: new Date().toISOString(),
            data: clientData,
        };

        console.log("[Webhook] Sending client signup data:", payload);

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT);

        const response = await fetch(WEBHOOK_URL, {
            method: "POST",
            mode: "no-cors", // Important: prevents CORS errors
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // With no-cors mode, we can't read response status
        // Assume success if no error was thrown
        console.log("[Webhook] Request sent (no-cors mode, status unknown)");
        return true;
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === "AbortError") {
                console.error("[Webhook] Request timeout after 5 seconds");
            } else {
                console.error("[Webhook] Error:", error.message);
            }
        }

        // Don't retry with no-cors mode
        return false;
    }
}

/**
 * Retry function for webhook
 * @param payload - The webhook payload
 * @returns Promise<boolean> - True if successful, false otherwise
 */
async function retryWebhook(payload: WebhookPayload): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT);

        const response = await fetch(WEBHOOK_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log("[Webhook] Retry request sent (no-cors mode)");
        return true;
    } catch (error) {
        if (error instanceof Error) {
            console.error("[Webhook] Retry error:", error.message);
        }
        return false;
    }
}
