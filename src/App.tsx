import { useEffect, useRef, useState, useCallback } from "react";
import { Game, type GameUIState } from "./game/Game";
import { PALETTE_HEX } from "./game/palette";
import type { TimeOfDay, Season } from "./game/constants";
import { cn } from "./utils/cn";

const CREATOR_NAME = "Rohit Kumar Mandal";
const CREATOR_HANDLE = "@gordxrohit";
// No verified profile URL was supplied, so the handle is intentionally non-clickable.
const CREATOR_URL: string | null = null;

function CreatorCredit({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("leading-tight", compact ? "text-[9px]" : "text-[10px] sm:text-xs")}>
      <div className="font-mono uppercase tracking-wide text-[var(--ink-dim)]">
        Created &amp; Designed by <span className="text-[var(--accent)]">{CREATOR_NAME}</span>
      </div>
      {CREATOR_URL ? (
        <a
          href={CREATOR_URL}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[var(--accent-2)] underline decoration-dotted hover:text-[var(--accent)]"
        >
          {CREATOR_HANDLE}
        </a>
      ) : (
        <span className="font-mono text-[var(--accent-2)]">{CREATOR_HANDLE}</span>
      )}
    </div>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-[var(--panel-border)] bg-[var(--panel-bg)] shadow-[3px_3px_0_var(--panel-shadow)] backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-silk text-[9px] uppercase tracking-widest text-[var(--accent-2)]">{children}</div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 rounded border-2 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
          : "border-[var(--panel-border)] bg-transparent text-[var(--ink)] hover:border-[var(--accent)]"
      )}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded border-2 border-[var(--panel-border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--ink)] hover:border-[var(--accent)]"
    >
      <span>{label}</span>
      <span
        className={cn(
          "ml-2 inline-block h-3 w-6 rounded-full border border-[var(--panel-border)] transition-colors",
          value ? "bg-[var(--accent)]" : "bg-transparent"
        )}
      >
        <span
          className={cn(
            "block h-2.5 w-2.5 translate-y-[1px] rounded-full bg-[var(--ink)] transition-transform",
            value ? "translate-x-[13px]" : "translate-x-[1px]"
          )}
        />
      </span>
    </button>
  );
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [ui, setUi] = useState<GameUIState | null>(null);
  const [supported, setSupported] = useState(true);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [timeOfDay, setTimeOfDayState] = useState<TimeOfDay>("sunset");
  const [season, setSeasonState] = useState<Season>("summer");
  const [pixelSize, setPixelSizeState] = useState(3);
  const [paletteOn, setPaletteOn] = useState(true);
  const [outlineOn, setOutlineOn] = useState(true);
  const [ditherOn, setDitherOn] = useState(true);
  const [raw3D, setRaw3D] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  const [ambientOn, setAmbientOn] = useState(true);

  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [pauseTab, setPauseTab] = useState<"menu" | "credits">("menu");
  const [showDrawnPanel, setShowDrawnPanel] = useState(false);

  // ---------------- init ----------------
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      setSupported(false);
      return;
    }
    if (!containerRef.current) return;
    const game = new Game(containerRef.current);
    gameRef.current = game;
    game.uiCallback = (s) => setUi(s);
    game.start();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyP" || e.code === "Escape") {
        setShowPauseMenu((v) => {
          const next = !v;
          if (game.running) game.paused = next;
          return next;
        });
      }
      if (e.code === "KeyQ") game.switchPlayer(-1);
      if (e.code === "KeyE") game.switchPlayer(1);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  const withGame = useCallback((fn: (g: Game) => void) => {
    if (gameRef.current) fn(gameRef.current);
  }, []);

  const handleStart = () => withGame((g) => g.startMatch());
  const handleRestart = () => withGame((g) => g.restartMatch());
  const handleTogglePause = () =>
    withGame((g) => {
      g.togglePause();
      setShowPauseMenu(g.paused);
    });

  const changeTimeOfDay = (t: TimeOfDay) => {
    setTimeOfDayState(t);
    withGame((g) => g.setTimeOfDay(t));
  };
  const changeSeason = (s: Season) => {
    setSeasonState(s);
    withGame((g) => g.setSeason(s));
  };
  const changePixelSize = (n: number) => {
    setPixelSizeState(n);
    withGame((g) => g.setPixelSize(n));
  };

  // mobile joystick
  const moveVecRef = useRef({ x: 0, z: 0 });
  const setMove = (x: number, z: number) => {
    moveVecRef.current = { x, z };
    withGame((g) => g.setMobileMove(x, z));
  };

  if (!supported) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-center text-zinc-200">
        <div className="max-w-md space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-8">
          <h1 className="font-silk text-xl text-amber-400">WebGL2 Not Available</h1>
          <p className="font-mono text-sm text-zinc-400">
            Hostel 7 Volleyball needs a browser with WebGL2 support to render its pixel-art 3D
            court. Please try an up-to-date version of Chrome, Firefox, Edge, or Safari.
          </p>
          <CreatorCredit />
        </div>
      </div>
    );
  }

  const phase = ui?.matchPhase ?? "intro";
  const notStarted = !ui?.matchStarted;

  return (
    <div
      data-theme={theme}
      className="relative h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]"
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* ---------------- TOP LEFT: title ---------------- */}
      <div className="pointer-events-none absolute left-2 top-2 sm:left-4 sm:top-4">
        <Panel className="pointer-events-auto px-3 py-2 sm:px-4 sm:py-3">
          <h1 className="font-silk text-[13px] leading-tight text-[var(--accent)] sm:text-lg">
            HOSTEL 7 VOLLEYBALL
          </h1>
          <p className="font-mono text-[9px] text-[var(--ink-dim)] sm:text-xs">
            Campus Sports · BIT Mesra
          </p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--accent-2)] sm:text-[10px]">
            Designed by {CREATOR_HANDLE}
          </p>
        </Panel>
      </div>

      {/* ---------------- TOP CENTER: scoreboard ---------------- */}
      <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 sm:top-4">
        <Panel className="pointer-events-auto px-3 py-2 sm:px-5 sm:py-3">
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="text-center">
              <div className="font-silk text-[10px] text-[var(--team-red)]">RED</div>
              <div className="font-mono text-2xl font-bold text-[var(--team-red)] sm:text-3xl">
                {ui?.scoreRed ?? 0}
              </div>
              <div className="font-mono text-[8px] text-[var(--ink-dim)]">SETS {ui?.setsRed ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[9px] text-[var(--ink-dim)]">SET {ui?.setNumber ?? 1}</div>
              <div className="font-silk text-[9px] text-[var(--ink-dim)]">VS</div>
              <div
                className={cn(
                  "mt-1 rounded border border-[var(--panel-border)] px-1 font-mono text-[8px] uppercase",
                  ui?.serverTeam === "RED" ? "text-[var(--team-red)]" : "text-[var(--team-blue)]"
                )}
              >
                {ui?.serverTeam ?? "RED"} SERVE
              </div>
            </div>
            <div className="text-center">
              <div className="font-silk text-[10px] text-[var(--team-blue)]">BLUE</div>
              <div className="font-mono text-2xl font-bold text-[var(--team-blue)] sm:text-3xl">
                {ui?.scoreBlue ?? 0}
              </div>
              <div className="font-mono text-[8px] text-[var(--ink-dim)]">SETS {ui?.setsBlue ?? 0}</div>
            </div>
          </div>
          {ui?.message && (
            <div
              key={ui.messageKey}
              className="mt-1 animate-[pulse_0.4s_ease-in-out] text-center font-silk text-[11px] text-[var(--accent)] sm:text-sm"
            >
              {ui.message}
            </div>
          )}
        </Panel>
      </div>

      {/* ---------------- RIGHT CONTROL RAIL ---------------- */}
      <div className="pointer-events-none absolute right-2 top-2 w-[150px] space-y-2 sm:right-4 sm:top-4 sm:w-[190px]">
        <Panel className="pointer-events-auto space-y-2 p-2 sm:p-3">
          <SectionLabel>Match</SectionLabel>
          <div className="flex gap-1">
            <button
              onClick={handleStart}
              className="flex-1 rounded border-2 border-[var(--accent)] bg-[var(--accent)] px-1 py-1 font-mono text-[10px] font-bold uppercase text-[var(--accent-ink)]"
            >
              {notStarted ? "Start" : "New"}
            </button>
            <button
              onClick={handleTogglePause}
              disabled={notStarted}
              className="flex-1 rounded border-2 border-[var(--panel-border)] px-1 py-1 font-mono text-[10px] font-bold uppercase text-[var(--ink)] disabled:opacity-40"
            >
              {ui?.paused ? "Resume" : "Pause"}
            </button>
          </div>
          <button
            onClick={handleRestart}
            className="w-full rounded border-2 border-[var(--panel-border)] px-1 py-1 font-mono text-[10px] font-bold uppercase text-[var(--ink)]"
          >
            Restart
          </button>
        </Panel>

        <Panel className="pointer-events-auto space-y-2 p-2 sm:p-3">
          <SectionLabel>Time</SectionLabel>
          <div className="flex gap-1">
            {(["day", "sunset", "night"] as TimeOfDay[]).map((t) => (
              <SegButton key={t} active={timeOfDay === t} onClick={() => changeTimeOfDay(t)}>
                {t.slice(0, 3)}
              </SegButton>
            ))}
          </div>
          <SectionLabel>Season</SectionLabel>
          <div className="flex gap-1">
            {(["summer", "autumn", "winter"] as Season[]).map((s) => (
              <SegButton key={s} active={season === s} onClick={() => changeSeason(s)}>
                {s.slice(0, 3)}
              </SegButton>
            ))}
          </div>
        </Panel>

        <Panel className="pointer-events-auto space-y-2 p-2 sm:p-3">
          <SectionLabel>View</SectionLabel>
          <div className="flex gap-1">
            <button
              onClick={() => withGame((g) => g.rotateCamera(-1))}
              className="flex-1 rounded border-2 border-[var(--panel-border)] py-1 font-mono text-xs"
            >
              ⟲
            </button>
            <button
              onClick={() => withGame((g) => g.rotateCamera(1))}
              className="flex-1 rounded border-2 border-[var(--panel-border)] py-1 font-mono text-xs"
            >
              ⟳
            </button>
            <button
              onClick={() => withGame((g) => g.zoomBy(-0.12))}
              className="flex-1 rounded border-2 border-[var(--panel-border)] py-1 font-mono text-xs"
            >
              +
            </button>
            <button
              onClick={() => withGame((g) => g.zoomBy(0.12))}
              className="flex-1 rounded border-2 border-[var(--panel-border)] py-1 font-mono text-xs"
            >
              −
            </button>
          </div>
          <div className="flex items-center justify-between font-mono text-[9px] text-[var(--ink-dim)]">
            <span>PIXEL SIZE</span>
            <span>{pixelSize}px</span>
          </div>
          <input
            type="range"
            min={2}
            max={6}
            step={1}
            value={pixelSize}
            onChange={(e) => changePixelSize(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <ToggleRow label="Palette" value={paletteOn} onChange={(v) => { setPaletteOn(v); withGame((g) => g.setPaletteEnabled(v)); }} />
          <ToggleRow label="Outlines" value={outlineOn} onChange={(v) => { setOutlineOn(v); withGame((g) => g.setOutlineEnabled(v)); }} />
          <ToggleRow label="Dithering" value={ditherOn} onChange={(v) => { setDitherOn(v); withGame((g) => g.setDitherEnabled(v)); }} />
          <ToggleRow label="Raw 3D Mode" value={raw3D} onChange={(v) => { setRaw3D(v); withGame((g) => g.setRaw3D(v)); }} />
        </Panel>

        <Panel className="pointer-events-auto space-y-2 p-2 sm:p-3">
          <SectionLabel>Audio</SectionLabel>
          <ToggleRow label="Sound FX" value={sfxOn} onChange={(v) => { setSfxOn(v); withGame((g) => g.setSfxEnabled(v)); }} />
          <ToggleRow label="Ambience" value={ambientOn} onChange={(v) => { setAmbientOn(v); withGame((g) => g.setAmbientEnabled(v)); }} />
          <SectionLabel>Theme</SectionLabel>
          <div className="flex gap-1">
            <SegButton active={theme === "light"} onClick={() => setTheme("light")}>Light</SegButton>
            <SegButton active={theme === "dark"} onClick={() => setTheme("dark")}>Dark</SegButton>
          </div>
        </Panel>
      </div>

      {/* ---------------- BOTTOM LEFT: hints ---------------- */}
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[260px] sm:bottom-4 sm:left-4">
        <Panel className="pointer-events-auto px-3 py-2 text-[9px] sm:text-[10px]">
          <SectionLabel>Controls</SectionLabel>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[var(--ink-dim)]">
            <span>WASD — move</span>
            <span>Space — jump</span>
            <span>J — bump/dig</span>
            <span>K — set</span>
            <span>L — serve/spike</span>
            <span>Shift — sprint</span>
            <span>Q/E — switch</span>
            <span>P/Esc — pause</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded border border-[var(--panel-border)] px-2 py-1">
            <span className="font-mono text-[var(--ink-dim)]">PLAYER #{ui?.selectedPlayerNumber ?? 1}</span>
            <span className="font-silk text-[var(--accent)]">{ui?.contextHint ?? ""}</span>
          </div>
        </Panel>
      </div>

      {/* ---------------- BOTTOM RIGHT: how it's drawn ---------------- */}
      <div className="pointer-events-none absolute bottom-2 right-2 sm:bottom-4 sm:right-4">
        <Panel className="pointer-events-auto max-w-[260px] px-3 py-2 sm:max-w-[300px]">
          <button
            className="flex w-full items-center justify-between font-silk text-[10px] uppercase text-[var(--accent)]"
            onClick={() => setShowDrawnPanel((v) => !v)}
          >
            <span>How It's Drawn</span>
            <span>{showDrawnPanel ? "▾" : "▸"}</span>
          </button>
          {showDrawnPanel && (
            <div className="mt-2 space-y-1.5 font-mono text-[9px] leading-snug text-[var(--ink-dim)]">
              <p>
                The scene renders to a low-resolution WebGL target (nearest-neighbour filtered)
                then upscales through a custom shader for crisp pixel edges.
              </p>
              <p>
                Colours snap to a ~60-tone palette using OKLab distance (lightness weighted
                1.35×) so warm hostel beige, sunset orange and court red/blue stay distinct.
              </p>
              <p>Depth-buffer differences draw hard outlines; an optional 4×4 Bayer matrix adds dithering.</p>
              <p>Students are box-rig voxel characters animated with procedural joint rotations driven by game state.</p>
              <p>The volleyball flies on a gravity + drag simulation with net/floor/boundary collisions, resolved in 4 substeps per frame.</p>
              <p>Hemisphere + directional lighting blend between Day / Sunset / Night presets over 1.6s.</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {PALETTE_HEX.slice(0, 24).map((c, i) => (
                  <span
                    key={i}
                    className="h-3 w-3 rounded-sm border border-black/30"
                    style={{ backgroundColor: `#${c.toString(16).padStart(6, "0")}` }}
                  />
                ))}
              </div>
              <div className="border-t border-[var(--panel-border)] pt-1.5">
                <CreatorCredit compact />
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ---------------- MOBILE CONTROLS ---------------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-2 sm:hidden">
        <DPad onMove={setMove} />
        <div className="pointer-events-auto grid grid-cols-2 gap-2">
          <ActionBtn label="JUMP" onPress={() => withGame((g) => g.mobileAction("jump"))} />
          <ActionBtn label="SWITCH" onPress={() => withGame((g) => g.switchPlayer(1))} />
          <ActionBtn label="BUMP" onPress={() => withGame((g) => g.mobileAction("bump"))} />
          <ActionBtn label="SET" onPress={() => withGame((g) => g.mobileAction("set"))} />
          <ActionBtn label="SPIKE" onPress={() => withGame((g) => g.mobileAction("spike"))} wide />
        </div>
      </div>

      {/* ---------------- INTRO OVERLAY ---------------- */}
      {notStarted && !showPauseMenu && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/55">
          <Panel className="max-w-sm px-6 py-6 text-center">
            <h2 className="font-silk text-lg text-[var(--accent)]">HOSTEL 7 VOLLEYBALL</h2>
            <p className="mt-2 font-mono text-xs text-[var(--ink-dim)]">
              A pixel-art evening rally beside the Hostel 7 court, BIT Mesra. 3v3 rally-point
              volleyball — control one player, lead RED to 2 sets.
            </p>
            <button
              onClick={handleStart}
              className="mt-4 w-full rounded border-2 border-[var(--accent)] bg-[var(--accent)] py-2 font-silk text-xs uppercase text-[var(--accent-ink)]"
            >
              Start Match
            </button>
            <div className="mt-4 border-t border-[var(--panel-border)] pt-3">
              <CreatorCredit />
            </div>
          </Panel>
        </div>
      )}

      {/* ---------------- PAUSE MENU ---------------- */}
      {showPauseMenu && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/65">
          <Panel className="w-[90vw] max-w-sm px-5 py-5">
            <div className="mb-3 flex gap-2">
              <SegButton active={pauseTab === "menu"} onClick={() => setPauseTab("menu")}>
                Pause
              </SegButton>
              <SegButton active={pauseTab === "credits"} onClick={() => setPauseTab("credits")}>
                Credits
              </SegButton>
            </div>
            {pauseTab === "menu" ? (
              <div className="space-y-2">
                <h3 className="font-silk text-sm text-[var(--accent)]">MATCH PAUSED</h3>
                <button
                  onClick={() => {
                    withGame((g) => {
                      g.paused = false;
                    });
                    setShowPauseMenu(false);
                  }}
                  className="w-full rounded border-2 border-[var(--accent)] bg-[var(--accent)] py-2 font-mono text-xs font-bold uppercase text-[var(--accent-ink)]"
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    handleRestart();
                    setShowPauseMenu(false);
                  }}
                  className="w-full rounded border-2 border-[var(--panel-border)] py-2 font-mono text-xs font-bold uppercase text-[var(--ink)]"
                >
                  Restart Match
                </button>
                <p className="pt-2 font-mono text-[9px] text-[var(--ink-dim)]">
                  Rally-point scoring to 15 (win by 2) · Best of 3 sets · WASD to move, J/K/L to
                  play the ball.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <h3 className="font-silk text-sm text-[var(--accent)]">HOSTEL 7 VOLLEYBALL</h3>
                <p className="font-mono text-[10px] text-[var(--ink-dim)]">
                  An original voxel/pixel-art tribute to evening volleyball rallies outside
                  Hostel 7, BIT Mesra, Ranchi.
                </p>
                <div className="rounded border border-[var(--panel-border)] py-3">
                  <CreatorCredit />
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ---------------- MATCH OVER OVERLAY ---------------- */}
      {phase === "match-over" && ui?.winner && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-lg border-4 border-[var(--accent)] bg-black/70 px-8 py-6 text-center">
            <div className="font-silk text-2xl text-[var(--accent)]">VICTORY!</div>
            <div
              className={cn(
                "mt-1 font-silk text-lg",
                ui.winner === "RED" ? "text-[var(--team-red)]" : "text-[var(--team-blue)]"
              )}
            >
              {ui.winner} TEAM WINS THE MATCH
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DPad({ onMove }: { onMove: (x: number, z: number) => void }) {
  const active = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const press = (x: number, z: number) => {
    active.current = { x, z };
    onMove(x, z);
  };
  const release = () => {
    active.current = { x: 0, z: 0 };
    onMove(0, 0);
  };
  const btn = "pointer-events-auto flex h-9 w-9 items-center justify-center rounded border-2 border-[var(--panel-border)] bg-[var(--panel-bg)] font-mono text-sm text-[var(--ink)] active:bg-[var(--accent)]";
  return (
    <div className="pointer-events-none grid grid-cols-3 grid-rows-3 gap-1">
      <div />
      <button className={btn} onPointerDown={() => press(0, -1)} onPointerUp={release} onPointerLeave={release}>↑</button>
      <div />
      <button className={btn} onPointerDown={() => press(-1, 0)} onPointerUp={release} onPointerLeave={release}>←</button>
      <div />
      <button className={btn} onPointerDown={() => press(1, 0)} onPointerUp={release} onPointerLeave={release}>→</button>
      <div />
      <button className={btn} onPointerDown={() => press(0, 1)} onPointerUp={release} onPointerLeave={release}>↓</button>
      <div />
    </div>
  );
}

function ActionBtn({ label, onPress, wide }: { label: string; onPress: () => void; wide?: boolean }) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className={cn(
        "pointer-events-auto rounded border-2 border-[var(--accent)] bg-[var(--panel-bg)] py-2 font-silk text-[9px] uppercase text-[var(--accent)] active:bg-[var(--accent)] active:text-[var(--accent-ink)]",
        wide && "col-span-2"
      )}
    >
      {label}
    </button>
  );
}
