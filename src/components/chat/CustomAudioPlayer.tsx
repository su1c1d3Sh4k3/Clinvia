import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Mic, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

// Constantes
const PLAYBACK_RATES = [1, 1.5, 2];

interface CustomAudioPlayerProps {
    audioUrl: string;
    transcription?: string;
    isOutbound?: boolean;
    senderName?: string;
    label?: string; // Ex: "Mensagem de voz"
}

export function CustomAudioPlayer({
    audioUrl,
    transcription,
    isOutbound = false,
    label = "Mensagem de voz",
    senderName
}: CustomAudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0); // 0 a 100
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRateIndex, setPlaybackRateIndex] = useState(0);
    const [waveformHeights, setWaveformHeights] = useState<number[]>([]);

    // Gerar a waveform de simulação apenas uma vez no mount
    useEffect(() => {
        const BARS = 36;
        const heights = Array.from({ length: BARS }, () =>
            Math.floor(Math.random() * 60) + 20 // Altura random entre 20% e 80% do contâiner
        );
        // Suavizar pontas (opcional)
        heights[0] = 20; heights[1] = 30;
        heights[BARS - 1] = 20; heights[BARS - 2] = 30;
        setWaveformHeights(heights);
    }, []);

    // Formatador de tempo min:seg
    const formatTime = (timeInSeconds: number) => {
        if (!timeInSeconds || isNaN(timeInSeconds)) return "0:00";
        const m = Math.floor(timeInSeconds / 60);
        const s = Math.floor(timeInSeconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(e => console.error("Error playing audio", e));
        }
        setIsPlaying(!isPlaying);
    };

    const changePlaybackRate = () => {
        if (!audioRef.current) return;
        const nextIndex = (playbackRateIndex + 1) % PLAYBACK_RATES.length;
        const nextRate = PLAYBACK_RATES[nextIndex];
        audioRef.current.playbackRate = nextRate;
        setPlaybackRateIndex(nextIndex);
    };

    const onTimeUpdate = () => {
        if (!audioRef.current) return;
        const current = audioRef.current.currentTime;
        setCurrentTime(current);
        if (duration > 0) {
            setProgress((current / duration) * 100);
        }
    };

    const onLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const onEnded = () => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(duration); // Deixa o progress e timer no fim visualmente
        if (audioRef.current) {
            audioRef.current.currentTime = 0; // Volta para zero no underlying player
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!audioRef.current || duration === 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;

        const newTime = percent * duration;
        audioRef.current.currentTime = newTime;
        setProgress(percent * 100);
        setCurrentTime(newTime);
    };

    // Cores baseadas na direção (cores premium inspiradas no app oficial)
    const bgColor = isOutbound
        ? "bg-[#DAF6C6] dark:bg-[#005149]"
        : "bg-gray-100 dark:bg-[#1E232B]";

    const cardBgColor = isOutbound
        ? "bg-[#C4EBAA]/80 dark:bg-[#00423A]"
        : "bg-[#E6EBEE]/80 dark:bg-[#2A313B]";

    const textColor = isOutbound
        ? "text-gray-800 dark:text-[#E9EDEF]"
        : "text-gray-800 dark:text-[#E9EDEF]";

    const primaryAccent = isOutbound
        ? "text-teal-600 dark:text-[#00A884]"
        : "text-primary dark:text-primary"; // Azul da paleta do app

    const activeWaveColor = isOutbound
        ? "bg-teal-600 dark:bg-[#00A884]"
        : "bg-primary dark:bg-primary"; // Preenchimento da wave

    const inactiveWaveColor = isOutbound
        ? "bg-teal-600/30 dark:bg-white/30"
        : "bg-gray-400/40 dark:bg-gray-500/50";

    return (
        <div className="flex flex-col gap-1 w-full max-w-[340px] sm:max-w-[400px]">
            {/* Elemento de áudio invisível para controle real nativo HTML5 */}
            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={onLoadedMetadata}
                onEnded={onEnded}
                preload="metadata"
                className="hidden"
            />

            {/* BOX PRINCIPAL DO PLAYER */}
            <div className={cn("rounded-2xl p-3 shadow-sm border border-black/5 dark:border-white/5", cardBgColor)}>

                {/* Cabeçalho do Player: Remetente + Tipo */}
                <div className="flex justify-between items-center mb-2.5 px-0.5">
                    <div className="flex items-center gap-1.5 flex-1 w-full overflow-hidden">
                        <Mic className={cn("w-3.5 h-3.5", primaryAccent)} />
                        <span className={cn("text-[13px] font-semibold truncate", primaryAccent)}>
                            {senderName || label}
                        </span>
                    </div>
                </div>

                {/* Controles do Player e Waveform */}
                <div className="flex items-center gap-3">

                    {/* Botão Multiplicador (1x, 1.5x, 2x) */}
                    <button
                        onClick={changePlaybackRate}
                        className={cn(
                            "w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full transition-colors text-xs font-bold leading-none select-none",
                            isOutbound ? "bg-black/10 hover:bg-black/15 dark:bg-black/20 dark:hover:bg-black/30 text-teal-800 dark:text-teal-200"
                                : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
                        )}
                        title="Velocidade"
                    >
                        {PLAYBACK_RATES[playbackRateIndex]}x
                    </button>

                    {/* Botão Play/Pause */}
                    <button
                        onClick={togglePlay}
                        className={cn(
                            "w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-95",
                            isOutbound ? "bg-teal-600 hover:bg-teal-700 text-white"
                                : "bg-[#202C33] dark:bg-white hover:bg-[#111B21] dark:hover:bg-gray-200 text-white dark:text-[#111B21]"
                        )}
                    >
                        {isPlaying ? (
                            <Pause className="w-5 h-5 fill-current" />
                        ) : (
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                    </button>

                    {/* Waveform Container */}
                    <div className="flex-1 flex items-center h-10 relative cursor-pointer group" onClick={handleSeek}>
                        <div className="absolute inset-0 flex items-center justify-between gap-[2px] w-full px-1">
                            {waveformHeights.map((h, i) => {
                                // Barra já percorrida
                                const isPassed = (i / waveformHeights.length) * 100 <= progress;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "w-1 rounded-full transition-colors duration-100 ease-linear",
                                            isPassed ? activeWaveColor : inactiveWaveColor
                                        )}
                                        style={{ height: `${h}%` }}
                                    />
                                );
                            })}
                        </div>
                        {/* Fake drag handle hover effect (opcional via tailwind peer/group) */}
                        <div className="absolute inset-y-0 opacity-0 group-hover:opacity-100 bg-black/5 dark:bg-white/5 rounded pointer-events-none transition-opacity duration-200" style={{ left: 0, right: 0 }} />
                    </div>

                    {/* Timer / Duração */}
                    <div className={cn("text-xs font-medium w-9 text-right tabular-nums tracking-tighter", textColor, "opacity-70")}>
                        {isPlaying ? formatTime(currentTime) : formatTime(duration > 0 ? duration : 0)}
                    </div>
                </div>
            </div>

            {/* BOX TRANSCRIPTION (Sempre que existir) */}
            {transcription && (
                <div className={cn(
                    "text-[13px] leading-relaxed p-3 rounded-xl border mt-0.5",
                    transcription.startsWith('[ERRO]')
                        ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
                        : isOutbound
                            ? 'text-teal-900 dark:text-teal-100 bg-[#C4EBAA]/40 dark:bg-[#00423A]/40 border-teal-600/20 dark:border-teal-400/20'
                            : 'text-gray-700 dark:text-gray-300 bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5'
                )}>
                    <span className="font-semibold block mb-0.5 opacity-80 uppercase tracking-wider text-[10px]">
                        {transcription.startsWith('[ERRO]') ? '⚠️ Falha na Transcrição' : '📝 Transcrição da IA'}
                    </span>
                    <span className="italic">"{transcription.replace('[ERRO] ', '')}"</span>
                </div>
            )}
        </div>
    );
}
