import * as React from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { MAX_FILE_SIZE, MAX_PDF_FILES } from "@/lib/constants";
import { isValidPDF } from "@/lib/utils";
import type { DocumentFileMeta } from "@/types";
export interface PDFUploadProps {
 onUpload:(files:File[])=>Promise<void>; isUploading:boolean; isLoaded:boolean;
 chunksCreated?:number; files?:DocumentFileMeta[];totalFiles?:number;
 error?:string|null; onReset?:()=>void;
}
export function PDFUpload({onUpload,isUploading,isLoaded,chunksCreated,files=[],totalFiles=0,error,onReset}:PDFUploadProps) {
 const input=React.useRef<HTMLInputElement>(null);const [dragging,setDragging]=React.useState(false);const [validation,setValidation]=React.useState<string|null>(null);
 const choose=async(incoming:File[])=>{
  setValidation(null); if(!incoming.length)return;
  if(incoming.length>MAX_PDF_FILES){setValidation(`Choose up to ${MAX_PDF_FILES} PDFs.`);return;}
  if(incoming.some(f=>!isValidPDF(f))){setValidation("Choose PDF files with a .pdf extension.");return;}
  if(incoming.reduce((size,f)=>size+f.size,0)>MAX_FILE_SIZE){setValidation("The combined file size must be 50 MB or less.");return;}
  await onUpload(incoming);
 };
 return <div className="document-upload">
  <input ref={input} type="file" multiple accept=".pdf,application/pdf" className="hidden" aria-label="Upload PDF files" onChange={e=>{void choose(Array.from(e.currentTarget.files??[]));e.currentTarget.value="";}}/>
  {isUploading?<div className="upload-busy" role="status"><Loader2 size={20} className="animate-spin"/><p>Reading your documents<span>Extracting text and preparing the index. This may take a moment.</span></p></div>:isLoaded?<>
   <div className="document-ready"><span>{totalFiles||files.length||1} document{(totalFiles||files.length)>1?'s':''} ready</span>{onReset&&<button type="button" className="desk-icon-button" onClick={onReset} aria-label="Remove documents and start again"><X size={16}/></button>}</div>
   <ul className="document-file-list">{files.map((file,i)=><li key={`${file.file_name}-${i}`}><FileText size={17}/><div><span title={file.file_name}>{file.file_name}</span><small>{file.page_count} page{file.page_count===1?'':'s'}</small></div></li>)}</ul>
   <details className="document-index-details"><summary>Index details</summary><p>{chunksCreated??0} passages indexed. Source references retain document and page information.</p></details>
  </>:<div className={`document-dropzone ${dragging?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void choose(Array.from(e.dataTransfer.files));}}>
   <Upload size={22} aria-hidden="true"/><p>Drop your PDFs here</p><span>Up to {MAX_PDF_FILES} files, 50 MB combined</span><button type="button" className="document-choose" onClick={()=>input.current?.click()}>Choose PDFs</button>
  </div>}
  {(error||validation)&&<p role="alert" className="document-upload-error">{error||validation}</p>}
  {files.flatMap(f=>f.warnings??[]).map((warning,i)=><p key={i} role="status" className="document-coverage">{warning}</p>)}
  {!isLoaded&&!isUploading&&<p className="document-upload-help">Use PDFs with selectable text. Scanned pages need an OCR text layer.</p>}
 </div>;
}
