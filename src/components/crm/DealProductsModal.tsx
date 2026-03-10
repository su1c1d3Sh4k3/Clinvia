import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DealProductsForm, ProductItem } from "./DealProductsForm";
import { Package } from "lucide-react";
import { toast } from "sonner";

interface DealProductsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dealId: string;
    dealTitle: string;
    initialProducts: ProductItem[];
    onSaved: (products: ProductItem[]) => void;
}

export function DealProductsModal({
    open,
    onOpenChange,
    dealId,
    dealTitle,
    initialProducts,
    onSaved,
}: DealProductsModalProps) {
    const queryClient = useQueryClient();
    const [products, setProducts] = useState<ProductItem[]>(initialProducts);

    // Sincroniza ao abrir (caso initialProducts mude externamente)
    useEffect(() => {
        if (open) setProducts(initialProducts);
    }, [open, initialProducts]);

    const { data: productsServices = [] } = useQuery({
        queryKey: ["products-services"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products_services" as any)
                .select("*")
                .order("name", { ascending: true });
            if (error) throw error;
            return data as any[];
        },
        enabled: open,
    });

    const saveMutation = useMutation({
        mutationFn: async (items: ProductItem[]) => {
            // Remove todos os produtos atuais e reinsere
            await supabase.from("crm_deal_products" as any).delete().eq("deal_id", dealId);

            const valid = items.filter(p => p.productServiceId);
            if (valid.length > 0) {
                const { error } = await supabase.from("crm_deal_products" as any).insert(
                    valid.map(p => ({
                        deal_id: dealId,
                        product_service_id: p.productServiceId,
                        quantity: p.quantity,
                        unit_price: p.unitPrice,
                    }))
                );
                if (error) throw error;
            }

            // Sincroniza valor total na negociação
            const total = valid.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
            await supabase
                .from("crm_deals" as any)
                .update({ value: total, updated_at: new Date().toISOString() })
                .eq("id", dealId);

            return valid;
        },
        onSuccess: (saved) => {
            toast.success("Produtos/serviços salvos!");
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
            queryClient.invalidateQueries({ queryKey: ["deal-products", dealId] });
            onSaved(products);
            onOpenChange(false);
        },
        onError: (err: any) => {
            toast.error("Erro ao salvar: " + err.message);
        },
    });

    const totalValue = products
        .filter(p => p.productServiceId)
        .reduce((s, p) => s + p.quantity * p.unitPrice, 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Produtos/Serviços
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground truncate">{dealTitle}</p>
                </DialogHeader>

                <div className="py-2">
                    <DealProductsForm
                        products={products}
                        onChange={setProducts}
                        availableProducts={productsServices}
                    />
                </div>

                <DialogFooter className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-green-600">
                        Total:{" "}
                        {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                        }).format(totalValue)}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => saveMutation.mutate(products)}
                            disabled={saveMutation.isPending}
                        >
                            {saveMutation.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
