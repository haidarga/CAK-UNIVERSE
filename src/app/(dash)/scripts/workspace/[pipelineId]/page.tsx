"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { 
  Wand2, 
  Sparkles, 
  RefreshCw, 
  Search, 
  FileText, 
  CheckCircle2, 
  LayoutTemplate,
  ChevronRight,
  ExternalLink
} from "lucide-react";

export default function ScriptWriterCockpit() {
  const params = useParams();
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
    <div className="flex h-screen w-full bg-[#FAFAFA] text-zinc-900 font-sans overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Pane 1: Brief & Ideation (Ethereal Glass Base) */}
      <div className="w-80 lg:w-96 flex flex-col border-r border-zinc-200/60 bg-white/40 backdrop-blur-2xl">
        <div className="p-6 border-b border-zinc-200/50">
          <div className="flex items-center gap-2 mb-1">
            <LayoutTemplate className="w-5 h-5 text-indigo-500" />
            <h2 className="text-sm font-bold tracking-tight text-zinc-800">Brief & Context</h2>
          </div>
          <p className="text-xs text-zinc-400 font-medium truncate font-mono">ID: {pipelineId}</p>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-8 scrollbar-hide">
          
          {/* Current Brief */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-widest text-zinc-400 uppercase">Incoming Brief</h3>
            <div className="p-4 bg-white rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-zinc-100 transition-all hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)]">
              <h4 className="font-semibold text-zinc-800 mb-3 text-sm">Summer Campaign V1</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Angle</span>
                  <span className="font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-md">Relatable struggle</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Format</span>
                  <span className="font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-md">Short-form</span>
                </div>
              </div>
            </div>
          </div>

          {/* Reverse Engineer */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-widest text-zinc-400 uppercase flex items-center gap-2">
              <Search className="w-3.5 h-3.5" /> Trend Benchmark
            </h3>
            <div className="relative group">
              <input 
                type="text" 
                placeholder="Paste TikTok/IG link..."
                className="w-full bg-white border border-zinc-200 text-zinc-800 text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all shadow-sm"
                value={benchmarkUrl}
                onChange={(e) => setBenchmarkUrl(e.target.value)}
              />
              <button 
                onClick={handleReverseEngineer}
                disabled={isGenerating === "benchmark" || !benchmarkUrl}
                className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 text-white rounded-lg flex items-center justify-center transition-colors"
              >
                {isGenerating === "benchmark" ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
              </button>
            </div>
            
            {benchmarkData && (
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50 mt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Extracted Topic</span>
                  <span className="text-sm font-medium text-indigo-950">{benchmarkData.topic}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Hook Pattern</span>
                  <span className="text-sm text-indigo-900">{benchmarkData.hook}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pane 2: Block Builder */}
      <div className="flex-1 flex flex-col bg-[#FDFDFD]">
        <div className="p-6 border-b border-zinc-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-10 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" /> Block Builder
            </h2>
            <p className="text-xs text-zinc-500 font-medium mt-1">Compose with AI, block by block</p>
          </div>
          <button className="flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors">
            Clear all
          </button>
        </div>

        <div className="p-6 md:p-8 flex-1 overflow-y-auto space-y-6 scrollbar-hide max-w-3xl mx-auto w-full">
          
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
      <div className="w-[400px] xl:w-[480px] flex flex-col bg-white border-l border-zinc-200/60 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.05)] z-20">
        <div className="p-6 border-b border-zinc-200/50 flex justify-between items-center bg-white/80 backdrop-blur-md">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-zinc-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" /> Human Polish
            </h2>
          </div>
          <button className="group bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-[0_2px_10px_-4px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_15px_-4px_rgba(0,0,0,0.4)]">
            Push to Docs
            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
        
        <div className="flex-1 p-6 flex flex-col bg-[#F9F9FB] relative overflow-hidden">
          {/* Mock embed container (Glassmorphism overlay indicating empty state) */}
          <div className="absolute inset-0 m-6 border border-zinc-200/80 rounded-2xl bg-white shadow-sm flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 ring-8 ring-blue-50/50">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-zinc-800 mb-2">Google Docs Not Synced</h3>
            <p className="text-sm text-zinc-500 mb-6 max-w-[250px] leading-relaxed">
              Generate your blocks first, then push them here for collaborative human editing.
            </p>
            <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full transition-colors">
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
    <div className="group bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.06)] hover:border-zinc-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400">
      <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold tracking-widest text-zinc-400">{title}</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-200/50 text-zinc-500">{subtitle}</span>
        </div>
        <button 
          onClick={onGenerate}
          disabled={isGenerating}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all
            ${isGenerating 
              ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
              : "bg-white border border-zinc-200 text-zinc-700 hover:text-indigo-600 hover:border-indigo-200 shadow-sm"}`}
        >
          {isGenerating ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          )}
          {isGenerating ? "Generating..." : "Generate AI"}
        </button>
      </div>
      <textarea 
        className={`w-full p-5 text-sm md:text-base text-zinc-800 leading-relaxed focus:outline-none resize-y ${minHeight} bg-transparent placeholder:text-zinc-300`}
        placeholder="Type or generate content..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
