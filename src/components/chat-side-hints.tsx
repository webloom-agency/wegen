"use client";

import { useMemo } from "react";
import { Button } from "ui/button";
import { cn } from "lib/utils";

export function ChatSideHints({
  onSelect,
  className,
  max = 4,
  direction = "column",
}: {
  onSelect: (text: string) => void;
  className?: string;
  max?: number;
  direction?: "row" | "column";
}) {
  const items = useMemo(() => {
    const fixed = [
      "crée un contenu SEO sur \"agence seo\"",
      "top 50 mots-clés Search Console de webloom.fr ce mois-ci en tableau",
      "résume les 5 plus récents fathom de obat.fr sur google drive et détecte les signaux faibles d'insatisfaction",
      "brief seo pour agence seo sur https://webloom.fr/referencement-naturel-seo/",
      "recherche dans Google Drive le préaudit SEO caats et résume les pb",
      "je veux un graph camembert de la part des clics search console vs clics google ads hors marque de caats.co",
      "compare les top mots-clés Google Ads vs Search Console (30 jours) pour caats.co",
      "scrap https://webloom.fr et donne le pricing sous forme de tableau",
      "montre moi la courbe des clics de obat.fr vs celle de caats.co (source : leur Search Console)",
      "graphique des performances Google Ads de caats.co (7 jours)",
      "recherche web sur Nike, définis 4 personae cibles et crée une image seelab pour chaque persona",
    ];
    return [...fixed].sort(() => Math.random() - 0.5).slice(0, max);
  }, [max]);

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none select-none",
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "flex gap-1 opacity-60 hover:opacity-80 transition-opacity",
          direction === "row"
            ? "flex-row flex-wrap justify-center items-center"
            : "flex-col items-end",
        )}
      >
        {items.map((text, idx) => (
          <Button
            key={idx}
            variant="ghost"
            size="sm"
            className="pointer-events-auto rounded-full px-2 py-0.5 text-[11px] h-6 bg-background/40 border backdrop-blur-md"
            onClick={() => onSelect(text)}
          >
            {text}
          </Button>
        ))}
      </div>
    </div>
  );
}


