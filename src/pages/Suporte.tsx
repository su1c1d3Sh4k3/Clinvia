import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Megaphone } from "lucide-react";
import { CampaignsGuide } from "@/components/suporte/CampaignsGuide";

/**
 * Página Suporte — manual interativo do sistema.
 * Cada aba documenta uma ferramenta (por enquanto: Campanhas).
 */
export default function Suporte() {
    return (
        <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
            <div className="mb-4">
                <h1 className="text-2xl font-bold">Suporte</h1>
                <p className="text-sm text-muted-foreground">
                    Manuais interativos das ferramentas do sistema — aprenda no seu ritmo, com exemplos e simulações.
                </p>
            </div>
            <Tabs defaultValue="campanhas">
                <TabsList className="mb-4 flex w-full justify-start overflow-x-auto flex-nowrap">
                    <TabsTrigger value="campanhas" className="shrink-0 gap-1.5">
                        <Megaphone className="h-4 w-4" />
                        Campanhas
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="campanhas">
                    <CampaignsGuide />
                </TabsContent>
            </Tabs>
        </div>
    );
}
