// O admintoken da UAZAPI NAO pode existir neste arquivo: tudo aqui roda no
// NAVEGADOR e vira string literal dentro do bundle publico. Criar instancia e
// operacao de administrador do provedor e mora na edge function
// `uzapi-create-instance`, que le o segredo do ambiente. O `initInstance` que
// existia aqui era codigo morto (ninguem o chamava) e carregava o token junto.
const UZAPI_URL = 'https://clinvia.uazapi.com';

export interface UzapiInstance {
    instance: {
        instanceName: string;
        instanceId: string;
        status: string;
        serverUrl: string;
        apikey: string;
    };
}

export const uzapi = {
    // Conectar Instância (Gerar QR Code ou Pareamento)
    // Precisa do token da instância (retornado no init)
    connectInstance: async (instanceToken: string, phone?: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/instance/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'apikey': instanceToken // Token da instância
                },
                body: JSON.stringify(phone ? { phone } : {})
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error connecting instance: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to connect instance:", error);
            throw error;
        }
    },

    // Verificar Status da Instância
    fetchInstanceStatus: async (instanceToken: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/instance/status`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'apikey': instanceToken
                }
            });

            if (!response.ok) {
                throw new Error(`Error fetching status: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to fetch instance status:", error);
            throw error;
        }
    },

    // Deletar Instância
    deleteInstance: async (instanceToken: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/instance`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'apikey': instanceToken
                }
            });

            if (!response.ok) {
                throw new Error(`Error deleting instance: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to delete instance:", error);
            throw error;
        }
    },

    // Logout Instância
    logoutInstance: async (instanceToken: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/instance/logout`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'apikey': instanceToken
                }
            });

            if (!response.ok) {
                throw new Error(`Error logging out instance: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to logout instance:", error);
            throw error;
        }
    },

    // =============================================
    // MESSAGE ACTIONS
    // =============================================

    // Editar mensagem enviada
    editMessage: async (instanceToken: string, messageId: string, newText: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/message/edit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'token': instanceToken
                },
                body: JSON.stringify({
                    id: messageId,
                    text: newText
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error editing message: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to edit message:", error);
            throw error;
        }
    },

    // Apagar mensagem para todos
    deleteMessage: async (instanceToken: string, messageId: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/message/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'token': instanceToken
                },
                body: JSON.stringify({
                    id: messageId
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error deleting message: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to delete message:", error);
            throw error;
        }
    },

    // Reagir a uma mensagem
    reactToMessage: async (instanceToken: string, number: string, messageId: string, emoji: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/message/react`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'token': instanceToken
                },
                body: JSON.stringify({
                    number: number,
                    text: emoji,
                    id: messageId
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error reacting to message: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to react to message:", error);
            throw error;
        }
    },

    // Enviar mensagem com resposta (quote)
    sendTextWithReply: async (instanceToken: string, number: string, text: string, replyId: string) => {
        try {
            const response = await fetch(`${UZAPI_URL}/send/text`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'token': instanceToken
                },
                body: JSON.stringify({
                    number: number,
                    text: text,
                    replyid: replyId
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error sending reply: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to send reply:", error);
            throw error;
        }
    }
};
