import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
export function FeaturesSection() { return <section className="desk-notes" id="features" aria-labelledby="reading-heading">
 <div><p className="desk-kicker">Made for the reading in front of you</p><h2 id="reading-heading">From a small detail<br/>to the bigger picture.</h2><Link to="/chat" className="desk-text-link">Start with your documents <ArrowRight size={16}/></Link></div>
 <dl className="desk-task-list">
  <div><dt>Find a precise answer</dt><dd>Look up a notice period, a requirement, or a definition without searching page after page.</dd></div>
  <div><dt>Read across documents</dt><dd>Ask where your documents agree, where they differ, and which passages explain the difference.</dd></div>
  <div><dt>Keep a useful record</dt><dd>Return to saved conversations, inspect source references, and export as PDF, text, or Markdown.</dd></div>
 </dl>
 <div className="desk-footnote"><h3>A note about sources</h3><p>Document-only mode keeps answers tied to your PDFs. You can optionally add labeled background knowledge. Check important details against the original pages; source checks can still miss mistakes.</p><p>Scanned pages need an OCR text layer. Documents are processed on the server, and selected passages are sent to the configured AI provider. Saved conversations stay in this browser.</p></div>
 </section>; }
