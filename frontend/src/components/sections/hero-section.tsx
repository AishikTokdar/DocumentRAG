import { Link } from "react-router-dom";
import { MAX_PDF_FILES } from "@/lib/constants";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
export function HeroSection() {
 const reduced=useReducedMotion();
 return <section className="desk-hero">
  <motion.div initial={reduced?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.3}}>
   <p className="desk-kicker">A little less searching. A little more understanding.</p>
   <h1>Your documents.<br/><span>A clearer conversation.</span></h1>
   <p className="desk-lead">Find the detail you need in a policy, make sense of a manual, or read across a set of reports. Ask in your own words. Keep the sources close.</p>
   <Link to="/chat" className="desk-primary">Open your workspace <ArrowUpRight size={18}/></Link>
   <p className="desk-caption">Up to {MAX_PDF_FILES} PDFs. 50 MB combined. No account required.</p>
  </motion.div>
  <div className="desk-workflow" aria-label="How it works">
   {[['01','Bring your reading','Upload PDFs with selectable text. Keep related documents together.'],['02','Ask what matters','A specific detail, an explanation, or a comparison. Start with the question you came for.'],['03','Follow the evidence','Read the answer alongside document and page references. Copy it, or take the conversation with you.']].map(([n,title,text])=><div key={n}><span className="desk-number">{n}</span><h2>{title}</h2><p>{text}</p></div>)}
  </div>
 </section>;
}
