/**
 * Webhook utility for sending client approval data
 * Sends POST request to external webhook endpoint when admin approves a pending client
 */

const WEBHOOK_URL = "https://webhooks.clinvia.com.br/webhook/cadastro-aprovado";
const WEBHOOK_TIMEOUT = 5000; // 5 seconds

interface ClientApprovalData {
    id: string;
    full_name: string;
    company_name: string;
    email: string;
    phone: string;
    instagram?: string;
    address: string;
    approved_at: string;
}

interface WebhookPayload {
    event: string;
    timestamp: string;
    data: ClientApprovalData;
}

/**
 * Sends client approval data to webhook endpoint
 * @param clientData - The approved client data from pending_signups table
 * @returns Promise<boolean> - True if successful, false otherwise
 */
export async function sendClientApprovalWebhook(
    clientData: ClientApprovalData
): Promise<boolean> {
    try {
        const payload: WebhookPayload = {
            event: "cadastro-aprovado",
            timestamp: new Date().toISOString(),
            data: clientData,
        };

        console.log("[Webhook Approval] Sending client approval data:", payload);

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
        console.log("[Webhook Approval] Request sent (no-cors mode, status unknown)");
        return true;
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === "AbortError") {
                console.error("[Webhook Approval] Request timeout after 5 seconds");
            } else {
                console.error("[Webhook Approval] Error:", error.message);
            }
        }

        // Don't retry with no-cors mode
        return false;
    }
}
