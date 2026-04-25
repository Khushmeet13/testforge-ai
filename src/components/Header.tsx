interface HeaderProps {
  onReset: () => void;
  showReset: boolean;
  onBack?: () => void;  // Optional since it's conditional
  currentStep: string;  // Or more specific type like "upload" | "select" | "processing" | "complete"
}

export function Header({ onReset, showReset, onBack, currentStep }: HeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00ff9d] to-[#00cc7a] flex items-center justify-center shadow-[0_0_20px_rgba(0,255,157,0.4)]">
            <span className="text-black font-bold text-lg">T</span>
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#7b2fff] rounded-full border-2 border-[#0a0a0f] animate-pulse" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-white">test</span>
            <span className="text-[#00ff9d]">forge</span>
            <span className="text-white/30">.ai</span>
          </h1>
          <p className="text-white/30 text-xs tracking-widest uppercase">
            AI-Powered Test Generator
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
          <div className="w-1.5 h-1.5 bg-[#00ff9d] rounded-full animate-pulse" />
          <span className="text-white/50 text-xs tracking-wide">AI</span>
        </div>

        {showReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all duration-200 hover:bg-white/5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            New Project
          </button>
        )}
        
        {/* Optional: Add back button if onBack is provided */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all duration-200 hover:bg-white/5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        )}
        
        {/* Optional: Display current step if needed */}
        {/* {currentStep && (
          <div className="text-white/40 text-xs">
            Step: {currentStep}
          </div>
        )} */}
      </div>
    </header>
  );
}