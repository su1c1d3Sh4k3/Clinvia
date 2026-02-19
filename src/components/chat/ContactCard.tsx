import { useState } from "react";
import { ContactModal } from "@/components/ContactModal";
import { NewMessageModal } from "@/components/NewMessageModal";

interface ContactCardProps {
    body: string;
}

function parseVCard(body: string) {
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
    const name = lines[0] || '';

    let phone = '';
    for (const line of lines) {
        const m = line.match(/^Phone.*?:\s*(.+)/i);
        if (m) { phone = m[1].trim(); break; }
    }

    let company = '';
    for (const line of lines) {
        const m = line.match(/^(?:X-Wa-Biz-Name|Company):\s*(.+)/i);
        if (m) { company = m[1].trim(); break; }
    }

    return { name, phone, company };
}

export function ContactCard({ body }: ContactCardProps) {
    const { name, phone, company } = parseVCard(body);
    const [contactModalOpen, setContactModalOpen] = useState(false);
    const [messageModalOpen, setMessageModalOpen] = useState(false);

    if (!name && !phone) return null;

    const cleanPhone = phone.replace(/\D/g, '');

    return (
        <>
            {/* Extend card to edges with -m-3 to override bubble padding */}
            <div className="flex flex-col min-w-[220px] -m-3 overflow-hidden rounded-lg">
                {/* Contact info */}
                <div className="flex flex-col px-4 pt-4 pb-3 gap-0.5">
                    {name && <span className="text-base font-semibold leading-tight">{name}</span>}
                    {phone && <span className="text-sm opacity-70">{phone}</span>}
                    {company && company !== name && <span className="text-xs opacity-50 mt-0.5">{company}</span>}
                </div>

                {/* WhatsApp-style flat action buttons */}
                <div className="flex flex-col border-t border-black/10 dark:border-white/10">
                    <button
                        onClick={() => setContactModalOpen(true)}
                        className="w-full py-3 text-base font-semibold text-primary hover:opacity-75 transition-opacity border-b border-black/10 dark:border-white/10"
                    >
                        Adicionar aos contatos
                    </button>
                    <button
                        onClick={() => setMessageModalOpen(true)}
                        disabled={!cleanPhone}
                        className="w-full py-3 text-base font-semibold text-primary hover:opacity-75 transition-opacity disabled:opacity-40"
                    >
                        Enviar mensagem
                    </button>
                </div>
            </div>

            <ContactModal
                open={contactModalOpen}
                onOpenChange={setContactModalOpen}
                contactToEdit={{ id: '', push_name: name, number: cleanPhone ? `${cleanPhone}@s.whatsapp.net` : '', phone: cleanPhone, company: company || undefined } as any}
            />
            <NewMessageModal
                open={messageModalOpen}
                onOpenChange={setMessageModalOpen}
                prefilledPhone={cleanPhone}
            />
        </>
    );
}
