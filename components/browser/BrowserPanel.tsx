"use client";

import { useState, useRef } from "react";
import {
    Globe, RefreshCw, ChevronLeft, ChevronRight,
    ExternalLink, Smartphone, Monitor
} from "lucide-react";

export default function BrowserPanel() {
    const [url, setUrl] = useState("http://localhost:3000");
    const [inputUrl, setInputUrl] = useState("http://localhost:3000");
    const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const reload = () => {
        if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
        }
    };

    const navigate = (e: React.FormEvent) => {
        e.preventDefault();
        let target = inputUrl;
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
            target = "http://" + target;
        }
        setUrl(target);
        setInputUrl(target);
    };

    // Listen to iframe load events to update URL if possible (though restricted by same-origin policy)
    const onLoad = () => {
        try {
            if (iframeRef.current?.contentWindow?.location.href) {
                const currentUrl = iframeRef.current.contentWindow.location.href;
                if (currentUrl !== "about:blank") {
                    setUrl(currentUrl);
                    setInputUrl(currentUrl);
                }
            }
        } catch {
            // Cross-origin access blocked, ignore
        }
    };

    return (
        <div className="sidebar h-full flex flex-col overflow-hidden bg-(--surface)">
            {/* Header bar */}
            <div className="h-10 flex items-center justify-between px-2 border-b border-(--border-subtle) bg-(--bg-2) shrink-0 space-x-2">
                <div className="flex items-center gap-1">
                    <button className="activity-btn w-7 h-7" title="Go back (not supported in iframe)">
                        <ChevronLeft size={14} />
                    </button>
                    <button className="activity-btn w-7 h-7" title="Go forward (not supported in iframe)">
                        <ChevronRight size={14} />
                    </button>
                    <button className="activity-btn w-7 h-7" onClick={reload} title="Reload">
                        <RefreshCw size={13} />
                    </button>
                </div>

                <form onSubmit={navigate} className="flex-1 max-w-[400px]">
                    <div className="relative flex items-center bg-(--bg-3) rounded border border-(--border) focus-within:border-(--accent) transition-colors h-7 overflow-hidden px-2">
                        <Globe size={11} className="text-(--text-muted) shrink-0" />
                        <input
                            className="flex-1 bg-transparent border-none outline-none text-[11px] px-2 text-(--text) font-mono"
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                        />
                    </div>
                </form>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        className={`activity-btn w-7 h-7 ${mode === "mobile" ? "text-(--accent)" : ""}`}
                        onClick={() => setMode(m => m === "desktop" ? "mobile" : "desktop")}
                        title="Toggle device size"
                    >
                        {mode === "mobile" ? <Smartphone size={13} /> : <Monitor size={13} />}
                    </button>
                    <button
                        className="activity-btn w-7 h-7"
                        onClick={() => window.open(url, "_blank")}
                        title="Open in new window"
                    >
                        <ExternalLink size={13} />
                    </button>
                </div>
            </div>

            {/* Browser viewport container */}
            <div className="flex-1 bg-(--bg) flex" style={{ overflow: "hidden" }}>
                <div className={`transition-all duration-300 mx-auto border-x border-(--border-subtle) ${mode === "mobile" ? "w-[375px] h-full shadow-2xl" : "w-full h-full"}`}>
                    <iframe
                        ref={iframeRef}
                        src={url}
                        onLoad={onLoad}
                        className="w-full h-full bg-white border-none"
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                        title="Preview"
                    />
                </div>
            </div>
        </div>
    );
}
