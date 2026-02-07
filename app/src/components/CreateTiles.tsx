import React from "react";
import { BookOpen, Dices, MessageCircle, Mic } from "lucide-react";

export type CreateTileKind = "game" | "story" | "character" | "voice";

type CreateTilesProps = {
  includeVoice?: boolean;
  iconSize?: number;
  onSelect: (kind: CreateTileKind) => void;
};

const TILE_CONFIG: Array<{
  kind: CreateTileKind;
  label: string;
  helper: string;
  bgClass: string;
  shadowColor: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    kind: "game",
    label: "Game",
    helper: "Play a game with AI",
    bgClass: "!bg-[#F4C095]",
    shadowColor: "#F4C095",
    Icon: Dices,
  },
  {
    kind: "story",
    label: "Story",
    helper: "Tell a story together",
    bgClass: "!bg-[#9EE6CF]",
    shadowColor: "#9EE6CF",
    Icon: BookOpen,
  },
  {
    kind: "character",
    label: "Character",
    helper: "Chat with any character",
    bgClass: "!bg-[#7C8DFF]",
    shadowColor: "#7C8DFF",
    Icon: MessageCircle,
  },
  {
    kind: "voice",
    label: "Voice",
    helper: "Clone a voice",
    bgClass: "!bg-[#7C8DFF]",
    shadowColor: "#7C8DFF",
    Icon: Mic,
  },
];

export const CreateTiles = ({
  includeVoice = true,
  iconSize = 24,
  onSelect,
}: CreateTilesProps) => {
  const tiles = includeVoice ? TILE_CONFIG : TILE_CONFIG.filter((t) => t.kind !== "voice");

  return (
    <div className="grid grid-cols-2 gap-4">
      {tiles.map(({ kind, label, helper, bgClass, shadowColor, Icon }) => (
        <button
          key={kind}
          type="button"
          className={`retro-btn w-full text-base flex-col gap-2 ${bgClass} ${kind === "character" || kind === "voice" ? "text-white" : "text-[#1A1D24]"}`}
          style={{ 
            boxShadow: `0 2px 8px ${shadowColor}40`,
            backgroundColor: shadowColor
          }}
          onClick={() => onSelect(kind)}
        >
          <Icon size={iconSize} className="shrink-0" />
          <span className="inline-flex items-center text-sm gap-2 font-medium">{label}</span>
          <span className="text-xs opacity-80">{helper}</span>
        </button>
      ))}
    </div>
  );
};
