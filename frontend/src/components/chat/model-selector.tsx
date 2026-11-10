import * as React from "react";
import { AI_MODELS, type AIModel, type AIProvider } from "@/types";
import { API_ENDPOINTS, joinApiUrl } from "@/lib/constants";
export interface ModelSelectorProps { value:string;onChange:(model:AIModel)=>void;disabled?:boolean; }
export function ModelSelector({value,onChange,disabled=false}:ModelSelectorProps) {
 const [models,setModels]=React.useState<AIModel[]>(AI_MODELS);
 const [provider,setProvider]=React.useState("all");
 const id=React.useId();
  const selectionRef = React.useRef({ value, onChange });
  selectionRef.current = { value, onChange };
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(joinApiUrl(API_ENDPOINTS.MODELS));
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.models) && data.models.length > 0) {
          const live: AIModel[] = data.models.map(
            (m: {
              id: string;
              name: string;
              provider: string;
              is_default: boolean;
              is_available?: boolean;
              api_key_env?: string;
            }) => ({
              id: m.id,
              name: m.name,
              provider: m.provider as AIProvider,
              isDefault: m.is_default,
              isAvailable: m.is_available ?? true,
              apiKeyEnv: m.api_key_env,
            }),
          );
          setModels(live);
          const firstAvailable = live.find((m) => m.isAvailable !== false);
          const current = live.find((m) => m.id === selectionRef.current.value);
          if (firstAvailable && (!current || current.isAvailable === false)) {
            selectionRef.current.onChange(firstAvailable);
          }
        }
      } catch { /* empty */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

 const providers=Array.from(new Set(models.map(m=>m.provider)));
 const filtered=models.filter(m=>provider==="all"||m.provider===provider);
 const current=models.find(m=>m.id===value);
 return <div className="document-model-select">
  <label htmlFor={`${id}-provider`}>Provider</label>
  <select id={`${id}-provider`} value={provider} disabled={disabled} onChange={e=>setProvider(e.target.value)}><option value="all">All providers</option>{providers.map(p=><option key={p} value={p}>{p}</option>)}</select>
  <label htmlFor={id}>Model</label>
  <select id={id} value={value} disabled={disabled} onChange={e=>{const model=models.find(m=>m.id===e.target.value);if(model)onChange(model);}}>
   {!filtered.some(m=>m.id===value)&&current&&<option value={current.id}>{current.name}</option>}
   {filtered.map(m=><option key={`${m.provider}-${m.id}`} value={m.id} disabled={m.isAvailable===false}>{m.name} · {m.provider}{m.isAvailable===false?' — not configured':''}</option>)}
  </select>
  <p>{current?.isAvailable===true?'Provider configured. Actual model availability depends on the provider.':current?.isAvailable===false?'This provider is not configured on the server.':'Showing the local catalog. Provider availability has not been checked.'}</p>
 </div>;
}
