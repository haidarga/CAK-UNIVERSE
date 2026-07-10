"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Wand2, 
  Sparkles, 
  RefreshCw, 
  Search, 
  FileText, 
  CheckCircle2, 
  LayoutTemplate,
  ChevronRight,
  ExternalLink,
  ArrowLeft
} from "lucide-react";

export default function ScriptWriterCockpit() {
  const params = useParams();
  const router = useRouter();
  const pipelineId = params.pipelineId as string;

  const [hookText, setHookText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  const [benchmarkUrl, setBenchmarkUrl] = useState("");
  const [benchmarkData, setBenchmarkData] = useState<any>(null);

  const handleGenerateBlock = async (type: "hook" | "body" | "cta") => {
    setIsGenerating(type);
    setTimeout(() => {
      if (type === "hook") setHookText("Tunggu, yakin masih mau ngabisin waktu buat hal ini?");
      if (type === "body") setBodyText("Faktanya 80% kreator pemula salah pilih alat. CAK AI ngebantu lu cut proses dari 3 minggu jadi 3 jam doang. Lu tinggal review dan gas.");
      if (type === "cta") setCtaText("Klik link di bio buat coba akses gratisnya sekarang!");
      setIsGenerating(null);
    }, 1500);
  };

  const handleReverseEngineer = async () => {
    setIsGenerating("benchmark");
    setTimeout(() => {
      setBenchmarkData({
        topic: "Productivity hacks for Creators",
        hook: "Stop wasting time on X",
        angle: "Frustration to Relief",
      });
      setIsGenerating(null);
    }, 2000);
  };

  return (
    <div className="flex h-screen w-full bg-[#09090B] text-zinc-300 font-sans overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Pane 1: Brief & Ideation (Dark Ethereal Glass) */}
      <div className="w-80 lg:w-96 flex flex-col border-r border-white/5 bg-zinc-950/80 backdrop-blur-2xl relative z-20">
        <div className="p-6 border-b border-white/5 flex items-center gap-4">
          <button 
            onClick={() => router.push('/studio/script')}
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LayoutTemplate className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold tracking-tight text-zinc-100">Brief & Context</h2>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium truncate font-mono uppercase tracking-wider">ID: {pipelineId}</p>
          </div>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-8 scrollbar-hide">
          
          {/* Current Brief */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Incoming Brief</h3>
            <div className="p-4 bg-white/[0.02] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-white/[0.05] transition-all hover:bg-white/[0.04]">
              <h4 className="font-semibold text-zinc-200 mb-3 text-sm">Summer Campaign V1</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Angle</span>
                  <span className="font-medium text-zinc-300 bg-white/5 px-2 py-0.5 rounded-md">Relatable struggle</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Format</span>
                  <span className="font-medium text-zinc-300 bg-white/5 px-2 py-0.5 rounded-md">Short-form video</span>
                </div>
              </div>
            </div>
          </div>

          {/* Reverse Engineer */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
              <Search className="w-3.5 h-3.5" /> Trend Benchmark
            </h3>
            <div className="relative group">
              <input 
                type="text" 
                placeholder="Paste TikTok/IG link..."
                className="w-full bg-black/40 border border-white/10 text-zinc-200 text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-inner placeholder:text-zinc-600"
                value={benchmarkUrl}
                onChange={(e) => setBenchmarkUrl(e.target.value)}
              />
              <button 
                onClick={handleReverseEngineer}
                disabled={isGenerating === "benchmark" || !benchmarkUrl}
                className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-indigo-500/20 hover:bg-indigo-500/40 disabled:bg-white/5 disabled:text-zinc-600 text-indigo-300 border border-indigo-500/20 disabled:border-transparent rounded-lg flex items-center justify-center transition-all"
              >
                {isGenerating === "benchmark" ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
              </button>
            </div>
            
            {benchmarkData && (
              <div className="p-4 bg-indigo-950/30 rounded-xl border border-indigo-500/20 mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Extracted Topic</span>
                  <span className="text-sm font-medium text-zinc-200">{benchmarkData.topic}</span>
                </div>
                <div className="w-full h-px bg-white/5"></div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Hook Pattern</span>
                  <span className="text-xs text-zinc-400 leading-relaxed">{benchmarkData.hook}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pane 2: Block Builder */}
      <div className="flex-1 flex flex-col bg-[#060608] relative">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="p-6 border-b border-white/5 bg-transparent sticky top-0 z-10 flex justify-between items-center backdrop-blur-md">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" /> Block Builder
            </h2>
            <p className="text-[11px] text-zinc-500 font-medium mt-1 uppercase tracking-widest">Compose with AI, block by block</p>
          </div>
          <button className="flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider">
            Clear all
          </button>
        </div>

        <div className="p-6 md:p-8 flex-1 overflow-y-auto space-y-6 scrollbar-hide max-w-3xl mx-auto w-full z-10 relative">
          
          {/* HOOK BLOCK */}
          <BlockEditor 
            title="THE HOOK"
            subtitle="0 - 3 seconds"
            value={hookText}
            onChange={setHookText}
            onGenerate={() => handleGenerateBlock("hook")}
            isGenerating={isGenerating === "hook"}
            minHeight="min-h-[100px]"
          />

          {/* BODY BLOCK */}
          <BlockEditor 
            title="THE BODY"
            subtitle="Core narrative & value prop"
            value={bodyText}
            onChange={setBodyText}
            onGenerate={() => handleGenerateBlock("body")}
            isGenerating={isGenerating === "body"}
            minHeight="min-h-[200px]"
          />

          {/* CTA BLOCK */}
          <BlockEditor 
            title="CALL TO ACTION"
            subtitle="Ending & Conversion"
            value={ctaText}
            onChange={setCtaText}
            onGenerate={() => handleGenerateBlock("cta")}
            isGenerating={isGenerating === "cta"}
            minHeight="min-h-[100px]"
          />

        </div>
      </div>

      {/* Pane 3: Google Docs Live */}
      <div className="w-[400px] xl:w-[480px] flex flex-col bg-[#09090B] border-l border-white/5 shadow-[-20px_0_40px_-15px_rgba(0,0,0,0.5)] z-20">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-950/50 backdrop-blur-md">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" /> Human Polish
            </h2>
          </div>
          <button className="group bg-zinc-100 hover:bg-white text-zinc-900 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_-5px_rgba(255,255,255,0.5)]">
            Push to Docs
            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
        
        <div className="flex-1 p-6 flex flex-col relative overflow-hidden bg-black/20">
          {/* Mock embed container (Dark Glassmorphism) */}
          <div className="absolute inset-0 m-6 border border-white/5 rounded-2xl bg-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-3xl flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)]">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-zinc-200 mb-2">Google Docs Not Synced</h3>
            <p className="text-xs text-zinc-500 mb-6 max-w-[250px] leading-relaxed">
              Generate your blocks first, then push them here for collaborative human editing.
            </p>
            <button className="text-[11px] font-bold tracking-wide uppercase text-blue-400 hover:text-blue-300 flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-4 py-2 rounded-full transition-all">
              <ExternalLink className="w-3 h-3" /> Learn how it works
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

function BlockEditor({ 
  title, subtitle, value, onChange, onGenerate, isGenerating, minHeight 
}: { 
  title: string, subtitle: string, value: string, onChange: (val: string) => void, onGenerate: () => void, isGenerating: boolean, minHeight: string 
}) {
  return (
    <div className="group bg-white/[0.02] border border-white/5 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:bg-white/[0.03] hover:border-white/10 overflow-hidden focus-within:ring-1 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/50 focus-within:bg-white/[0.04]">
      <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-black/20">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">{title}</span>
          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-zinc-500 uppercase tracking-wider">{subtitle}</span>
        </div>
        <button 
          onClick={onGenerate}
          disabled={isGenerating}
          className={`text-[11px] font-bold tracking-wide uppercase px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]
            ${isGenerating 
              ? "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/5" 
              : "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-600 hover:bg-zinc-700"}`}
        >
          {isGenerating ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-500" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          )}
          {isGenerating ? "Generating..." : "Generate AI"}
        </button>
      </div>
      <textarea 
        className={`w-full p-5 text-sm md:text-sm text-zinc-200 leading-relaxed focus:outline-none resize-y ${minHeight} bg-transparent placeholder:text-zinc-700 font-medium`}
        placeholder="Type or generate content..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
