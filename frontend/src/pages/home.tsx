import { PageWrapper } from "@/components/layout/page-wrapper";
import { HeroSection, FeaturesSection } from "@/components/sections";
import { Link } from "react-router-dom";
export function HomePage() { return <PageWrapper showFooter><HeroSection/><FeaturesSection/><details className="desk-technical"><summary>For the technically curious</summary><p>DocumentRAG uses local CPU embeddings, hybrid retrieval, and a configured language model to answer questions with source references. Generation is bounded and evidence checks are conservative.</p><Link to="/api-status">View API configuration and status</Link></details></PageWrapper>; }
export default HomePage;
