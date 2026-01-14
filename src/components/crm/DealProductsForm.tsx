import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { SaleCategoryLabels } from "@/types/sales";

export interface ProductItem {
    id: string; // temp id for new items, or real id for existing
    category: 'product' | 'service';
    productServiceId: string;
    quantity: number;
    unitPrice: number;
    name?: string; // For display
}

interface DealProductsFormProps {
    products: ProductItem[];
    onChange: (products: ProductItem[]) => void;
    availableProducts: { id: string; name: string; type: 'product' | 'service'; price: number }[];
    readOnly?: boolean;
}

export function DealProductsForm({ products, onChange, availableProducts, readOnly = false }: DealProductsFormProps) {

    const addProduct = () => {
        const newId = `temp-${Date.now()}`;
        onChange([...products, {
            id: newId,
            category: 'product',
            productServiceId: '',
            quantity: 1,
            unitPrice: 0,
        }]);
    };

    const removeProduct = (id: string) => {
        onChange(products.filter(p => p.id !== id));
    };

    const updateProduct = (id: string, field: keyof ProductItem, value: any) => {
        onChange(products.map(p => {
            if (p.id !== id) return p;
            const updated = { ...p, [field]: value };

            // Auto-update unitPrice and category when productServiceId changes
            if (field === 'productServiceId') {
                const selectedItem = availableProducts.find(item => item.id === value);
                if (selectedItem) {
                    updated.unitPrice = selectedItem.price;
                    updated.category = selectedItem.type;
                    updated.name = selectedItem.name;
                }
            }

            return updated;
        }));
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    // Filter items by category
    const getFilteredItems = (category: 'product' | 'service') => {
        return availableProducts.filter(item => item.type === category);
    };

    const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label>Produtos/Serviços</Label>
                <span className="text-xs text-muted-foreground">
                    Total: <span className="font-bold text-green-600">{formatCurrency(totalValue)}</span>
                </span>
            </div>

            {products.length === 0 && (
                <div className="text-sm text-muted-foreground text-center p-4 border border-dashed rounded-lg bg-muted/20">
                    Nenhum item adicionado
                </div>
            )}

            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin">
                {products.map((product) => (
                    <div key={product.id} className="flex gap-2 items-start p-2 border rounded-lg bg-card">
                        <div className="flex-1 grid grid-cols-12 gap-2">
                            {/* Category - col-span-3 */}
                            <div className="col-span-3">
                                <Select
                                    value={product.category}
                                    onValueChange={(val: 'product' | 'service') => {
                                        updateProduct(product.id, 'category', val);
                                        updateProduct(product.id, 'productServiceId', '');
                                    }}
                                    disabled={readOnly}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="product">Produto</SelectItem>
                                        <SelectItem value="service">Serviço</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Item - col-span-5 */}
                            <div className="col-span-5">
                                <Select
                                    value={product.productServiceId || "_empty"}
                                    onValueChange={(val) => updateProduct(product.id, 'productServiceId', val === "_empty" ? "" : val)}
                                    disabled={readOnly}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="_empty" disabled>Selecione</SelectItem>
                                        {getFilteredItems(product.category).map((item) => (
                                            <SelectItem key={item.id} value={item.id}>
                                                {item.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Qtd - col-span-2 */}
                            <div className="col-span-2">
                                <Input
                                    type="number"
                                    min={1}
                                    value={product.quantity}
                                    onChange={(e) => updateProduct(product.id, 'quantity', parseInt(e.target.value) || 1)}
                                    className="h-8 text-xs px-2"
                                    placeholder="Qtd"
                                    disabled={readOnly}
                                />
                            </div>

                            {/* Price (Display Only mostly) - col-span-2 */}
                            <div className="col-span-2 flex items-center justify-end text-xs font-medium text-green-600">
                                {formatCurrency(product.quantity * product.unitPrice)}
                            </div>
                        </div>

                        {!readOnly && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => removeProduct(product.id)}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                ))}
            </div>

            {!readOnly && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed h-8 text-xs"
                    onClick={addProduct}
                >
                    <Plus className="w-3.5 h-3.5 mr-2" />
                    Adicionar Item
                </Button>
            )}
        </div>
    );
}
