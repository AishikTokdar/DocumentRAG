import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionWrapper } from "@/components/layout/page-wrapper";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export function CTASection() {
  const navigate = useNavigate();

  return (
    <SectionWrapper id="cta">
      <ScrollReveal direction="up" delay={0.1}>
        <div className="relative rounded-3xl overflow-hidden bg-stone-900 dark:bg-stone-950 border border-stone-800 shadow-2xl">
          {/* Background Decorative Gradients */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] bg-gradient-to-br from-amber-600/20 via-orange-500/10 to-transparent rounded-full blur-3xl opacity-50" />
            <div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] bg-gradient-to-tr from-lime-600/15 via-lime-500/5 to-transparent rounded-full blur-3xl opacity-50" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDE1Ii8+Cjwvc3ZnPg==')] opacity-30 mix-blend-overlay" />
          </div>

          <div className="relative z-10 px-6 py-16 sm:px-12 sm:py-20 text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-800/50 border border-stone-700/50 text-stone-300 text-xs font-medium mb-6 backdrop-blur-sm">
              <Shield className="w-3.5 h-3.5 text-lime-500" />
              100% Free &amp; Open Source
            </div>
            
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight mb-6">
              Ready to chat with your documents?
            </h2>
            
            <p className="text-stone-400 text-base sm:text-lg mb-10 max-w-2xl mx-auto">
              Experience the power of local RAG combined with cloud LLMs. Upload your PDFs and start extracting insights in seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Button size="lg" onClick={() => navigate("/chat")} className="w-full sm:w-auto relative group overflow-hidden bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20 border border-amber-500">
                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-cta-shine" />
                Launch Application
                <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" })}
                className="w-full sm:w-auto cursor-pointer border-stone-700 hover:bg-stone-800 text-stone-200"
              >
                Learn More
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-stone-400">
              {[
                "Zero Setup Configuration",
                "Automatic Model Failover",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-lime-500" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
}
