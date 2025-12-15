import React, { useState, memo } from 'react';
import { ImageIcon, Video, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LazyMediaProps {
    type: 'image' | 'video';
    src: string;
    alt?: string;
    className?: string;
}

/**
 * LazyMedia - Component that shows a placeholder until user clicks to load.
 * This prevents loading many images/videos at once which causes performance issues.
 */
export const LazyMedia = memo(function LazyMedia({ type, src, alt, className }: LazyMediaProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleLoad = () => {
        setIsLoading(true);
        setIsLoaded(true);
    };

    if (!isLoaded) {
        return (
            <div
                className={cn(
                    "flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all",
                    "bg-muted/50 hover:bg-muted border border-dashed border-border",
                    "min-h-[120px] min-w-[200px] p-4 gap-2",
                    className
                )}
                onClick={handleLoad}
            >
                {type === 'image' ? (
                    <ImageIcon className="w-10 h-10 text-muted-foreground" />
                ) : (
                    <Video className="w-10 h-10 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    Clique para carregar {type === 'image' ? 'imagem' : 'vídeo'}
                </span>
            </div>
        );
    }

    if (type === 'image') {
        return (
            <img
                src={src}
                alt={alt || 'Imagem'}
                className={cn("max-w-full rounded-lg cursor-pointer mb-2", className, isLoading && "animate-pulse")}
                onClick={() => window.open(src, '_blank')}
                onLoad={() => setIsLoading(false)}
            />
        );
    }

    return (
        <video controls className={cn("w-full max-w-md rounded-lg mb-2", className)}>
            <source src={src} type="video/mp4" />
            Seu navegador não suporta o elemento de vídeo.
        </video>
    );
});

export default LazyMedia;
