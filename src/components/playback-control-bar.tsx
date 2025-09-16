import { useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaybackControlBarProps {
  isPlaying: boolean;
  progress_ms: number;
  duration_ms: number;
  trackId?: string;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (position_ms: number) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function PlaybackControlBar({
  isPlaying,
  progress_ms,
  duration_ms,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  isLoading = false,
  disabled = false,
}: PlaybackControlBarProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const calculatePositionFromEvent = useCallback(
    (clientX: number): number | null => {
      if (!progressBarRef.current || duration_ms === 0) return null;

      const rect = progressBarRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      return Math.floor(percentage * duration_ms);
    },
    [duration_ms]
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || isDragging) return;

      const newPosition = calculatePositionFromEvent(e.clientX);
      if (newPosition !== null) {
        onSeek(newPosition);
      }
    },
    [calculatePositionFromEvent, onSeek, disabled, isDragging]
  );

  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || duration_ms === 0) return;

      e.preventDefault();
      setIsDragging(true);

      const initialPosition = calculatePositionFromEvent(e.clientX);
      if (initialPosition !== null) {
        setDragProgress(initialPosition);
      }

      const handleMouseMove = (e: MouseEvent) => {
        const newPosition = calculatePositionFromEvent(e.clientX);
        if (newPosition !== null) {
          setDragProgress(newPosition);
        }
      };

      const handleMouseUp = (mouseUpEvent: MouseEvent) => {
        const finalPosition = calculatePositionFromEvent(mouseUpEvent.clientX);
        if (finalPosition !== null) {
          onSeek(finalPosition);
        }
        setIsDragging(false);
        setDragProgress(0);

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [calculatePositionFromEvent, duration_ms, onSeek, disabled, dragProgress]
  );

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Use drag progress while dragging, otherwise use actual progress
  const displayProgress = isDragging ? dragProgress : progress_ms;
  const progressPercentage =
    duration_ms > 0 ? (displayProgress / duration_ms) * 100 : 0;

  return (
    <div className="flex items-center gap-1 w-full">
      {/* Previous Button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={onPrevious}
        disabled={disabled || isLoading}
        className="h-7 w-7"
      >
        <SkipBack className="h-4 w-4 fill-current" />
      </Button>

      {/* Play/Pause Button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={onPlayPause}
        disabled={disabled || isLoading}
        className="h-7 w-7"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
      </Button>

      {/* Next Button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={onNext}
        disabled={disabled || isLoading}
        className="h-7 w-7"
      >
        <SkipForward className="h-4 w-4 fill-current" />
      </Button>

      {/* Time Display */}
      <span className="text-xs text-muted-foreground min-w-[35px] text-right">
        {formatTime(displayProgress)}
      </span>

      {/* Progress Bar */}
      <div
        ref={progressBarRef}
        className={cn(
          "flex-1 relative h-5 flex items-center cursor-pointer group",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onClick={handleProgressClick}
        onMouseDown={handleProgressMouseDown}
      >
        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
          <div className="w-full bg-secondary rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-100"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
        {/* Scrubber Handle - only visible on hover or when dragging */}
        {duration_ms > 0 && (
          <div
            className={cn(
              "absolute h-3 w-3 bg-primary rounded-full transition-opacity",
              "group-hover:opacity-100",
              isDragging ? "opacity-100 scale-125" : "opacity-0"
            )}
            style={{
              left: `${progressPercentage}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          />
        )}
      </div>

      {/* Duration Display */}
      <span className="text-xs text-muted-foreground min-w-[35px]">
        {formatTime(duration_ms)}
      </span>
    </div>
  );
}