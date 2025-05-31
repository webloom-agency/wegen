import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MCPIcon } from "ui/mcp-icon";

export function MCPOverview() {
  const t = useTranslations("MCP");

  return (
    <Link
      href="/mcp/create"
      className="overflow-hidden cursor-pointer p-12 text-center border rounded-lg relative group transition-all duration-300  hover:border-foreground/40"
    >
      <GradientBars />
      <div className="flex flex-col items-center justify-center space-y-4 my-20">
        <h3 className="text-2xl md:text-4xl font-semibold flex items-center gap-3">
          <MCPIcon className="fill-foreground size-6 hidden sm:block" />
          {t("overviewTitle")}
        </h3>

        <p className="text-muted-foreground max-w-md">
          {t("overviewDescription")}
        </p>

        <div className="flex items-center gap-2 text-xl font-bold">
          {t("addMcpServer")}
          <ArrowUpRight className="size-6" />
        </div>
      </div>
    </Link>
  );
}

const calculateHeight = (index: number, total: number) => {
  const position = index / (total - 1);
  const maxHeight = 100;
  const minHeight = 30;

  const center = 0.5;
  const distanceFromCenter = Math.abs(position - center);
  const heightPercentage = Math.pow(distanceFromCenter * 2, 1.2);

  return minHeight + (maxHeight - minHeight) * heightPercentage;
};

const GradientBars: React.FC = () => {
  const length = 15;
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <div
        className="flex h-full group-hover:translate-y-1/2   transition-all duration-300"
        style={{
          width: "100%",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {Array.from({ length }).map((_, index) => {
          const height = calculateHeight(index, length);
          return (
            <div
              key={index}
              className="bg-gradient-to-t from-primary/40 to-transparent "
              style={{
                flex: "1 0 calc(100% / 15)",
                maxWidth: "calc(100% / 15)",
                height: "100%",
                transform: `scaleY(${height / 100})`,
                transformOrigin: "bottom",
                transition: "transform 0.5s ease-in-out",
                animation: "pulseBar 2s ease-in-out infinite alternate",
                animationDelay: `${index * 0.1}s`,
                outline: "1px solid rgba(0, 0, 0, 0)",
                boxSizing: "border-box",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
