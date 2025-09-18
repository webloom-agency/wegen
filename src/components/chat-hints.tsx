"use client";

import { useMemo } from "react";
import { Button } from "ui/button";
import { cn } from "lib/utils";

export interface ChatHintItem {
  id: string;
  text: string;
}

export function ChatHints({
  onSelect,
  className,
  max = 6,
  floating = false,
}: {
  onSelect: (text: string) => void;
  className?: string;
  max?: number;
  floating?: boolean;
}) {
  const items = useMemo<ChatHintItem[]>(() => {
    // Fixed French suggestions; keep them concise, actionable, and tool-aware
    const fixed: ChatHintItem[] = [
      { id: "seo-content", text: "crée un contenu SEO sur \"agence seo\"" },
      {
        id: "gsc-top-queries",
        text:
          "dis moi les 50 top mots-clés sur la Search Console de webloom.fr ce mois-ci, avec volume de recherche, et cree un tableau",
      },
      {
        id: "gdrive-kickoff",
        text:
          "recherche dans Google Drive le kickoff SEO caats et résume le moi",
      },
      {
        id: "compare-ads-gsc",
        text:
          "compare les top mots-clés de Google Ads et de la Search Console depuis 30 jours sur caats.co",
      },
      {
        id: "fathom-minutes",
        text:
          "compare les cinq derniers fathom de obat.fr et dis moi les pattens qui en ressortent",
      },
      {
        id: "scrape-pricing",
        text:
          "scrap https://webloom.fr et donne moi leur pricing",
      },
      {
        id: "ads-histogram",
        text:
          "crée un graphique des performances Google Ads de caats.co sur les 7 derniers jours",
      },
      {
        id: "nike-personae-image",
        text:
          "fais une recherche web sur la marque Nike, donne moi 4 personae cibles et crée une image seelab pour chacune",
      },
    ];

    // Light randomization: shuffle and take first N, so hints change across loads
    const shuffled = [...fixed].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.max(1, max));
  }, [max]);

  if (!items.length) return null;

  return (
    <div
      className={cn(
        floating ? "pointer-events-none" : "max-w-3xl mx-auto px-4",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap gap-2 justify-center",
          floating &&
            "backdrop-blur-sm supports-[backdrop-filter]:bg-background/40 bg-background/60 rounded-2xl px-3 py-2 border shadow-sm",
        )}
      >
        {items.map((item) => (
          <Button
            key={item.id}
            variant="secondary"
            size="sm"
            className={cn(
              "rounded-full px-3 py-1 text-xs hover:bg-accent",
              floating && "pointer-events-auto",
            )}
            onClick={() => onSelect(item.text)}
          >
            {item.text}
          </Button>
        ))}
      </div>
    </div>
  );
}


