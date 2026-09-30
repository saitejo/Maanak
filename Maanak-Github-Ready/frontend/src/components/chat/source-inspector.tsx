"use client";

import { FileSearch, Quote, ShieldCheck, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { Citation } from "@/lib/types";

export function SourceInspector({ citation, onClose }: { citation: Citation | null, onClose?: () => void }) {
  if (!citation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center relative">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <FileSearch className="size-5" />
        </span>
        <div>
          <p className="font-heading text-lg">Verified Source Inspector</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Click any verified citation badge in the chat to inspect its BIS clause and legal groundings.
          </p>
        </div>
      </div>
    );
  }

  const scoreValue = citation.score !== undefined ? citation.score : 0.96;
  const percent = Math.round(Math.min(Math.max(scoreValue, 0), 1) * 100);
  
  let pdfFileName = citation.exact_pdf_name || "";
  let pdfUrl = "";

  try {
    if (!pdfFileName) {
      const s = (citation.is_number || "").toUpperCase();
      if (s.includes("302")) {
        const partMatch = s.match(/PART\s*(\d+)/);
        const secMatch = s.match(/SEC(?:TION)?\s*(\d+)/);
        if (partMatch && partMatch[1] === "2" && secMatch) {
          pdfFileName = `IS_302(PART2)SEC${secMatch[1]}.pdf`;
        } else if (partMatch && partMatch[1] === "2") {
          pdfFileName = "IS_302(PART2)SEC2.pdf";
        } else {
          pdfFileName = "IS_302(PART1).pdf";
        }
      } else if (s.includes("16102")) {
        pdfFileName = (s.includes("PART 2") || s.includes("PART2")) ? "IS_16102(PART2).pdf" : "IS_16102(PART1).pdf";
      } else if (s.includes("9968")) {
        pdfFileName = (s.includes("PART 2") || s.includes("PART2")) ? "IS_9968(PART2).pdf" : "IS_9968(PART1).pdf";
      } else if (s.includes("16333")) {
        pdfFileName = (s.includes("PART 3") || s.includes("PART3")) ? "IS_16333(PART3).pdf" : "IS_16333(PART1).pdf";
      } else if (s.includes("16335")) {
        pdfFileName = "IS-16335-2025.pdf";
      } else {
        const digits = s.match(/\d+/);
        pdfFileName = digits ? `IS_${digits[0]}.pdf` : `${s.replace(/ /g, '_')}.pdf`;
      }
    }
    
    // Strip chunking suffixes like _part1 or _sec2 from the clause string
    const rawClause = citation.clause || (citation as any).clause_no || "";
    const cleanClause = rawClause.split('_')[0].replace(/^clause\s*/i, '').trim();
    const pageNumber = citation.page || (citation as any).page_number || 1;
    
    // view=FitH zooms the PDF to fit the width, navpanes=0 hides the PDF sidebar
    pdfUrl = `/pdfs/${pdfFileName}#page=${pageNumber}&view=FitH&navpanes=0&search="${cleanClause}"`;
  } catch (error) {
    console.error("Citation error:", error);
    pdfUrl = "error";
  }

  if (pdfUrl === "error") {
    return <div className="p-4 text-red-500">Error rendering citation data.</div>;
  }

  const rawClause = citation.clause || (citation as any).clause_no || "";
  const cleanClause = rawClause.split('_')[0].replace(/^clause\s*/i, '').trim();
  const pageNumber = citation.page || (citation as any).page_number || 1;

  return (
    <div className="flex h-full w-full max-w-full flex-col bg-background overflow-hidden relative">
      {/* Close Button overlay */}
      {onClose && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="absolute top-2 right-2 z-10 size-8 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </Button>
      )}

      {/* TOP: Small Heading */}
      <div className="flex-none border-b px-4 py-3 pr-12">
        <h2 className="text-sm font-bold text-foreground">
          {citation.is_number}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Displaying PDF document containing Clause {cleanClause || "referenced"} on Page {pageNumber}.
        </p>
      </div>

      {/* BOTTOM: The Live PDF Scroller */}
      <div className="flex-1 w-full bg-muted/20 relative overflow-hidden">
        <iframe 
          key={pdfUrl}
          src={pdfUrl} 
          className="absolute inset-0 w-full h-full border-none bg-white"
          title="BIS Source PDF"
        />
      </div>
    </div>
  );
}
