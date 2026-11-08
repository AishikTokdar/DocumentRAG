import modelCatalog from "@/lib/model-catalog.json";
import { Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Badge } from "@/components/ui/badge";
import { SectionWrapper } from "@/components/layout/page-wrapper";
import { StaggerReveal } from "@/components/ui/scroll-reveal";

type ProviderBlock = {
  name: string;
  icon: LucideIcon;
  description: string;
  models: string[];
  badge: string;
};

const providers: ProviderBlock[] = modelCatalog.providers.map(provider => ({
  name: `${provider.name === "gemini" ? "Google Gemini" : provider.name === "groq" ? "Groq" : "OpenRouter"} (Free tier)`,
  icon: Globe,
  description: "Curated text-generation models. Provider quotas and account billing settings apply.",
  models: provider.models.map(model => model.name),
  badge: "Free tier",
}));

export function ModelsSection() {
  return (
    <SectionWrapper id="models">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight mb-3">
          Supported AI Models &amp; Providers
        </h2>
        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 max-w-2xl mx-auto">
          Six free-tier AI providers offering sub-second responses with zero costs and automatic failover.
        </p>
      </div>

      <StaggerReveal baseDelay={0.1} staggerDelay={0.1} direction="up" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {providers.map((provider) => {
          const Icon = provider.icon;
          return (
            <SpotlightCard key={provider.name} spotlightColor="rgba(217, 119, 6, 0.12)">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200/60 dark:border-orange-800/40 flex items-center justify-center text-orange-600 dark:text-orange-500">
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      {provider.name}
                    </h3>
                  </div>
                  <Badge variant="accent" size="sm">
                    {provider.badge}
                  </Badge>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  {provider.description}
                </p>
                <div className="pt-2 border-t border-stone-200 dark:border-stone-800">
                  <div className="flex flex-wrap gap-1">
                    {provider.models.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 font-mono"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </SpotlightCard>
          );
        })}
      </StaggerReveal>
    </SectionWrapper>
  );
}
