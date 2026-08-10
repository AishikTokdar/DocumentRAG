import {
  FileText,
  Search,
  Brain,
  Layers,
  Workflow,
  Radio,
  RefreshCw,
  BookOpen,
  HardDrive,
  Container,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { SectionWrapper } from "@/components/layout/page-wrapper";
import { FEATURES } from "@/lib/constants";
import { StaggerReveal } from "@/components/ui/scroll-reveal";

const featureIcons: LucideIcon[] = [
  FileText,
  Search,
  Brain,
  Layers,
  Workflow,
  Radio,
  RefreshCw,
  BookOpen,
  HardDrive,
  Container,
];

export function FeaturesSection() {
  return (
    <SectionWrapper id="features">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight mb-3">
          Key Capabilities &amp; Architecture
        </h2>
        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 max-w-2xl mx-auto">
          Everything required for production-ready document retrieval, local vector search, and failover model inference.
        </p>
      </div>

      <StaggerReveal baseDelay={0.1} staggerDelay={0.05} direction="up" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((feature, index) => {
          const Icon = featureIcons[index % featureIcons.length];
          return (
            <SpotlightCard key={feature.title} spotlightColor="rgba(245, 158, 11, 0.12)">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-center text-amber-600 dark:text-amber-500">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </SpotlightCard>
          );
        })}
      </StaggerReveal>
    </SectionWrapper>
  );
}
