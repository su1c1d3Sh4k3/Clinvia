const EVOLUTION_API_URL = import.meta.env.VITE_EVOLUTION_API_URL;
const EVOLUTION_API_GLOBAL_KEY = import.meta.env.VITE_EVOLUTION_API_GLOBAL_KEY;

if (!EVOLUTION_API_URL) {
    console.error("VITE_EVOLUTION_API_URL is not defined in .env");
}

if (!EVOLUTION_API_GLOBAL_KEY) {
    console.error("VITE_EVOLUTION_API_GLOBAL_KEY is not defined in .env");
}

export interface Instance {
    instance: {
        instanceName: string;
        instanceId: string;
        status: string;
        serverUrl: string;
        apikey: string;
    };
    hash: {
        apikey: string;
    };
}

export const evolutionApi = {
    // Listar todas as instâncias
    fetchInstances: async (): Promise<Instance[]> => {
        try {
            const response = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_GLOBAL_KEY
                }
            });

            if (!response.ok) {
                throw new Error(`Error fetching instances: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Failed to fetch instances:", error);
            throw error;
        }
    },

    // Criar uma nova instância
    createInstance: async (instanceName: string, token?: string, qrcode: boolean = true) => {
        try {
            const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_GLOBAL_KEY
                },
                body: JSON.stringify({
                    instanceName,
                    token,
                    qrcode
                })
            });

            if (!response.ok) {
                throw new Error(`Error creating instance: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to create instance:", error);
            throw error;
        }
    },

    // Conectar instância (gerar QR Code)
    connectInstance: async (instanceName: string) => {
        try {
            const response = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_GLOBAL_KEY
                }
            });

            if (!response.ok) {
                throw new Error(`Error connecting instance: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to connect instance:", error);
            throw error;
        }
    },

    // Verificar status da conexão
    fetchInstanceStatus: async (instanceName: string) => {
        try {
            const response = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_GLOBAL_KEY
                }
            });

            if (!response.ok) {
                // Se der 404, a instância pode não existir ou estar desligada
                if (response.status === 404) return { instance: { state: 'close' } };
                throw new Error(`Error fetching instance status: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to fetch instance status:", error);
            throw error;
        }
    },

    // Enviar mensagem de texto
    sendTextMessage: async (instanceName: string, number: string, text: string, apikey?: string) => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'apikey': apikey || EVOLUTION_API_GLOBAL_KEY
        };

        try {
            const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    number,
                    options: {
                        delay: 1200,
                        presence: "composing",
                        linkPreview: false
                    },
                    textMessage: {
                        text
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Error sending message: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to send message:", error);
            throw error;
        }
    },

    // Fazer logout da instância
    logoutInstance: async (instanceName: string, apikey?: string) => {
        try {
            const response = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apikey || EVOLUTION_API_GLOBAL_KEY
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

    // Deletar a instância
    deleteInstance: async (instanceName: string, apikey?: string) => {
        try {
            const response = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apikey || EVOLUTION_API_GLOBAL_KEY
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

    // Buscar foto de perfil de um contato (cliente)
    // remoteJid deve ser o ID completo: 5511999999999@s.whatsapp.net
    fetchContactProfilePicture: async (instanceName: string, remoteJid: string, apikey?: string) => {
        try {
            const encodedInstanceName = encodeURIComponent(instanceName);

            const response = await fetch(`${EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${encodedInstanceName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'apikey': apikey || EVOLUTION_API_GLOBAL_KEY
                },
                body: JSON.stringify({
                    number: remoteJid
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.warn('Could not fetch contact profile picture:', response.status, errorText);
                return null;
            }

            const data = await response.json();
            console.log('📸 API Response para foto do cliente:', data);

            const photoUrl = data.profilePictureUrl || data.profilePicUrl || data.url || null;
            if (photoUrl) {
                console.log('✅ URL da foto encontrada:', photoUrl);
            } else {
                console.warn('⚠️ Resposta da API não contém URL de foto. Campos disponíveis:', Object.keys(data));
            }

            return photoUrl;
        } catch (error) {
            console.error("Failed to fetch contact profile picture:", error);
            return null;
        }
    },

    // Buscar foto de perfil da própria instância
    fetchInstanceProfilePicture: async (instanceName: string, apikey?: string) => {
        try {
            const encodedInstanceName = encodeURIComponent(instanceName);

            const response = await fetch(`${EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${encodedInstanceName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'apikey': apikey || EVOLUTION_API_GLOBAL_KEY
                },
                body: JSON.stringify({
                    number: instanceName.replace(/[^0-9]/g, '')
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.warn('Could not fetch instance profile picture:', response.status, errorText);
                return null;
            }

            const data = await response.json();
            console.log('📸 API Response para foto da instância:', data);

            const photoUrl = data.profilePictureUrl || data.profilePicUrl || data.url || null;
            if (photoUrl) {
                console.log('✅ URL da foto da instância encontrada:', photoUrl);
            } else {
                console.warn('⚠️ Resposta da API não contém URL de foto. Campos disponíveis:', Object.keys(data));
            }

            return photoUrl;
        } catch (error) {
            console.error("Failed to fetch instance profile picture:", error);
            return null;
        }
    }
};
