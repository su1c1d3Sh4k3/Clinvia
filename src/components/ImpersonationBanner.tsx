import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft, Building2 } from 'lucide-react';

/**
 * Fixed banner that appears at the top of the page when super-admin is impersonating a client.
 * Shows client name and provides a "Return to Admin" button.
 */
export function ImpersonationBanner() {
    const { isImpersonating, impersonationData, isLoading, exitImpersonation } = useAdminImpersonate();

    if (!isImpersonating || !impersonationData) {
        return null;
    }

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 text-white shadow-lg">
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <ShieldAlert className="h-5 w-5 animate-pulse" />
                    <div className="flex items-center gap-2">
                        <span className="font-medium">Acessando como:</span>
                        <span className="font-bold">{impersonationData.targetUserName}</span>
                        {impersonationData.targetCompanyName && (
                            <span className="hidden sm:flex items-center gap-1 text-white/80">
                                <Building2 className="h-4 w-4" />
                                {impersonationData.targetCompanyName}
                            </span>
                        )}
                    </div>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={exitImpersonation}
                    disabled={isLoading}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {isLoading ? 'Voltando...' : 'Voltar ao Admin'}
                </Button>
            </div>
        </div>
    );
}
