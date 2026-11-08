import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Sun, Moon, ArrowUpRight } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { useHealth } from "@/hooks/use-health";
import { ApiNavDropdown } from "./api-nav-dropdown";
import { SOCIAL_LINKS, joinApiUrl } from "@/lib/constants";
export function Header() {
 const [open,setOpen]=React.useState(false);const location=useLocation();const {isDark,toggleTheme}=useTheme();const {status}=useHealth();const menuRef=React.useRef<HTMLButtonElement>(null);
 React.useEffect(()=>{setOpen(false);},[location.pathname]);
 React.useEffect(()=>{if(!open)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);menuRef.current?.focus();}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[open]);
 return <><a className="desk-skip" href="#main-content">Skip to content</a><header className="desk-header"><div className="desk-header-inner">
 <Link to="/" className="desk-wordmark" aria-label="DocumentRAG home"><img className="desk-logo" src="/logo.svg" width={36} height={36} alt="" aria-hidden="true" />DocumentRAG</Link>
 <nav className="desk-desktop-nav" aria-label="Main navigation"><Link to="/" aria-current={location.pathname==='/'?'page':undefined}>Overview</Link><Link to="/chat" aria-current={location.pathname==='/chat'?'page':undefined}>Workspace</Link><ApiNavDropdown/><span className="desk-connection"><i data-state={status}/>{status==='connected'?'Connected':status==='disconnected'?'Backend offline':'Connecting'}</span></nav>
 <div className="desk-header-actions"><button type="button" onClick={toggleTheme} aria-label={isDark?'Switch to light theme':'Switch to dark theme'} className="desk-icon-button">{isDark?<Sun size={18}/>:<Moon size={18}/>}</button><Link to="/chat" className="desk-header-cta">Open workspace <ArrowUpRight size={15}/></Link><button type="button" ref={menuRef} className="desk-menu-button desk-icon-button" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="mobile-navigation" aria-label={open?'Close navigation':'Open navigation'}>{open?<X/>:<Menu/>}</button></div>
 </div>{open&&<nav id="mobile-navigation" className="desk-mobile-nav" aria-label="Mobile navigation"><Link to="/">Overview</Link><Link to="/chat">Workspace</Link><Link to="/api-status">API status</Link><a href={joinApiUrl('/redoc')} target="_blank" rel="noopener noreferrer">API documentation</a><a href={SOCIAL_LINKS.repository} target="_blank" rel="noopener noreferrer">Source code</a></nav>}</header></>;
}
